#!/usr/bin/env node
/**
 * dev/selftest-cdp.mjs — cdp.mjs 协议层自测（不需要真实 Edge）
 *
 * 做法：起一个假 CDP HTTP+WebSocket 服务器（手写最小 WS 帧编解码），
 * 让 cdp.mjs 的 connect / newPage / evaluate / waitFor / navigate / reload /
 * screenshot / setViewport / setUserAgent / 事件订阅 / 错误处理 全链路跑一遍。
 *
 * 真实 Edge 启动需要完全权限（danger-full-access）的 shell，受限沙箱会 0x80000003；
 * 这里用假服务器覆盖协议逻辑，真实浏览器端到端由 dev/qa.mjs 在全权限会话执行。
 *
 * 用法：node dev/selftest-cdp.mjs
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CDP,
  buildEdgeArgs,
  readDevToolsActivePortOnce,
  launchEdge,
  sleep,
} from './cdp.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TMP_DIR = path.join(__dirname, '.edge-profile', `selftest-cdp-${process.pid}`);

let passed = 0;
const failures = [];

function ok(cond, name, detail = '') {
  if (cond) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failures.push(name);
    console.log(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}
function eq(actual, expected, name) {
  const same = Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected);
  ok(same, name, !same ? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` : '');
}
function includes(haystack, needle, name) {
  const text = String(haystack ?? '');
  ok(text.includes(needle), name, `未找到 ${JSON.stringify(needle)}；实际：${JSON.stringify(text.slice(0, 300))}`);
}
function rejects(promise, pattern, name) {
  return promise.then(
    () => ok(false, name, '期望 reject，实际 resolve'),
    (err) => ok(pattern.test(String(err?.message || err)), name, `错误信息不匹配：${err?.message || err}`),
  );
}

// ---------------------------------------------------------------------------
// 最小 WebSocket 服务器（仅文本帧，够 CDP 用）
// ---------------------------------------------------------------------------

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeWsFrame(payload, opcode = 0x1) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x80 | opcode, data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  return Buffer.concat([header, data]);
}

function createFakeCdpServer() {
  const state = {
    calls: [],
    port: 0,
    targetId: 'FAKE-TARGET-1',
    sessionId: 'FAKE-SESSION-1',
    conn: null,
    closed: false,
  };

  const sendText = (conn, text) => {
    if (!conn || conn.socket.destroyed) return;
    try {
      conn.socket.write(encodeWsFrame(text, 0x1));
    } catch {
      /* ignore */
    }
  };

  const sendEvent = (conn, method, params = {}, sessionId) => {
    const msg = { method, params };
    if (sessionId) msg.sessionId = sessionId;
    sendText(conn, JSON.stringify(msg));
  };

  const handleCall = (msg) => {
    const conn = state.conn;
    state.calls.push(msg);
    const { id, method, params = {} } = msg;
    const respond = (result) => sendText(conn, JSON.stringify({ id, result: result ?? {} }));
    const respondError = (code, message) => sendText(conn, JSON.stringify({ id, error: { code, message } }));

    switch (method) {
      case 'Target.createTarget':
        return respond({ targetId: state.targetId });
      case 'Target.attachToTarget':
        return respond({ sessionId: state.sessionId });
      case 'Target.closeTarget':
        return respond({ success: true });
      case 'Runtime.enable':
        respond({});
        // 故意在 enable 后立刻推一个事件，验证事件路由（测试会先订阅再 newPage）
        setTimeout(() => {
          sendEvent(
            state.conn,
            'Runtime.consoleAPICalled',
            { type: 'log', args: [{ type: 'string', value: 'fake-log' }], timestamp: Date.now() / 1000, executionContextId: 1 },
            state.sessionId,
          );
        }, 5);
        return undefined;
      case 'Page.enable':
      case 'Network.enable':
      case 'Log.enable':
      case 'Network.setCacheDisabled':
      case 'Emulation.setTouchEmulationEnabled':
      case 'Emulation.setDeviceMetricsOverride':
      case 'Network.setUserAgentOverride':
      case 'Emulation.setUserAgentOverride':
        return respond({});
      case 'Page.navigate':
        respond({ frameId: 'FAKE-FRAME-1', loaderId: 'FAKE-LOADER-1' });
        setTimeout(() => sendEvent(state.conn, 'Page.loadEventFired', { timestamp: Date.now() / 1000 }, state.sessionId), 10);
        return undefined;
      case 'Page.reload':
        respond({});
        setTimeout(() => sendEvent(state.conn, 'Page.loadEventFired', { timestamp: Date.now() / 1000 }, state.sessionId), 10);
        return undefined;
      case 'Page.captureScreenshot':
        return respond({ data: TINY_PNG_BASE64 });
      case 'Runtime.evaluate': {
        const expression = String(params.expression || '');
        if (expression.includes('__throw__')) {
          return respond({
            result: { type: 'object', subtype: 'error' },
            exceptionDetails: { text: 'Uncaught Error: boom', exception: { description: 'Error: boom' } },
          });
        }
        if (/Boolean\(false\)/.test(expression)) return respond({ result: { type: 'boolean', value: false } });
        if (/1\s*\+\s*2/.test(expression)) return respond({ result: { type: 'number', value: 3 } });
        if (/document\.readyState/.test(expression)) return respond({ result: { type: 'string', value: 'complete' } });
        if (/location\.href/.test(expression)) return respond({ result: { type: 'string', value: 'http://127.0.0.1:8788/' } });
        if (/window\.__qaCdpReloadMark\s*=/.test(expression)) return respond({ result: { type: 'boolean', value: true } });
        return respond({ result: { type: 'string', value: 'fake-result' } });
      }
      case 'Browser.close':
        respond({});
        setTimeout(() => {
          try {
            state.conn?.socket.end();
          } catch {
            /* ignore */
          }
        }, 30);
        return undefined;
      default:
        return respondError(-32601, `'${method}' wasn't found`);
    }
  };

  const drainFrames = (conn) => {
    for (;;) {
      const buf = conn.buffer;
      if (buf.length < 2) return;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let length = buf[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buf.length < 4) return;
        length = buf.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buf.length < 10) return;
        length = Number(buf.readBigUInt64BE(2));
        offset = 10;
      }
      let mask = null;
      if (masked) {
        if (buf.length < offset + 4) return;
        mask = buf.subarray(offset, offset + 4);
        offset += 4;
      }
      if (buf.length < offset + length) return;
      const payload = Buffer.from(buf.subarray(offset, offset + length));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      conn.buffer = buf.subarray(offset + length);

      if (opcode === 0x8) {
        try {
          conn.socket.end();
        } catch {
          /* ignore */
        }
        return;
      }
      if (opcode === 0x9) {
        // ping → pong
        try {
          conn.socket.write(encodeWsFrame(payload, 0xa));
        } catch {
          /* ignore */
        }
        continue;
      }
      if (opcode === 0x1) {
        try {
          handleCall(JSON.parse(payload.toString('utf8')));
        } catch {
          /* ignore bad json */
        }
      }
    }
  };

  const server = http.createServer((req, res) => {
    if (req.url === '/json/version') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          Browser: 'FakeEdge/1.0',
          'Protocol-Version': '1.3',
          webSocketDebuggerUrl: `ws://127.0.0.1:${state.port}/devtools/browser/fake`,
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });

  server.on('upgrade', (req, socket, head) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    const conn = { socket, buffer: Buffer.alloc(0) };
    state.conn = conn;
    socket.on('data', (chunk) => {
      conn.buffer = Buffer.concat([conn.buffer, chunk]);
      drainFrames(conn);
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      if (state.conn === conn) state.conn = null;
    });
    if (head && head.length) {
      conn.buffer = Buffer.concat([conn.buffer, head]);
      drainFrames(conn);
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      state.port = server.address().port;
      resolve({
        port: state.port,
        state,
        close() {
          state.closed = true;
          try {
            state.conn?.socket.destroy();
          } catch {
            /* ignore */
          }
          return new Promise((res) => server.close(() => res()));
        },
      });
    });
  });
}

// 1x1 透明 PNG
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// ---------------------------------------------------------------------------

await fsp.rm(TMP_DIR, { recursive: true, force: true });
await fsp.mkdir(TMP_DIR, { recursive: true });

let fake = null;
let cdp = null;
let page = null;

try {
  // ---- 1. buildEdgeArgs / readDevToolsActivePortOnce（纯函数） ----
  {
    const args = buildEdgeArgs({ port: 0, headless: true, userDataDir: 'C:\\tmp\\qa-profile' });
    includes(args.join(' '), '--headless=new', 'Edge 参数含 --headless=new');
    includes(args.join(' '), '--no-sandbox', 'Edge 参数含 --no-sandbox');
    includes(args.join(' '), '--disable-gpu', 'Edge 参数含 --disable-gpu');
    includes(args.join(' '), '--no-first-run', 'Edge 参数含 --no-first-run');
    includes(args.join(' '), '--remote-debugging-port=0', 'Edge 参数含 --remote-debugging-port=0');
    includes(args.join(' '), '--user-data-dir=C:\\tmp\\qa-profile', 'Edge 参数含 --user-data-dir');
    includes(args.join(' '), '--no-default-browser-check', 'Edge 参数含 --no-default-browser-check');
    ok(args[args.length - 1] === 'about:blank', 'Edge 参数以 about:blank 结尾');

    const profileDir = path.join(TMP_DIR, 'profile-a');
    await fsp.mkdir(profileDir, { recursive: true });
    await fsp.writeFile(path.join(profileDir, 'DevToolsActivePort'), '12345\n/devtools/browser/fake-guid\r\n');
    const active = await readDevToolsActivePortOnce(profileDir);
    eq(active?.port, 12345, 'readDevToolsActivePortOnce 解析端口');
    eq(active?.browserPath, '/devtools/browser/fake-guid', 'readDevToolsActivePortOnce 解析 ws 路径');
    eq(await readDevToolsActivePortOnce(path.join(TMP_DIR, 'profile-missing')), null, '缺少 DevToolsActivePort 返回 null');
  }

  // ---- 2. 假 CDP 服务器 + connect ----
  fake = await createFakeCdpServer();
  const wsUrl = `ws://127.0.0.1:${fake.port}/devtools/browser/fake`;
  cdp = await CDP.connect(wsUrl, { timeout: 5000 });
  ok(cdp.ws && !cdp.closed, 'CDP.connect 建立 WebSocket');

  const consoleEvents = [];
  cdp.on('Runtime.consoleAPICalled', (event) => consoleEvents.push(event));

  page = await cdp.newPage();
  eq(page.sessionId, 'FAKE-SESSION-1', 'newPage 返回 attach 的 sessionId');
  eq(page.targetId, 'FAKE-TARGET-1', 'newPage 记录 targetId');
  const attachCall = fake.state.calls.find((c) => c.method === 'Target.attachToTarget');
  eq(attachCall?.params?.flatten, true, 'Target.attachToTarget 使用 flatten:true');

  await sleep(80);
  ok(consoleEvents.length >= 1, 'Runtime.consoleAPICalled 事件能路由到订阅者');
  eq(consoleEvents[0]?.params?.type, 'log', '事件 params 完整');
  eq(consoleEvents[0]?.sessionId, 'FAKE-SESSION-1', '事件带 sessionId');

  // ---- 3. evaluate ----
  eq(await page.evaluate('1+2'), 3, 'evaluate 返回 number 值');
  const evalCall = fake.state.calls.filter((c) => c.method === 'Runtime.evaluate').at(-1);
  eq(evalCall?.sessionId, 'FAKE-SESSION-1', 'Runtime.evaluate 带 sessionId');
  eq(evalCall?.params?.returnByValue, true, 'Runtime.evaluate returnByValue:true');
  eq(evalCall?.params?.awaitPromise, true, 'Runtime.evaluate awaitPromise:true');
  await rejects(page.evaluate('__throw__'), /boom/, 'evaluate 遇到 exceptionDetails 抛错');

  // ---- 4. waitFor ----
  await page.waitFor('document.readyState === "complete"', { timeout: 3000 });
  ok(true, 'waitFor 条件为真时返回');
  await rejects(page.waitFor('false', { timeout: 700, interval: 100 }), /等待条件超时/, 'waitFor 超时抛错');

  // ---- 5. setViewport / setUserAgent ----
  await page.setViewport({ width: 390, height: 844, mobile: true });
  const emu = fake.state.calls.filter((c) => c.method === 'Emulation.setDeviceMetricsOverride').at(-1);
  eq(emu?.params?.width, 390, 'setViewport 宽 390');
  eq(emu?.params?.height, 844, 'setViewport 高 844');
  eq(emu?.params?.mobile, true, 'setViewport mobile:true');
  eq(emu?.params?.deviceScaleFactor, 1, 'setViewport deviceScaleFactor 默认 1');
  eq(emu?.sessionId, 'FAKE-SESSION-1', 'Emulation 命令带 sessionId');

  const iphoneUA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  await page.setUserAgent(iphoneUA, { platform: 'iPhone' });
  const uaCall = fake.state.calls.filter((c) => c.method === 'Network.setUserAgentOverride').at(-1);
  eq(uaCall?.params?.userAgent, iphoneUA, 'setUserAgent 写入 Network.setUserAgentOverride');
  eq(uaCall?.params?.platform, 'iPhone', 'setUserAgent 写入 platform');

  // ---- 6. screenshot ----
  const shotPath = path.join(TMP_DIR, 'shot.png');
  const shot = await page.screenshot(shotPath);
  ok(fs.existsSync(shotPath), 'screenshot 写文件成功');
  eq(shot.buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', '截图是合法 PNG 魔数');
  const expectedPng = Buffer.from(TINY_PNG_BASE64, 'base64');
  ok(shot.buffer.equals(expectedPng), '截图内容为 CDP 返回的 base64');
  const shotCall = fake.state.calls.find((c) => c.method === 'Page.captureScreenshot');
  eq(shotCall?.params?.format, 'png', 'Page.captureScreenshot format=png');
  eq(shotCall?.params?.captureBeyondViewport, false, '截图不超出视口');

  // ---- 7. navigate / reload ----
  await page.navigate('http://127.0.0.1:8788/');
  const navCall = fake.state.calls.find((c) => c.method === 'Page.navigate');
  eq(navCall?.params?.url, 'http://127.0.0.1:8788/', 'Page.navigate URL 正确');
  await page.reload({ timeout: 3000 });
  ok(fake.state.calls.some((c) => c.method === 'Page.reload'), 'reload 发送 Page.reload');

  // ---- 8. 未知方法错误 ----
  await rejects(page.send('Fake.unknownMethod'), /-32601|wasn't found/, '未知 CDP 方法错误能被识别');

  // ---- 9. 关闭标签页 ----
  await page.closeTarget();
  ok(fake.state.calls.some((c) => c.method === 'Target.closeTarget'), 'closeTarget 发送 Target.closeTarget');

  // ---- 10. launchEdge 错误路径 ----
  await rejects(
    launchEdge({ edgePath: path.join(TMP_DIR, 'definitely-missing-msedge.exe'), startupTimeout: 2000 }),
    /找不到指定的 Edge 可执行文件/,
    'launchEdge 对不存在的显式 edgePath 报错',
  );
  await rejects(
    launchEdge({ edgePath: __filename, startupTimeout: 3000 }),
    /Edge 启动失败|无法启动 Edge|无法 spawn/,
    'launchEdge 对无法 spawn 的文件给出可诊断错误',
  );

  // ---- 11. 连接拒绝 ----
  await rejects(CDP.connect('ws://127.0.0.1:1', { timeout: 3000 }), /CDP WebSocket 连接失败|连接超时/, '连接不可用端口时拒绝');

  // ---- 12. cdp.close ----
  cdp.close();
  await sleep(100);
  ok(cdp.closed, 'cdp.close 后标记为关闭');
  await rejects(cdp.send('Runtime.evaluate', { expression: '1' }), /已关闭/, '关闭后发送命令报错');
  cdp = null;
} catch (err) {
  failures.push(`未捕获异常: ${err?.stack || err}`);
  console.error(`\n[selftest-cdp] 未捕获异常: ${err?.stack || err}`);
} finally {
  try {
    page?.close();
  } catch {
    /* ignore */
  }
  try {
    cdp?.close();
  } catch {
    /* ignore */
  }
  try {
    await fake?.close();
  } catch {
    /* ignore */
  }
  for (let i = 0; i < 5; i++) {
    try {
      await fsp.rm(TMP_DIR, { recursive: true, force: true });
      break;
    } catch {
      await sleep(100);
    }
  }
}

console.log('');
if (failures.length === 0) {
  console.log(`ALL CDP TESTS PASSED (${passed} assertions)`);
  process.exit(0);
} else {
  console.log(`CDP TESTS FAILED: ${failures.length} failed / ${passed} passed`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
