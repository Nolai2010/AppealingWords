/* ============================================================
 * 无尽文游 / Appealing Words — api.js
 * 直接连接用户自填的 AI 接口：
 *   - OpenAI 兼容格式：POST {base}/chat/completions
 *   - Anthropic 格式：POST {base}/messages
 * 支持 SSE 流式、非流式、错误归类、额外请求头。
 * ============================================================ */

const STREAM_TIMEOUT_MS = 180000;
const TEST_TIMEOUT_MS = 45000;

export class ApiError extends Error {
  constructor(message, code = 'server', status = 0, detail = '') {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function normalizeProtocol(protocol) {
  return protocol === 'anthropic' ? 'anthropic' : 'openai';
}

/** 把用户填写的 Base URL 规整成完整接口地址 */
export function normalizeEndpoint(protocol, baseUrl) {
  let url = String(baseUrl || '').trim();
  if (!url) throw new ApiError('Base URL 不能为空', 'config');
  url = url.replace(/\s+/g, '');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/+$/, '');

  const prot = normalizeProtocol(protocol);
  const hasPath = /^https?:\/\/[^/]+\/.+/.test(url);
  const isHostOnly = /^https?:\/\/[^/]+$/.test(url);

  if (prot === 'anthropic') {
    if (/\/messages$/i.test(url)) return url;
    if (isHostOnly) return `${url}/v1/messages`;
    return `${url}/messages`;
  }

  if (/\/chat\/completions$/i.test(url)) return url;
  if (/\/completions$/i.test(url)) return url;
  if (isHostOnly) return `${url}/v1/chat/completions`;
  return `${url}/chat/completions`;
}

/** 解析高级选项里的额外请求头 JSON */
export function parseExtraHeaders(text) {
  const raw = String(text || '').trim();
  if (!raw) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ApiError('额外请求头不是合法的 JSON', 'config');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError('额外请求头必须是一个 JSON 对象', 'config');
  }
  const headers = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!key || /[\r\n]/.test(key)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      headers[key] = String(value);
    }
  }
  return headers;
}

function buildHeaders(config, protocol) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (protocol === 'anthropic') {
    if (config.apiKey) headers['x-api-key'] = String(config.apiKey);
    headers['anthropic-version'] = '2023-06-01';
    // 允许在浏览器中直连 Anthropic 官方接口
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  return { ...headers, ...parseExtraHeaders(config.extraHeaders) };
}

function buildBody(config, protocol, system, messages, stream) {
  const maxTokens = Math.round(Number(config.maxTokens) || 2048);
  const temperature = Number.isFinite(Number(config.temperature)) ? Number(config.temperature) : 0.85;
  if (protocol === 'anthropic') {
    return {
      model: config.model,
      system,
      messages,
      max_tokens: maxTokens,
      temperature: Math.min(1, Math.max(0, temperature)),
      stream,
    };
  }
  return {
    model: config.model,
    messages: [{ role: 'system', content: system }, ...messages],
    temperature: Math.min(2, Math.max(0, temperature)),
    max_tokens: maxTokens,
    stream,
  };
}

function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('');
  }
  return '';
}

function errorFromStatus(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate';
  if (status === 402 || status === 400 && false) return 'quota';
  if (status === 404) return 'config';
  if (status >= 500) return 'server';
  return 'http';
}

async function errorFromResponse(res) {
  const status = res.status;
  let message = '';
  let detail = '';
  try {
    detail = await res.text();
    if (detail) {
      try {
        const json = JSON.parse(detail);
        const candidate = json.error?.message || json.message || json.error || json.msg || json.detail;
        if (candidate != null) {
          message = typeof candidate === 'string' ? candidate : JSON.stringify(candidate);
        }
      } catch (err) {
        message = detail.slice(0, 300);
      }
    }
  } catch (err) {
    /* ignore */
  }
  return new ApiError(message || `HTTP ${status}`, errorFromStatus(status), status, detail.slice(0, 800));
}

function extractOpenAiDelta(payload) {
  const choice = payload && payload.choices && payload.choices[0];
  if (!choice) return '';
  if (choice.delta && typeof choice.delta.content === 'string') return choice.delta.content;
  if (choice.delta && Array.isArray(choice.delta.content)) return textFromContent(choice.delta.content);
  if (typeof choice.text === 'string') return choice.text;
  if (choice.message && typeof choice.message.content === 'string') return choice.message.content;
  return '';
}

function extractAnthropicDelta(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (payload.type === 'content_block_delta' && payload.delta && typeof payload.delta.text === 'string') {
    return payload.delta.text;
  }
  if (payload.type === 'content_block_start' && payload.content_block && typeof payload.content_block.text === 'string') {
    return payload.content_block.text;
  }
  return '';
}

function extractNonStreamText(protocol, json) {
  if (!json || typeof json !== 'object') return '';
  if (protocol === 'anthropic') {
    if (Array.isArray(json.content)) {
      return json.content.map((c) => (c && typeof c.text === 'string' ? c.text : '')).join('');
    }
    return '';
  }
  const choice = json.choices && json.choices[0];
  if (!choice) return '';
  if (choice.message) return textFromContent(choice.message.content);
  return typeof choice.text === 'string' ? choice.text : '';
}

async function readSseStream(res, protocol, onDelta) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  const consumeBlock = (block) => {
    const lines = block.split('\n');
    let eventName = '';
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (!dataLines.length) return;
    const dataStr = dataLines.join('\n').trim();
    if (!dataStr || dataStr === '[DONE]') return;
    let payload;
    try {
      payload = JSON.parse(dataStr);
    } catch (err) {
      return;
    }
    if (payload && payload.error) {
      const msg = payload.error.message || payload.error;
      throw new ApiError(typeof msg === 'string' ? msg : JSON.stringify(msg), 'server');
    }
    if (payload && payload.type === 'error') {
      const msg = (payload.error && payload.error.message) || 'stream error';
      throw new ApiError(msg, 'server');
    }
    const delta = protocol === 'anthropic' ? extractAnthropicDelta(payload) : extractOpenAiDelta(payload);
    if (delta) {
      full += delta;
      if (typeof onDelta === 'function') onDelta(delta, full);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r/g, '');
      let index = buffer.indexOf('\n\n');
      while (index !== -1) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (block.trim()) consumeBlock(block);
        index = buffer.indexOf('\n\n');
      }
    }
    buffer += decoder.decode();
  } finally {
    try {
      reader.releaseLock();
    } catch (err) {
      /* ignore */
    }
  }
  const tail = buffer.replace(/\r/g, '').trim();
  if (tail) consumeBlock(tail);
  return full;
}

/**
 * 流式请求。
 * @returns {Promise<{text: string, endpoint: string, protocol: string}>}
 */
export async function streamChat(config, options = {}) {
  const protocol = normalizeProtocol(config.protocol);
  if (!config.baseUrl) throw new ApiError('Base URL 不能为空', 'config');
  if (!config.model) throw new ApiError('模型不能为空', 'config');
  const endpoint = normalizeEndpoint(protocol, config.baseUrl);
  const system = options.system || '';
  const messages = Array.isArray(options.messages) ? options.messages : [];
  const external = options.signal;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, STREAM_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', forwardAbort, { once: true });
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(config, protocol),
      body: JSON.stringify(buildBody(config, protocol, system, messages, true)),
      signal: controller.signal,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!res.ok) throw await errorFromResponse(res);

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    let text = '';
    if (contentType.includes('application/json')) {
      const json = await res.json();
      text = extractNonStreamText(protocol, json);
      if (text && typeof options.onDelta === 'function') options.onDelta(text, text);
    } else if (res.body) {
      text = await readSseStream(res, protocol, options.onDelta);
    } else {
      text = await res.text();
      if (text && typeof options.onDelta === 'function') options.onDelta(text, text);
    }

    if (!text || !text.trim()) {
      throw new ApiError('接口返回了空内容', 'empty');
    }
    return { text, endpoint, protocol };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (timedOut) {
      throw new ApiError('请求超时', 'timeout');
    }
    if (err && err.name === 'AbortError') {
      throw new ApiError('请求已取消', 'aborted');
    }
    throw new ApiError(err && err.message ? err.message : '网络错误', 'network');
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener('abort', forwardAbort);
  }
}

/**
 * 测试连接：发一条最小化非流式请求。
 * @returns {Promise<{ok: boolean, text: string, latency: number, endpoint: string}>}
 */
export async function testConnection(config, options = {}) {
  const protocol = normalizeProtocol(config.protocol);
  if (!config.baseUrl) throw new ApiError('Base URL 不能为空', 'config');
  if (!config.model) throw new ApiError('模型不能为空', 'config');
  const endpoint = normalizeEndpoint(protocol, config.baseUrl);
  const external = options.signal;
  const testMessage =
    options.testMessage ||
    '请只回复两个字：可用。（仅用于连通性测试，请不要展开）';

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', forwardAbort, { once: true });
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { ...buildHeaders(config, protocol), Accept: 'application/json' },
      body: JSON.stringify(
        buildBody(
          config,
          protocol,
          '你是一个用于测试接口连通性的助手，请用极简方式回复。',
          [{ role: 'user', content: testMessage }],
          false
        )
      ),
      signal: controller.signal,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!res.ok) throw await errorFromResponse(res);
    const latency = Date.now() - startedAt;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    let text = '';
    if (contentType.includes('application/json') || contentType.includes('text/')) {
      const raw = await res.text();
      let json = null;
      try {
        json = JSON.parse(raw);
      } catch (err) {
        json = null;
      }
      text = json ? extractNonStreamText(protocol, json) : raw.slice(0, 200);
    }
    return { ok: true, text: text.trim(), latency, endpoint };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (timedOut) throw new ApiError('连接超时', 'timeout');
    if (err && err.name === 'AbortError') throw new ApiError('请求已取消', 'aborted');
    throw new ApiError(err && err.message ? err.message : '网络错误', 'network');
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener('abort', forwardAbort);
  }
}

export function isAbortError(err) {
  return Boolean(err && err.code === 'aborted');
}
