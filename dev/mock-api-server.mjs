#!/usr/bin/env node
/**
 * 无尽文游 · QA 用假 API 服务器
 * 契约见 dev/contracts.md §7。Node 原生 http，默认端口 8787。
 *
 * 支持：
 *   POST /openai/v1/chat/completions          OpenAI 协议（stream:true SSE / stream:false JSON）
 *   POST /anthropic/v1/messages               Anthropic 协议（消息事件 SSE / JSON）
 *   POST /slowopenai/v1/chat/completions      每 chunk 200ms，用于测流式与「跳过打字」
 *   POST /badopenai/v1/chat/completions       无 <story>/<choices> 标签、含 Markdown+LaTeX，用于兜底
 *   POST /emptyopenai/v1/chat/completions     空内容
 *   POST /error401openai/v1/chat/completions  401 JSON
 *   POST /error401anthropic/v1/messages       401 JSON（补充，便于测 Anthropic 错误兜底）
 *   GET  /logs                                最近 50 条请求记录（数组，按时间升序）
 *   POST /reset                               清空请求记录
 *   GET  /health                              健康检查（非契约要求，便于等待就绪）
 *
 * 另：所有响应都带 CORS 头，OPTIONS 一律 204。
 *
 * 回合数：按请求 messages 中 assistant 消息数量 + 1 生成不同正文，正文里带回合序号。
 * 语言：请求 system prompt / 消息中出现 CJK 字符则返回中文，否则英文。
 * 第一回合正文包含 **加粗**、`行内代码`、> 引用、$x^2+y^2=1$、$$...$$，覆盖 Markdown/LaTeX 渲染。
 */

import http from 'node:http';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';

export const DEFAULT_PORT = 8787;
export const LOG_LIMIT = 50;

export const CORS_HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

export const OPENAI_PATH_RE = /^\/(openai|slowopenai|badopenai|emptyopenai|error401openai)\/v1\/chat\/completions$/;
export const ANTHROPIC_PATH_RE = /^\/(anthropic|error401anthropic)\/v1\/messages$/;

// ---------------------------------------------------------------------------
// 正文素材
// ---------------------------------------------------------------------------

const ZH_TURN1 = [
  '<story>',
  '夜色像一层薄墨，压在这座旧城的屋檐上。你推开客栈的木门，**潮气**与**松脂味**同时扑面而来。掌柜抬起头，掌心的`铜钥`在灯下泛出冷光。',
  '',
  '> 「规矩，是给活人定的。」他压低声音，指尖在桌面敲了三下。',
  '',
  '墙上钉着一张告示，墨迹未干：一、子时之后不得照镜；二、听见有人唤名不可应。你的目光落在落款处，那里只有一道算式：$x^2+y^2=1$，像一枚缓缓睁开的眼。',
  '',
  '$$',
  '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}',
  '$$',
  '',
  '你忽然明白，这些规则彼此咬合，像一道等待被解开的锁。夜风从门缝里钻进来，烛火晃了一晃。第 1 回合的夜色，正缓缓向你合拢。',
  '</story>',
  '<choices>',
  '1. 伸手接过那枚铜钥',
  '2. 追问掌柜告示的来历',
  '3. 推门走入夜色之中',
  '</choices>',
].join('\n');

const EN_TURN1 = [
  '<story>',
  'Night settles over the old town like a thin layer of ink. You push the inn door open, and **damp air** and **pine resin** meet you at once. The innkeeper looks up; a `brass key` glints cold in his hand.',
  '',
  '> "The rules," he murmurs, "are written for the living."',
  '',
  'A notice is nailed to the wall, its ink still wet: first, no mirrors after the midnight bell; second, never answer a voice that calls your name. Beneath it lies a single equation: $x^2+y^2=1$ — like an eye slowly opening.',
  '',
  '$$',
  '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}',
  '$$',
  '',
  'You understand, then, that these rules interlock like a lock waiting for its key. The candle gutters. Turn 1 closes quietly around you.',
  '</story>',
  '<choices>',
  '1. Take the brass key',
  '2. Ask about the notice',
  '3. Step out into the night',
  '</choices>',
].join('\n');

const ZH_TURN_N = [
  '<story>',
  '烛火忽然矮了一寸。你听见门外有极轻的脚步声，停在第三级台阶上，不动了。掌柜已经把灯芯剪短，压低声音说：「过了子时，别回头。」',
  '',
  '桌上的告示多出一行小字：`三、不可数清铜钱`。你数到第七枚时，指腹一凉——第 {{turn}} 回合，门外的脚步又挪近了一格。',
  '</story>',
  '<choices>',
  '1. 起身去开门',
  '2. 把铜钱扣在桌上，静观其变',
  '3. 吹熄烛火',
  '</choices>',
].join('\n');

const EN_TURN_N = [
  '<story>',
  'The candle sinks an inch. Outside, a footstep stops on the third stair and does not move. The innkeeper trims the wick and whispers, "After the midnight bell, do not look back."',
  '',
  'A new line has appeared on the notice: `third, never count the coins aloud`. You reach the seventh coin, and your fingertip turns cold — Turn {{turn}} begins as the door eases open.',
  '</story>',
  '<choices>',
  '1. Rise and open the door',
  '2. Cover the coins and wait',
  '3. Blow out the candle',
  '</choices>',
].join('\n');

// 慢速回合：纯文本（无 Markdown 标记），便于「跳过打字」测试整段文本比对
const ZH_SLOW = [
  '<story>',
  '慢速回合：你沿着石阶向下走，每一步都能听见水声在更深处回响。墙上的灯一盏接一盏熄灭，只剩最后一盏还亮着。路的尽头是一扇半掩的木门，门缝里漏出微弱的青光。你把手按在门板上，感到木头在轻轻震动，像是门后有什么东西正屏住呼吸，等你先开口。第 {{turn}} 回合的夜色尚未散尽，而你已经没有退路。',
  '</story>',
  '<choices>',
  '1. 推开木门',
  '2. 沿原路返回',
  '3. 贴在门板上听',
  '</choices>',
].join('\n');

const EN_SLOW = [
  '<story>',
  'A slow turn: you descend the stone stairs, and each step returns the sound of water from somewhere deeper. The lamps along the wall go out one by one, all but the last. At the end of the passage a wooden door stands ajar, leaking a pale green light. You press your palm to the planks and feel them trembling, as if something behind the door is holding its breath, waiting for you to speak first. Turn {{turn}} is not over yet, and there is no road back.',
  '</story>',
  '<choices>',
  '1. Push the door open',
  '2. Go back the way you came',
  '3. Press your ear to the planks',
  '</choices>',
].join('\n');

// 无标签正文：用于测试前端兜底（全文当故事 + 3 个保底选项）
const ZH_BAD = [
  '**雨声乍歇**，长街上只剩一盏`孤灯`。',
  '',
  '> 你听见自己的脚步声，在青石板上敲出一串回音。',
  '',
  '墙上用朱砂写着一行算式：$a^2+b^2=c^2$。',
  '',
  '$$',
  '\\int_{0}^{1} x\\,dx = \\tfrac{1}{2}',
  '$$',
  '',
  '没有人回答。雾从巷口漫过来，你只能继续向前走。',
].join('\n');

const EN_BAD = [
  '**The rain stops**, and a single `lantern` is left on the long street.',
  '',
  '> You hear your own footsteps on the wet stone.',
  '',
  'An equation is written on the wall in cinnabar: $a^2+b^2=c^2$.',
  '',
  '$$',
  '\\int_{0}^{1} x\\,dx = \\tfrac{1}{2}',
  '$$',
  '',
  'No one answers. The fog rolls in from the alley mouth, and there is only the road ahead.',
].join('\n');

// ---------------------------------------------------------------------------
// 内容生成（导出给 qa.mjs / 自测使用）
// ---------------------------------------------------------------------------

function fillTurn(template, turn) {
  return template.replaceAll('{{turn}}', String(turn));
}

/** 抓取 <story> 内文（bad/empty 变体为空串）。 */
export function splitStory(text) {
  const m = /<story>([\s\S]*?)<\/story>/.exec(text || '');
  return m ? m[1].trim() : '';
}

/** 抓取 <choices> 里的选项文本（bad/empty 变体为空数组）。 */
export function splitChoices(text) {
  const m = /<choices>([\s\S]*?)<\/choices>/.exec(text || '');
  if (!m) return [];
  return m[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+\s*[.、]/.test(line))
    .map((line) => line.replace(/^\d+\s*[.、]\s*/, '').trim());
}

/**
 * 生成一次回复。
 * @param {{lang?: 'zh'|'en', turn?: number, variant?: string}} opts
 * @returns {{text: string, story: string, choices: string[], lang: string, turn: number, variant: string}}
 */
export function buildReply({ lang = 'zh', turn = 1, variant = 'openai' } = {}) {
  const zh = lang !== 'en';
  let text;
  switch (variant) {
    case 'badopenai':
      text = zh ? ZH_BAD : EN_BAD;
      break;
    case 'emptyopenai':
      text = '';
      break;
    case 'slowopenai':
      text = fillTurn(zh ? ZH_SLOW : EN_SLOW, turn);
      break;
    case 'openai':
    case 'anthropic':
    default:
      text = turn <= 1 ? (zh ? ZH_TURN1 : EN_TURN1) : fillTurn(zh ? ZH_TURN_N : EN_TURN_N, turn);
      break;
  }
  return { text, story: splitStory(text), choices: splitChoices(text), lang: zh ? 'zh' : 'en', turn, variant };
}

/** 按 §7：中文请求返回中文内容，否则英文。 */
export function detectLang(body) {
  const parts = [];
  if (body && typeof body.system === 'string') parts.push(body.system);
  if (body && Array.isArray(body.system)) {
    parts.push(body.system.map((b) => (typeof b === 'string' ? b : b?.text || '')).join(''));
  }
  if (body && Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (!msg) continue;
      if (typeof msg.content === 'string') parts.push(msg.content);
      else if (Array.isArray(msg.content)) {
        parts.push(msg.content.map((p) => (typeof p === 'string' ? p : p?.text || '')).join(''));
      }
    }
  }
  const all = parts.join('\n');
  return /[\u3400-\u9fff]/.test(all) ? 'zh' : 'en';
}

/** 回合数 = 请求 messages 中 assistant 消息数量 + 1。 */
export function countTurns(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.filter((m) => m && m.role === 'assistant').length + 1;
}

// ---------------------------------------------------------------------------
// SSE 构造
// ---------------------------------------------------------------------------

function splitChunks(text, size) {
  if (!text) return [];
  if (!size || size < 1) return [text];
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function openAiStreamEvents(text, { model, id, created, chunkSize }) {
  const events = [];
  events.push(
    `data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
    })}\n\n`,
  );
  for (const chunk of splitChunks(text, chunkSize)) {
    events.push(
      `data: ${JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
      })}\n\n`,
    );
  }
  events.push(
    `data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })}\n\n`,
  );
  events.push('data: [DONE]\n\n');
  return events;
}

function anthropicStreamEvents(text, { model, id, chunkSize }) {
  const events = [];
  events.push(
    `event: message_start\ndata: ${JSON.stringify({
      type: 'message_start',
      message: {
        id,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 128, output_tokens: 0 },
      },
    })}\n\n`,
  );
  events.push(
    `event: content_block_start\ndata: ${JSON.stringify({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    })}\n\n`,
  );
  for (const chunk of splitChunks(text, chunkSize)) {
    events.push(
      `event: content_block_delta\ndata: ${JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: chunk },
      })}\n\n`,
    );
  }
  events.push(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
  events.push(
    `event: message_delta\ndata: ${JSON.stringify({
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 256 },
    })}\n\n`,
  );
  events.push(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
  return events;
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(new Error('request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseJsonBody(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { __raw: raw };
  }
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function writeSseEvents(res, events, delayMs) {
  for (const event of events) {
    if (res.writableEnded || res.destroyed) return;
    res.write(event);
    if (delayMs > 0) await sleep(delayMs);
  }
  if (!res.writableEnded && !res.destroyed) res.end();
}

function applyCors(res) {
  for (const [name, value] of Object.entries(CORS_HEADERS)) res.setHeader(name, value);
  res.setHeader('Cache-Control', 'no-store');
}

// ---------------------------------------------------------------------------
// 服务器
// ---------------------------------------------------------------------------

/**
 * 启动 mock server。
 * @param {{port?: number, host?: string, logLimit?: number}} [opts]
 * @returns {Promise<{port:number, host:string, server:import('node:http').Server, logs:Array, on:(event:string, fn:Function)=>()=>void, once:(event:string)=>Promise<any>, resetLogs:()=>void, close:()=>Promise<void>}>}
 */
export async function startMockServer({ port = DEFAULT_PORT, host = '127.0.0.1', logLimit = LOG_LIMIT } = {}) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);
  const logs = [];
  let seq = 0;

  const pushLog = (record) => {
    logs.push(record);
    while (logs.length > logLimit) logs.shift();
  };

  const server = http.createServer(async (req, res) => {
    applyCors(res);
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = url.pathname;

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (pathname === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
      sendJson(res, 200, { ok: true, service: 'appealing-words-mock-api', time: Date.now() });
      return;
    }

    if (pathname === '/logs' && req.method === 'GET') {
      sendJson(res, 200, logs);
      return;
    }

    if (pathname === '/reset' && req.method === 'POST') {
      logs.length = 0;
      emitter.emit('reset');
      sendJson(res, 200, { ok: true });
      return;
    }

    const openaiMatch = OPENAI_PATH_RE.exec(pathname);
    const anthropicMatch = ANTHROPIC_PATH_RE.exec(pathname);
    const isApiPath = Boolean(openaiMatch || anthropicMatch);

    if (!isApiPath) {
      sendJson(res, 404, {
        error: { message: `mock server: unknown path ${req.method} ${pathname}`, type: 'invalid_request_error' },
      });
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      sendJson(res, 405, {
        error: { message: `mock server: method ${req.method} not allowed on ${pathname}`, type: 'invalid_request_error' },
      });
      return;
    }

    const protocol = openaiMatch ? 'openai' : 'anthropic';
    const variant = (openaiMatch || anthropicMatch)[1];

    let rawBody = '';
    try {
      rawBody = await readBody(req);
    } catch (err) {
      sendJson(res, 413, { error: { message: `mock server: ${err.message}`, type: 'invalid_request_error' } });
      return;
    }

    const record = {
      seq: ++seq,
      method: req.method,
      path: pathname,
      url: req.url,
      headers: { ...req.headers },
      body: parseJsonBody(rawBody),
      time: new Date().toISOString(),
      protocol,
      variant,
      status: null,
    };
    pushLog(record);
    emitter.emit('request', record);

    const body = record.body || {};
    const stream = body.stream === true;
    const lang = detectLang(body);
    const turn = countTurns(body);
    const model = typeof body.model === 'string' && body.model ? body.model : 'mock-model';
    const idPrefix = protocol === 'openai' ? 'chatcmpl' : 'msg';
    const id = `${idPrefix}_mock_${record.seq}`;
    const created = Math.floor(Date.now() / 1000);
    Object.assign(record, { lang, turn, stream, model });

    // 401 错误路径
    if (variant === 'error401openai' || variant === 'error401anthropic') {
      const payload =
        protocol === 'openai'
          ? {
              error: {
                message: 'Incorrect API key provided: sk-mock-openai. (mock 401)',
                type: 'invalid_request_error',
                param: null,
                code: 'invalid_api_key',
              },
            }
          : { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key (mock 401)' } };
      record.status = 401;
      sendJson(res, 401, payload);
      emitter.emit('response', record);
      return;
    }

    const reply = buildReply({ lang, turn, variant });
    record.reply = { lang: reply.lang, turn: reply.turn, length: reply.text.length };
    const delayMs = variant === 'slowopenai' ? 200 : 8;
    const chunkSize = variant === 'slowopenai' ? 28 : 10;

    if (protocol === 'openai') {
      if (stream) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();
        await writeSseEvents(res, openAiStreamEvents(reply.text, { model, id, created, chunkSize }), delayMs);
      } else {
        res.statusCode = 200;
        sendJson(res, 200, {
          id,
          object: 'chat.completion',
          created,
          model,
          choices: [{ index: 0, message: { role: 'assistant', content: reply.text }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 64, completion_tokens: 128, total_tokens: 192 },
        });
      }
    } else if (stream) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
      await writeSseEvents(res, anthropicStreamEvents(reply.text, { model, id, chunkSize }), delayMs);
    } else {
      res.statusCode = 200;
      sendJson(res, 200, {
        id,
        type: 'message',
        role: 'assistant',
        model,
        content: [{ type: 'text', text: reply.text }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 64, output_tokens: 128 },
      });
    }

    record.status = res.statusCode;
    emitter.emit('response', record);
  });

  server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  await new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('listening', onListening);
      reject(
        err && err.code === 'EADDRINUSE'
          ? new Error(`mock server: 端口 ${port} 已被占用（EADDRINUSE），请先关掉占用 8787 的进程`)
          : err,
      );
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;

  return {
    port: actualPort,
    host,
    server,
    logs,
    get listeningUrl() {
      return `http://${host}:${actualPort}`;
    },
    on(event, fn) {
      emitter.on(event, fn);
      return () => emitter.off(event, fn);
    },
    once(event) {
      return new Promise((resolve) => emitter.once(event, resolve));
    },
    resetLogs() {
      logs.length = 0;
    },
    close() {
      return new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    },
  };
}

// ---------------------------------------------------------------------------
// 独立运行：node dev/mock-api-server.mjs
// ---------------------------------------------------------------------------

const isMainModule = (() => {
  try {
    if (!process.argv[1]) return false;
    return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  try {
    const mock = await startMockServer();
    console.log(`[mock-api] listening on ${mock.listeningUrl}`);
    console.log('[mock-api] OpenAI   POST /openai/v1/chat/completions   (stream:true => SSE)');
    console.log('[mock-api] Anthropic POST /anthropic/v1/messages      (stream:true => SSE)');
    console.log('[mock-api] special  /slowopenai|/badopenai|/emptyopenai|/error401openai|/error401anthropic');
    console.log('[mock-api] logs GET /logs   reset POST /reset   health GET /health');
    const shutdown = async (signal) => {
      console.log(`[mock-api] ${signal} received, shutting down`);
      await mock.close();
      process.exit(0);
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  } catch (err) {
    console.error(`[mock-api] 启动失败: ${err?.message || err}`);
    process.exit(1);
  }
}
