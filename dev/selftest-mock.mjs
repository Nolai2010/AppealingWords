#!/usr/bin/env node
/**
 * dev/selftest-mock.mjs — mock-api-server 自测（不依赖浏览器）
 * 用法：node dev/selftest-mock.mjs
 * 覆盖 §7 的全部 mock 行为：CORS/OPTIONS、OpenAI SSE 与非流式、Anthropic SSE 与非流式、
 * /logs、/reset、特殊路径（slow/bad/empty/401）、回合序号、中英文判定、日志上限。
 */

import {
  startMockServer,
  buildReply,
  DEFAULT_PORT,
  LOG_LIMIT,
  OPENAI_PATH_RE,
  ANTHROPIC_PATH_RE,
} from './mock-api-server.mjs';

const BASE = `http://127.0.0.1:${DEFAULT_PORT}`;
const TIMEOUT = 30_000;

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
  ok(text.includes(needle), name, `未找到 ${JSON.stringify(needle)}；实际片段：${JSON.stringify(text.slice(0, 200))}`);
}

function truthy(value, name) {
  ok(Boolean(value), name, `期望 truthy，实际 ${JSON.stringify(value)}`);
}

async function post(pathname, body, headers = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* SSE 或非 JSON */
  }
  return { res, text, json, headers: res.headers };
}

/** 把 SSE 文本解析为 [{ event, data }]；data 保留字符串。 */
function parseSse(text) {
  const events = [];
  for (const block of String(text).split('\n\n')) {
    if (!block.trim()) continue;
    let event = null;
    const dataLines = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trim());
    }
    events.push({ event, data: dataLines.join('\n') });
  }
  return events;
}

function openAiChunks(sseText) {
  const chunks = [];
  let done = false;
  for (const evt of parseSse(sseText)) {
    if (evt.data === '[DONE]') {
      done = true;
      continue;
    }
    try {
      const parsed = JSON.parse(evt.data);
      chunks.push(parsed);
    } catch {
      chunks.push({ __unparsed: evt.data });
    }
  }
  return { chunks, done };
}

function joinedOpenAiContent(sseText) {
  const { chunks } = openAiChunks(sseText);
  return chunks
    .map((c) => c?.choices?.[0]?.delta?.content || '')
    .join('');
}

function joinedAnthropicText(sseText) {
  return parseSse(sseText)
    .filter((e) => e.event === 'content_block_delta')
    .map((e) => {
      try {
        return JSON.parse(e.data)?.delta?.text || '';
      } catch {
        return '';
      }
    })
    .join('');
}

const zhMessages = (extra = []) => [
  {
    role: 'system',
    content: '当前语言：简体中文，所有故事与选项必须使用简体中文。必须输出 <story> 与 <choices>。',
  },
  { role: 'user', content: '开始吧。请直接给出开场情景与抉择。' },
  ...extra,
];

const enMessages = (extra = []) => [
  {
    role: 'system',
    content: 'Current language: English. All story text and choices must be in English. Output <story> and <choices>.',
  },
  { role: 'user', content: 'Begin. Open the scene and offer choices.' },
  ...extra,
];

// ---------------------------------------------------------------------------

const mock = await startMockServer();
console.log(`[selftest-mock] server on ${BASE}`);

try {
  // ---- 0. 基础列表 ----
  eq(mock.port, DEFAULT_PORT, 'mock 监听契约端口 8787');
  eq(LOG_LIMIT, 50, 'LOG_LIMIT 为 50');

  // ---- 1. OPTIONS / CORS 预检 ----
  {
    const res = await fetch(`${BASE}/openai/v1/chat/completions`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://127.0.0.1:8788',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    eq(res.status, 204, 'OPTIONS 返回 204');
    eq(res.headers.get('access-control-allow-origin'), '*', 'OPTIONS 带 ACAO:*');
    eq(res.headers.get('access-control-allow-headers'), '*', 'OPTIONS 带 ACAH:*');
    eq(res.headers.get('access-control-allow-methods'), 'POST, OPTIONS', 'OPTIONS 带 ACAM: POST, OPTIONS');
  }

  // ---- 2. OpenAI 流式 SSE ----
  {
    const expected = buildReply({ lang: 'zh', turn: 1, variant: 'openai' }).text;
    const { res, text } = await post('/openai/v1/chat/completions', {
      model: 'mock-gpt-4o',
      messages: zhMessages(),
      stream: true,
    });
    eq(res.status, 200, 'OpenAI SSE 状态 200');
    includes(res.headers.get('content-type'), 'text/event-stream', 'OpenAI SSE Content-Type');
    eq(res.headers.get('access-control-allow-origin'), '*', 'OpenAI SSE 带 CORS 头');
    includes(text, 'data: [DONE]', 'OpenAI SSE 以 data: [DONE] 结束');
    const { chunks, done } = openAiChunks(text);
    ok(done, 'OpenAI SSE 能解析出 [DONE]');
    ok(chunks.length >= 5, 'OpenAI SSE 有多个 delta chunk', `实际 ${chunks.length}`);
    const first = chunks[0]?.choices?.[0]?.delta;
    truthy(first && first.role === 'assistant', 'OpenAI 首个 chunk 带 delta.role=assistant');
    const joined = joinedOpenAiContent(text);
    eq(joined, expected, 'OpenAI SSE 拼接正文 === buildReply().text');
    includes(joined, '<story>', 'OpenAI SSE 正文含 <story>');
    includes(joined, '<choices>', 'OpenAI SSE 正文含 <choices>');
    includes(joined, '第 1 回合', 'OpenAI SSE 第一回合正文带回合序号');
    includes(joined, '**潮气**', '第一回合正文含加粗标记');
    includes(joined, '`铜钥`', '第一回合正文含行内代码标记');
    includes(joined, '> 「规矩', '第一回合正文含引用');
    includes(joined, '$x^2+y^2=1$', '第一回合正文含行内 LaTeX');
    includes(joined, '\\sum_{i=1}^{n}', '第一回合正文含块级 LaTeX');
    truthy(openAiChunks(text).chunks.every((c) => c.choices?.[0]?.object !== 'error'), 'OpenAI chunk JSON 结构合法');
  }

  // ---- 3. OpenAI 非流式 ----
  {
    const expected = buildReply({ lang: 'zh', turn: 1, variant: 'openai' }).text;
    const { res, json } = await post('/openai/v1/chat/completions', {
      model: 'mock-gpt-4o',
      messages: zhMessages(),
      stream: false,
    });
    eq(res.status, 200, 'OpenAI 非流式状态 200');
    includes(res.headers.get('content-type'), 'application/json', 'OpenAI 非流式 Content-Type');
    eq(res.headers.get('access-control-allow-origin'), '*', 'OpenAI 非流式带 CORS 头');
    eq(json?.choices?.[0]?.message?.content, expected, 'OpenAI 非流式 choices[0].message.content === 期望正文');
  }

  // ---- 4. Anthropic 流式 SSE 事件序列 ----
  {
    const expected = buildReply({ lang: 'zh', turn: 1, variant: 'anthropic' }).text;
    const { res, text } = await post(
      '/anthropic/v1/messages',
      { model: 'mock-claude', max_tokens: 2048, messages: zhMessages(), stream: true },
      { 'x-api-key': 'sk-ant-mock', 'anthropic-version': '2023-06-01' },
    );
    eq(res.status, 200, 'Anthropic SSE 状态 200');
    includes(res.headers.get('content-type'), 'text/event-stream', 'Anthropic SSE Content-Type');
    eq(res.headers.get('access-control-allow-origin'), '*', 'Anthropic SSE 带 CORS 头');
    const events = parseSse(text);
    const names = events.map((e) => e.event);
    eq(names[0], 'message_start', 'Anthropic 事件序首为 message_start');
    eq(names[1], 'content_block_start', 'Anthropic 事件序第二为 content_block_start');
    truthy(names.filter((n) => n === 'content_block_delta').length >= 2, 'Anthropic 有多条 content_block_delta');
    eq(names[names.length - 2], 'message_delta', 'Anthropic 倒数第二事件为 message_delta');
    eq(names[names.length - 1], 'message_stop', 'Anthropic 最后事件为 message_stop');
    truthy(names.includes('content_block_stop'), 'Anthropic 包含 content_block_stop');
    const deltas = events.filter((e) => e.event === 'content_block_delta');
    truthy(
      deltas.every((e) => {
        try {
          return JSON.parse(e.data)?.delta?.type === 'text_delta';
        } catch {
          return false;
        }
      }),
      'Anthropic delta.type 均为 text_delta',
    );
    eq(joinedAnthropicText(text), expected, 'Anthropic SSE 拼接正文 === 期望正文');
    includes(joinedAnthropicText(text), '<choices>', 'Anthropic SSE 正文含 <choices>');
    includes(joinedAnthropicText(text), '第 1 回合', 'Anthropic SSE 正文带回合序号');
  }

  // ---- 5. Anthropic 非流式 ----
  {
    const expected = buildReply({ lang: 'zh', turn: 1, variant: 'anthropic' }).text;
    const { res, json } = await post('/anthropic/v1/messages', {
      model: 'mock-claude',
      max_tokens: 2048,
      messages: zhMessages(),
      stream: false,
    });
    eq(res.status, 200, 'Anthropic 非流式状态 200');
    eq(json?.content?.[0]?.type, 'text', 'Anthropic 非流式 content[0].type === text');
    eq(json?.content?.[0]?.text, expected, 'Anthropic 非流式正文 === 期望正文');
  }

  // ---- 6. 回合序号 ----
  {
    const messages = [
      ...zhMessages(),
      { role: 'assistant', content: '<story>一</story><choices>1. 甲\n2. 乙\n3. 丙</choices>' },
      { role: 'user', content: '甲' },
      { role: 'assistant', content: '<story>二</story><choices>1. 甲\n2. 乙\n3. 丙</choices>' },
      { role: 'user', content: '乙' },
    ];
    const { json } = await post('/openai/v1/chat/completions', { model: 'm', messages, stream: false });
    includes(json?.choices?.[0]?.message?.content, '第 3 回合', 'assistant 消息数 2 → 第 3 回合正文');
    eq(
      buildReply({ lang: 'zh', turn: 3, variant: 'openai' }).choices.length,
      3,
      'buildReply 第三回合提供 3 个选项',
    );
  }

  // ---- 7. 中英文判定 ----
  {
    const { json: zhJson } = await post('/openai/v1/chat/completions', {
      model: 'm',
      messages: zhMessages(),
      stream: false,
    });
    includes(zhJson?.choices?.[0]?.message?.content, '第 1 回合', '中文 system prompt → 中文正文');
    const { json: enJson } = await post('/openai/v1/chat/completions', {
      model: 'm',
      messages: enMessages(),
      stream: false,
    });
    includes(enJson?.choices?.[0]?.message?.content, 'Turn 1', '英文 system prompt → 英文正文');
    includes(enJson?.choices?.[0]?.message?.content, 'Take the brass key', '英文正文选项为英文');
    const enReply = enJson?.choices?.[0]?.message?.content || '';
    ok(!/第\s*\d+\s*回合/.test(enReply), '英文正文不含中文回合标记');
  }

  // ---- 8. /logs 记录 ----
  {
    await post('/reset', {});
    await post(
      '/openai/v1/chat/completions',
      { model: 'log-model', messages: zhMessages(), stream: false },
      { Authorization: 'Bearer test-key' },
    );
    const res = await fetch(`${BASE}/logs`, { signal: AbortSignal.timeout(TIMEOUT) });
    eq(res.status, 200, 'GET /logs 状态 200');
    eq(res.headers.get('access-control-allow-origin'), '*', '/logs 带 CORS 头');
    const logs = await res.json();
    truthy(Array.isArray(logs), '/logs 返回数组');
    eq(logs.length, 1, '/logs 记录条数（reset 后 1 条）');
    const last = logs[logs.length - 1];
    eq(last.path, '/openai/v1/chat/completions', '日志 path 正确');
    eq(last.method, 'POST', '日志 method 正确');
    eq(last.body?.model, 'log-model', '日志 body.model 正确');
    eq(last.headers?.authorization, 'Bearer test-key', '日志 headers.authorization 正确');
    truthy(!Number.isNaN(Date.parse(last.time)), '日志 time 是合法时间戳');
    truthy(last.headers?.['content-type']?.includes('application/json'), '日志 headers 含 content-type');
  }

  // ---- 9. /reset ----
  {
    const res = await fetch(`${BASE}/reset`, { method: 'POST', signal: AbortSignal.timeout(TIMEOUT) });
    eq(res.status, 200, 'POST /reset 状态 200');
    const logs = await (await fetch(`${BASE}/logs`, { signal: AbortSignal.timeout(TIMEOUT) })).json();
    eq(logs.length, 0, '/reset 后日志为空');
  }

  // ---- 10. badopenai 兜底正文 ----
  {
    const { res, text } = await post('/badopenai/v1/chat/completions', {
      model: 'm',
      messages: zhMessages(),
      stream: true,
    });
    eq(res.status, 200, 'badopenai SSE 状态 200');
    const joined = joinedOpenAiContent(text);
    ok(!joined.includes('<story>'), 'badopenai 正文不含 <story>');
    ok(!joined.includes('<choices>'), 'badopenai 正文不含 <choices>');
    includes(joined, '**雨声乍歇**', 'badopenai 正文含 Markdown 加粗');
    includes(joined, '`孤灯`', 'badopenai 正文含行内代码');
    includes(joined, '> 你听见', 'badopenai 正文含引用');
    includes(joined, '$a^2+b^2=c^2$', 'badopenai 正文含行内 LaTeX');
    includes(joined, '\\int_{0}^{1}', 'badopenai 正文含块级 LaTeX');

    const { json } = await post('/badopenai/v1/chat/completions', {
      model: 'm',
      messages: zhMessages(),
      stream: false,
    });
    eq(json?.choices?.[0]?.message?.content, joined, 'badopenai 非流式正文与流式一致');
  }

  // ---- 11. emptyopenai ----
  {
    const { text } = await post('/emptyopenai/v1/chat/completions', {
      model: 'm',
      messages: zhMessages(),
      stream: true,
    });
    eq(joinedOpenAiContent(text), '', 'emptyopenai SSE 拼接正文为空');
    includes(text, 'data: [DONE]', 'emptyopenai SSE 仍以 [DONE] 结束');
    const { json } = await post('/emptyopenai/v1/chat/completions', {
      model: 'm',
      messages: zhMessages(),
      stream: false,
    });
    eq(json?.choices?.[0]?.message?.content, '', 'emptyopenai 非流式正文为空');
  }

  // ---- 12. error401openai ----
  {
    const { res, json } = await post('/error401openai/v1/chat/completions', {
      model: 'm',
      messages: zhMessages(),
      stream: true,
    });
    eq(res.status, 401, 'error401openai 状态 401');
    eq(res.headers.get('access-control-allow-origin'), '*', '401 响应仍带 CORS 头');
    eq(json?.error?.code, 'invalid_api_key', '401 body.error.code === invalid_api_key');
    truthy(json?.error?.message, '401 body.error.message 存在');
  }

  // ---- 13. slowopenai 每 chunk 200ms ----
  {
    const started = Date.now();
    const { text } = await post('/slowopenai/v1/chat/completions', {
      model: 'm',
      messages: zhMessages(),
      stream: true,
    });
    const elapsed = Date.now() - started;
    const { chunks } = openAiChunks(text);
    ok(elapsed >= 1200, 'slowopenai 流耗时 >= 1200ms', `实际 ${elapsed}ms`);
    ok(chunks.length >= 9, 'slowopenai chunk 数足够（>=9）', `实际 ${chunks.length}`);
    includes(joinedOpenAiContent(text), '慢速回合', 'slowopenai 正文为慢速短文本');
    includes(joinedOpenAiContent(text), '<choices>', 'slowopenai 正文含选项');
  }

  // ---- 14. 日志上限 50 ----
  {
    await fetch(`${BASE}/reset`, { method: 'POST', signal: AbortSignal.timeout(TIMEOUT) });
    for (let i = 0; i < 55; i++) {
      const res = await fetch(`${BASE}/emptyopenai/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: `m${i}`, messages: zhMessages(), stream: false }),
        signal: AbortSignal.timeout(TIMEOUT),
      });
      await res.text();
    }
    const logs = await (await fetch(`${BASE}/logs`, { signal: AbortSignal.timeout(TIMEOUT) })).json();
    eq(logs.length, 50, '日志最多保留 50 条');
    eq(logs[logs.length - 1]?.body?.model, 'm54', '日志保留最新请求');
  }

  // ---- 15. 未知路径 404（CORS 一致性） ----
  {
    const res = await fetch(`${BASE}/nope/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(TIMEOUT),
    });
    eq(res.status, 404, '未知路径返回 404');
    eq(res.headers.get('access-control-allow-origin'), '*', '未知路径仍带 CORS 头');
  }

  // ---- 16. 路由正则 ----
  truthy(OPENAI_PATH_RE.test('/openai/v1/chat/completions'), 'OPENAI_PATH_RE 匹配默认路径');
  truthy(OPENAI_PATH_RE.test('/slowopenai/v1/chat/completions'), 'OPENAI_PATH_RE 匹配 slowopenai');
  truthy(ANTHROPIC_PATH_RE.test('/anthropic/v1/messages'), 'ANTHROPIC_PATH_RE 匹配 anthropic');
  ok(!OPENAI_PATH_RE.test('/anthropic/v1/messages'), 'OPENAI_PATH_RE 不误匹配 anthropic');
} catch (err) {
  failures.push(`未捕获异常: ${err?.stack || err}`);
  console.error(`\n[selftest-mock] 未捕获异常: ${err?.stack || err}`);
} finally {
  await mock.close();
}

console.log('');
if (failures.length === 0) {
  console.log(`ALL MOCK TESTS PASSED (${passed} assertions)`);
  process.exit(0);
} else {
  console.log(`MOCK TESTS FAILED: ${failures.length} failed / ${passed} passed`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
