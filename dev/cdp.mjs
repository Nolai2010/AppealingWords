#!/usr/bin/env node
/**
 * dev/cdp.mjs — 极简 Chrome DevTools Protocol 客户端（零依赖，Node 24 全局 WebSocket）
 *
 * 能力：
 *   - 启动/连接 Edge：launchEdge({ headless, port, userDataDir, edgePath })
 *     · 使用 --remote-debugging-port=0 + DevToolsActivePort 自动取端口
 *     · 结束后 close() 会杀掉整棵 Edge 进程树并清理临时 profile
 *   - CDP.connect(wsUrl)：浏览器级连接
 *   - cdp.newPage() → CDPSession：开标签页并 attach（flatten）
 *   - session.evaluate(expression)         Runtime.evaluate（awaitPromise / returnByValue）
 *   - session.waitFor(expression, opts)    轮询等待 JS 条件为真
 *   - session.navigate(url) / reload()     Page.navigate / Page.reload 并等待 readyState=complete
 *   - session.screenshot(filePath)         Page.captureScreenshot → 写 PNG
 *   - session.setViewport({width,height,mobile,deviceScaleFactor})
 *                                          Emulation.setDeviceMetricsOverride + touch
 *   - session.setUserAgent(ua, {platform}) Network.setUserAgentOverride + Emulation 覆盖
 *   - session.on(event, fn)                订阅该标签页事件（如 Runtime.consoleAPICalled）
 *   - cdp.on(event, fn)                    订阅浏览器级事件
 *
 * 契约：dev/contracts.md §1（Edge 启动参数）、§7（cdp.mjs 能力清单）
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 常见 Edge 安装位置；也可用 EDGE_PATH 环境变量指定。 */
export function edgeCandidates() {
  return [
    process.env.EDGE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
}

/**
 * 找 msedge.exe。显式传入的路径必须存在（不会静默回退，避免测试误用别的浏览器）。
 */
export function findEdgeExecutable(explicitPath) {
  if (explicitPath) {
    if (fs.existsSync(explicitPath)) return explicitPath;
    throw new Error(`找不到指定的 Edge 可执行文件：${explicitPath}`);
  }
  for (const candidate of edgeCandidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`找不到 msedge.exe。已尝试：\n${edgeCandidates().join('\n')}\n可用环境变量 EDGE_PATH 指定路径。`);
}

/**
 * 构造 Edge 启动参数（契约 §1 模板 + CDP 必需项）。
 */
export function buildEdgeArgs({ port = 0, headless = true, userDataDir } = {}) {
  if (!userDataDir) throw new Error('buildEdgeArgs 需要 userDataDir');
  const args = [];
  if (headless) args.push('--headless=new');
  args.push(
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-extensions',
    '--disable-default-apps',
    '--disable-component-update',
    '--mute-audio',
    '--hide-crash-restore-bubble',
    '--disable-breakpad',
    '--disable-features=Translate,BackForwardCache,OptimizationHints,MediaRouter',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,720',
    'about:blank',
  );
  return args;
}

/**
 * 读取一次 DevToolsActivePort（Edge --remote-debugging-port=0 时写入 user-data-dir）。
 * 文件首行是端口，第二行是 browser 的 ws 路径。
 */
export async function readDevToolsActivePortOnce(userDataDir) {
  const file = path.join(userDataDir, 'DevToolsActivePort');
  let raw;
  try {
    raw = await fsp.readFile(file, 'utf8');
  } catch {
    return null;
  }
  const lines = raw.split(/\r?\n/).map((line) => line.trim());
  const port = Number(lines[0]);
  if (!Number.isInteger(port) || port <= 0) return null;
  return { port, browserPath: lines[1] || '' };
}

/** 轮询 /json/version 拿 browser WebSocket URL。 */
export async function fetchBrowserVersion(port, { timeout = 15000 } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    const remaining = Math.max(500, deadline - Date.now());
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(Math.min(3000, remaining)),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.webSocketDebuggerUrl) return json;
        lastError = new Error('/json/version 缺少 webSocketDebuggerUrl');
      } else {
        lastError = new Error(`/json/version HTTP ${res.status}`);
      }
    } catch (err) {
      lastError = err;
    }
    await sleep(100);
  }
  throw new Error(`读取 DevTools 版本信息失败（port ${port}）：${lastError?.message || 'timeout'}`);
}

// ---------------------------------------------------------------------------
// CDP 客户端
// ---------------------------------------------------------------------------

export class CDP {
  static async connect(wsUrl, { timeout = 15000 } = {}) {
    const cdp = new CDP(wsUrl);
    await cdp._connect(timeout);
    return cdp;
  }

  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this._nextId = 0;
    this._pending = new Map();
    this._listeners = new Map();
    this._closeHandlers = new Set();
    this.closed = false;
  }

  _connect(timeout) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          this.ws?.close();
        } catch {
          /* ignore */
        }
        reject(new Error(`CDP WebSocket 连接超时（${timeout}ms）：${this.wsUrl}`));
      }, timeout);

      let ws;
      try {
        ws = new WebSocket(this.wsUrl);
      } catch (err) {
        clearTimeout(timer);
        reject(new Error(`无法创建 CDP WebSocket：${err?.message || err}`));
        return;
      }
      this.ws = ws;

      ws.addEventListener('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      });

      ws.addEventListener('error', (event) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`CDP WebSocket 连接失败：${event?.message || event?.error?.message || 'unknown error'}（${this.wsUrl}）`));
      });

      ws.addEventListener('close', () => {
        this.closed = true;
        for (const [id, pending] of this._pending.entries()) {
          this._pending.delete(id);
          pending.reject(new Error(`CDP 连接已关闭（等待 ${pending.method} 时断开）`));
        }
        for (const handler of [...this._closeHandlers]) {
          try {
            handler();
          } catch {
            /* ignore */
          }
        }
      });

      ws.addEventListener('message', (event) => {
        const text = typeof event.data === 'string' ? event.data : String(event.data ?? '');
        this._onMessage(text);
      });
    });
  }

  _onMessage(text) {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }

    if (msg.id !== undefined && msg.id !== null) {
      const pending = this._pending.get(msg.id);
      if (!pending) return;
      this._pending.delete(msg.id);
      if (pending.timer) clearTimeout(pending.timer);
      if (msg.error) {
        const err = new Error(`CDP ${pending.method} 失败：${msg.error.message} (code ${msg.error.code})`);
        err.code = msg.error.code;
        err.data = msg.error.data;
        pending.reject(err);
      } else {
        pending.resolve(msg.result ?? {});
      }
      return;
    }

    const event = { method: msg.method, params: msg.params ?? {}, sessionId: msg.sessionId };
    const exact = this._listeners.get(msg.method);
    if (exact) {
      for (const fn of [...exact]) {
        try {
          fn(event);
        } catch {
          /* ignore listener errors */
        }
      }
    }
    const wildcard = this._listeners.get('*');
    if (wildcard) {
      for (const fn of [...wildcard]) {
        try {
          fn(event);
        } catch {
          /* ignore */
        }
      }
    }
  }

  /** 订阅事件；event 为 CDP 方法名，'*' 表示全部。返回取消函数。 */
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this._listeners.get(event)?.delete(fn);
  }

  onClose(fn) {
    this._closeHandlers.add(fn);
    return () => this._closeHandlers.delete(fn);
  }

  /**
   * 发送 CDP 命令。
   * @param {string} method
   * @param {object} [params]
   * @param {{sessionId?: string, timeout?: number}} [opts]
   */
  send(method, params = {}, { sessionId, timeout = 30000 } = {}) {
    if (this.closed) return Promise.reject(new Error(`CDP 连接已关闭，无法发送 ${method}`));
    const id = ++this._nextId;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      const timer = timeout > 0
        ? setTimeout(() => {
            this._pending.delete(id);
            reject(new Error(`CDP ${method} 超时（${timeout}ms）`));
          }, timeout)
        : null;
      this._pending.set(id, { method, resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (err) {
        this._pending.delete(id);
        if (timer) clearTimeout(timer);
        reject(new Error(`CDP 发送失败 ${method}: ${err?.message || err}`));
      }
    });
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }

  /**
   * 新建标签页并 attach，返回 CDPSession。
   * @param {{url?: string, enable?: boolean}} [opts]
   */
  async newPage({ url = 'about:blank', enable = true } = {}) {
    const created = await this.send('Target.createTarget', { url });
    const targetId = created.targetId;
    const attached = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const session = new CDPSession(this, attached.sessionId, targetId);
    if (enable) await session.enable();
    if (url && url !== 'about:blank') await session.navigate(url);
    return session;
  }
}

export class CDPSession {
  constructor(cdp, sessionId, targetId) {
    this.cdp = cdp;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this._listeners = new Map();
    this._wired = false;
    this._unwire = null;
  }

  _ensureWired() {
    if (this._wired) return;
    this._wired = true;
    this._unwire = this.cdp.on('*', (event) => {
      if (event.sessionId !== this.sessionId) return;
      const handlers = this._listeners.get(event.method);
      if (handlers) {
        for (const fn of [...handlers]) {
          try {
            fn(event);
          } catch {
            /* ignore */
          }
        }
      }
    });
  }

  /** 订阅本标签页事件，返回取消函数。 */
  on(event, fn) {
    this._ensureWired();
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this._listeners.get(event)?.delete(fn);
  }

  once(event, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`等待 CDP 事件 ${event} 超时（${timeout}ms）`));
      }, timeout);
      const off = this.on(event, (msg) => {
        clearTimeout(timer);
        off();
        resolve(msg);
      });
    });
  }

  send(method, params = {}, timeout = 30000) {
    return this.cdp.send(method, params, { sessionId: this.sessionId, timeout });
  }

  async enable() {
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('Network.enable');
    await this.send('Log.enable').catch(() => {});
    await this.send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {});
  }

  /**
   * 执行 JS 表达式并返回 JSON 值。
   * @param {string} expression
   * @param {{awaitPromise?: boolean, returnByValue?: boolean, timeout?: number, userGesture?: boolean}} [opts]
   */
  async evaluate(expression, { awaitPromise = true, returnByValue = true, timeout = 30000, userGesture = false } = {}) {
    const res = await this.send(
      'Runtime.evaluate',
      { expression, awaitPromise, returnByValue, userGesture },
      timeout,
    );
    if (res?.exceptionDetails) {
      const detail =
        res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        JSON.stringify(res.exceptionDetails).slice(0, 400);
      throw new Error(`页面 JS 异常：${detail}`);
    }
    const remote = res?.result || {};
    if (remote.type === 'undefined') return undefined;
    if (Object.prototype.hasOwnProperty.call(remote, 'value')) return remote.value;
    if (remote.unserializableValue !== undefined) return remote.unserializableValue;
    return remote;
  }

  /**
   * 轮询等待 JS 表达式为真（执行上下文切换等临时错误会重试）。
   * @param {string} expression
   * @param {{timeout?: number, interval?: number, description?: string}} [opts]
   */
  async waitFor(expression, { timeout = 15000, interval = 100, description } = {}) {
    const label = description || expression;
    const started = Date.now();
    let lastError = null;
    while (Date.now() - started < timeout) {
      try {
        const value = await this.evaluate(`Boolean(${expression})`, {
          awaitPromise: true,
          timeout: Math.min(10000, Math.max(1000, timeout)),
        });
        if (value) return true;
      } catch (err) {
        lastError = err;
      }
      await sleep(interval);
    }
    const suffix = lastError ? `；最近一次错误：${lastError.message}` : '';
    throw new Error(`等待条件超时（${timeout}ms）：${label}${suffix}`);
  }

  /** 等待 document.readyState === 'complete' 且 URL 前缀匹配。 */
  async waitForDocumentReady(url, timeout = 30000) {
    const normalized = String(url).split('#')[0].replace(/\/+$/, '');
    const condition = url
      ? `document.readyState === "complete" && location.href.split("#")[0].replace(/\\/+$/, "").startsWith(${JSON.stringify(normalized)})`
      : 'document.readyState === "complete"';
    await this.waitFor(condition, { timeout, description: `document ready: ${url || 'current'}` });
    await sleep(20);
  }

  /** 导航并等待加载完成。 */
  async navigate(url, { timeout = 30000 } = {}) {
    const res = await this.send('Page.navigate', { url }, timeout);
    if (res?.errorText) throw new Error(`导航失败（${url}）：${res.errorText}`);
    await this.waitForDocumentReady(url, timeout);
    return res;
  }

  /** 刷新并等待新文档就绪（用 window 标记避免误判旧文档）。 */
  async reload({ timeout = 30000 } = {}) {
    await this.evaluate('window.__qaCdpReloadMark = true; true').catch(() => {});
    await this.send('Page.reload', { ignoreCache: true }, timeout);
    await this.waitFor('document.readyState === "complete" && !window.__qaCdpReloadMark', {
      timeout,
      description: '重新加载后的 document ready',
    });
    await sleep(30);
  }

  /**
   * 截图到文件。
   * @param {string|null} filePath
   * @param {{format?: 'png'|'jpeg', quality?: number, captureBeyondViewport?: boolean, timeout?: number}} [opts]
   */
  async screenshot(filePath, { format = 'png', quality, captureBeyondViewport = false, timeout = 30000 } = {}) {
    const params = { format, fromSurface: true, captureBeyondViewport };
    if (quality !== undefined) params.quality = quality;
    const res = await this.send('Page.captureScreenshot', params, timeout);
    if (!res?.data) throw new Error('Page.captureScreenshot 未返回图片数据');
    const buffer = Buffer.from(res.data, 'base64');
    if (filePath) {
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      await fsp.writeFile(filePath, buffer);
    }
    return { buffer, file: filePath || null };
  }

  /**
   * 设置视口 + 设备模拟（契约 §8.11）。
   * @param {{width:number, height:number, deviceScaleFactor?:number, mobile?:boolean, screenOrientation?:object}} opts
   */
  async setViewport({ width, height, deviceScaleFactor = 1, mobile = false, screenOrientation } = {}) {
    if (!width || !height) throw new Error('setViewport 需要 width/height');
    const orientation =
      screenOrientation ||
      { type: width >= height ? 'landscapePrimary' : 'portraitPrimary', angle: width >= height ? 90 : 0 };
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile,
      screenOrientation: orientation,
    });
    await this.send('Emulation.setTouchEmulationEnabled', {
      enabled: Boolean(mobile),
      maxTouchPoints: mobile ? 5 : 1,
    }).catch(() => {});
  }

  /**
   * 覆盖 UA（Network.setUserAgentOverride 为主；Emulation 层兜底 navigator.userAgent）。
   */
  async setUserAgent(userAgent, { platform = 'Win32', acceptLanguage = 'zh-CN,zh;q=0.9,en;q=0.8' } = {}) {
    if (!userAgent) throw new Error('setUserAgent 需要非空 UA');
    await this.send('Network.setUserAgentOverride', { userAgent, acceptLanguage, platform });
    await this.send('Emulation.setUserAgentOverride', { userAgent, acceptLanguage, platform }).catch(() => {});
  }

  /** 清除 UA 覆盖（恢复浏览器默认）。 */
  async clearUserAgent() {
    await this.send('Network.setUserAgentOverride', { userAgent: '' }).catch(() => {});
    await this.send('Emulation.setUserAgentOverride', { userAgent: '' }).catch(() => {});
  }

  async closeTarget() {
    await this.cdp.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {});
  }

  close() {
    try {
      this._unwire?.();
    } catch {
      /* ignore */
    }
    this._unwire = null;
    this._wired = false;
  }
}

// ---------------------------------------------------------------------------
// Edge 启动 / 清理
// ---------------------------------------------------------------------------

function tail(lines, count = 12) {
  return lines.slice(-count).join('\n');
}

/**
 * 启动无头 Edge 并连接 CDP（失败会自动清理进程与临时 profile）。
 * 真正的实现是 launchEdgeUnchecked；launchEdge 负责失败兜底清理。
 * @param {{port?:number, headless?:boolean, userDataDir?:string, edgePath?:string, extraArgs?:string[],
 *          startupTimeout?:number, env?:object, keepProfile?:boolean}} [opts]
 * @returns {Promise<{cdp:CDP, process:import('node:child_process').ChildProcess, pid:number, port:number,
 *          userDataDir:string, wsUrl:string, executable:string, args:string[], stderrLines:string[],
 *          browserVersion:object|null, close:()=>Promise<void>}>}
 */
export async function launchEdge(options = {}) {
  const state = {
    child: null,
    cdp: null,
    profileDir: null,
    keepProfile: Boolean(options.keepProfile),
  };
  try {
    return await launchEdgeUnchecked(options, state);
  } catch (err) {
    await cleanupLaunchState(state);
    throw err;
  }
}

async function launchEdgeUnchecked({
  port = 0,
  headless = true,
  userDataDir,
  edgePath,
  extraArgs = [],
  startupTimeout = 30000,
  env,
  keepProfile = false,
} = {}, launchState = {}) {
  const executable = findEdgeExecutable(edgePath);
  const profileDir =
    userDataDir || path.join(__dirname, '.edge-profile', `qa-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  await fsp.mkdir(profileDir, { recursive: true });
  launchState.profileDir = profileDir;
  const tmpDir = path.join(profileDir, 'tmp');
  await fsp.mkdir(tmpDir, { recursive: true });

  const args = [...buildEdgeArgs({ port, headless, userDataDir: profileDir }), ...extraArgs];
  const stderrLines = [];
  const collect = (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      stderrLines.push(line.trim());
      while (stderrLines.length > 160) stderrLines.shift();
    }
  };

  let child;
  try {
    child = spawn(executable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, ...(env || {}), TEMP: tmpDir, TMP: tmpDir },
    });
  } catch (err) {
    throw new Error(`无法启动 Edge（${executable}）：${err?.message || err}`);
  }

  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);
  launchState.child = child;

  let exitInfo = null;
  let spawnError = null;
  const exited = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      exitInfo = { code, signal };
      resolve(exitInfo);
    });
  });
  child.once('error', (err) => {
    spawnError = err;
  });

  const makeLaunchError = (reason) => {
    const parts = [`Edge 启动失败：${reason}`];
    parts.push(`可执行文件：${executable}`);
    parts.push(`退出码：${exitInfo?.code ?? 'null'}${exitInfo?.signal ? `，信号：${exitInfo.signal}` : ''}`);
    if (spawnError) parts.push(`spawn 错误：${spawnError.message}`);
    const errTail = tail(stderrLines);
    if (errTail) parts.push(`Edge stderr（末尾）：\n${errTail}`);
    if (/0x80000003|Access is denied|拒绝访问|crashpad|CreateFile/i.test(errTail)) {
      parts.push(
        '提示：这是受限沙箱下的已知环境限制（契约 §1：Edge 在普通沙箱崩溃 0x80000003）。' +
          '请用带完全权限（danger-full-access）的 shell 运行浏览器部分。',
      );
    }
    return new Error(parts.join('\n'));
  };

  // 等待 DevToolsActivePort
  const startedAt = Date.now();
  let activePort = null;
  while (Date.now() - startedAt < startupTimeout) {
    if (spawnError) throw makeLaunchError('无法 spawn 进程');
    if (exitInfo) throw makeLaunchError('进程提前退出');
    try {
      activePort = await readDevToolsActivePortOnce(profileDir);
    } catch {
      activePort = null;
    }
    if (activePort) break;
    await sleep(120);
  }
  if (!activePort) throw makeLaunchError(`${startupTimeout}ms 内未写入 DevToolsActivePort`);

  const version = await fetchBrowserVersion(activePort.port, { timeout: 15000 });
  const wsUrl = version.webSocketDebuggerUrl;
  const cdp = await CDP.connect(wsUrl, { timeout: 15000 });
  launchState.cdp = cdp;

  let closed = false;
  const killTree = () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } else {
        child.kill('SIGKILL');
      }
    } catch {
      /* ignore */
    }
  };

  const exitHandler = () => killTree();
  process.once('exit', exitHandler);

  const handle = {
    cdp,
    process: child,
    pid: child.pid,
    port: activePort.port,
    userDataDir: profileDir,
    wsUrl,
    executable,
    args,
    stderrLines,
    browserVersion: version,
    get exited() {
      return Boolean(exitInfo);
    },
    /**
     * 关闭：先尝试 Browser.close，再杀进程树，最后清理临时 profile。
     */
    async close({ timeout = 8000 } = {}) {
      if (closed) return;
      closed = true;
      try {
        await Promise.race([cdp.send('Browser.close', {}, { timeout: 2000 }).catch(() => {}), sleep(1500)]);
      } catch {
        /* ignore */
      }
      await sleep(150);
      killTree();
      await Promise.race([exited, sleep(timeout)]);
      process.removeListener('exit', exitHandler);
      cdp.close();
      if (!keepProfile) {
        for (let attempt = 0; attempt < 8; attempt++) {
          try {
            await fsp.rm(profileDir, { recursive: true, force: true, maxRetries: 2 });
            break;
          } catch {
            await sleep(200);
          }
        }
      }
    },
  };

  return handle;
}

/** launchEdge 失败兜底：关闭 CDP、杀掉 Edge 进程树、删除临时 profile。 */
async function cleanupLaunchState(state) {
  if (!state) return;
  try {
    state.cdp?.close?.();
  } catch {
    /* ignore */
  }
  try {
    const child = state.child;
    if (child && child.exitCode === null && child.signalCode === null) {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } else {
        child.kill('SIGKILL');
      }
    }
  } catch {
    /* ignore */
  }
  await sleep(150);
  if (state.profileDir && !state.keepProfile) {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await fsp.rm(state.profileDir, { recursive: true, force: true, maxRetries: 2 });
        return;
      } catch {
        await sleep(150);
      }
    }
  }
}
