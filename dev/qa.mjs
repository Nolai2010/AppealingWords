#!/usr/bin/env node
/**
 * dev/qa.mjs — 「无尽文游 / Appealing Words」一键端到端验收（v1.1）
 *
 * v1.0 基线：dev/contracts.md §8 的 T1~T14（含四张固定截图）。
 * v1.1 增量：dev/contracts-v1.1.md §7
 *   T0  静态基线：guide.js 契约 / i18n PROVIDER_PRESETS（DeepSeek=deepseek-flash）/
 *       index.html 新钩子 / README 中英互链 / store.js APP_VERSION=1.1.1（Node 阶段，无浏览器）
 *   T1G 引导页教程区：.guide-step ≥3 / .guide-concept ≥3 / .provider-card ≥8 + 外链窗口属性
 *       点 DeepSeek 卡「填入本页」→ baseUrl/model/协议正确；chips 里 DeepSeek 预设 = deepseek-flash；
 *       #btn-open-guide 打开 #modal-guide 且内容非空、可关闭
 *   T15 设置入口打开教程弹窗 + 设置→关于显示 1.1.1
 *   T16 v1.1.1 移动端布局识别回归：
 *       a. 桌面 UA + 触屏 + 390×844 → device=mobile / layout=portrait / 舞台比例≈0.5625
 *       b. 手机 UA + 844×390（横握） → device=mobile / layout=landscape / 比例≈2
 *       c. 正常桌面 1440×720 → device=desktop / layout=landscape / 比例=2
 *
 * 截图（文件名与尺寸 v1.0 不变）：
 *   docs/screenshots/onboarding-landscape.png  1440×720
 *   docs/screenshots/home-landscape.png        1440×720
 *   docs/screenshots/game-landscape.png        1440×720
 *   docs/screenshots/game-portrait.png         390×844（iPhone UA）
 *
 * 运行：
 *   node dev/qa.mjs                 完整 E2E（需要 danger-full-access 的 shell，Edge 在受限沙箱会崩溃）
 *   node dev/qa.mjs --static-only  只跑 T0 静态检查（不需要浏览器，几分钟内可跑完）
 *   · 失败时打印 `FAIL <步骤> <原因>` 并以非 0 退出；全过打印 `ALL TESTS PASSED`。
 *
 * 专用自测脚本（非浏览器层）：
 *   node dev/selftest-mock.mjs     mock server 全行为
 *   node dev/selftest-cdp.mjs      CDP 客户端协议层（假 CDP 服务器）
 *   node dev/selftest-serve.mjs    静态服务器
 *   node dev/selftest-static.mjs   v1.1 静态检查（夹具目录，含正向与 5 个破坏场景）
 */

import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  startMockServer,
  buildReply,
  DEFAULT_PORT as MOCK_PORT,
} from './mock-api-server.mjs';
import { startStaticServer, REPO_ROOT } from './serve.mjs';
import { launchEdge, sleep } from './cdp.mjs';
import { runStaticChecks } from './static-checks.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_URL = 'http://127.0.0.1:8788/';
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}`;
const SCREENSHOTS_DIR = path.join(REPO_ROOT, 'docs', 'screenshots');
const STORE_KEY = 'appealingwords.v1';
const STATIC_ONLY = process.argv.includes('--static-only');

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

// ---------------------------------------------------------------------------
// 断言 / 通用工具
// ---------------------------------------------------------------------------

function assert(cond, message) {
  if (!cond) throw new Error(message);
}
function eq(actual, expected, message) {
  const same = Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected);
  if (!same) throw new Error(`${message}（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）`);
}
function includes(haystack, needle, message) {
  if (!String(haystack ?? '').includes(needle)) {
    throw new Error(`${message}（未找到 ${JSON.stringify(needle)}；实际片段：${JSON.stringify(String(haystack ?? '').slice(0, 260))}）`);
  }
}
function truthy(value, message) {
  if (!value) throw new Error(message);
}
const normText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const q = (value) => JSON.stringify(value);

function readPngSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function firstLine(err) {
  return String(err?.message || err).split('\n')[0];
}

// ---------------------------------------------------------------------------
// 可选导入：i18n.js / prompt.js（用于“已知 key 文案”等精确断言；未就绪时走宽松回退）
// ---------------------------------------------------------------------------

let I18N = null;
let PROMPT = null;
let GUIDE = null;

async function loadOptionalModules() {
  try {
    I18N = await import(pathToFileURL(path.join(REPO_ROOT, 'assets', 'js', 'i18n.js')).href);
  } catch (err) {
    console.log(`[qa][warn] 无法导入 assets/js/i18n.js（${firstLine(err)}），文案断言使用宽松回退`);
  }
  try {
    PROMPT = await import(pathToFileURL(path.join(REPO_ROOT, 'assets', 'js', 'prompt.js')).href);
  } catch (err) {
    console.log(`[qa][warn] 无法导入 assets/js/prompt.js（${firstLine(err)}），prompt 断言使用文本匹配`);
  }
  try {
    GUIDE = await import(pathToFileURL(path.join(REPO_ROOT, 'assets', 'js', 'guide.js')).href);
  } catch (err) {
    console.log(`[qa][warn] 无法导入 assets/js/guide.js（${firstLine(err)}），教程断言使用 DOM 文本回退`);
  }
}

function t(lang, key) {
  const value = I18N?.STRINGS?.[lang]?.[key];
  return typeof value === 'string' ? value : undefined;
}

// ---------------------------------------------------------------------------
// 页面 API
// ---------------------------------------------------------------------------

const PAGE_HELPERS = `
  const __vis = (el) => {
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const __click = (el) => {
    if (!el) return false;
    try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
    el.click();
    return true;
  };
  const __setValue = (el, value) => {
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };
  const __norm = (s) => String(s == null ? '' : s).replace(/\\s+/g, ' ').trim();
`;

function makePageApi(session) {
  return {
    session,
    /** 在页面里执行一段同步代码，代码里用 return 返回值；自动注入 __vis/__click/__setValue/__norm。 */
    run(body) {
      return session.evaluate(`(() => {\n${PAGE_HELPERS}\n${body}\n})()`);
    },
    eval(expression) {
      return session.evaluate(expression);
    },
    /** 轮询等待条件为真；条件中可用 __vis 等辅助函数。 */
    wait(condition, description, timeout = 20000) {
      const expression = `(() => {\n${PAGE_HELPERS}\nreturn Boolean(${condition});\n})()`;
      return session.waitFor(expression, { timeout, description: description || condition });
    },
    async exists(selector) {
      return Boolean(await this.run(`return Boolean(document.querySelector(${q(selector)}));`));
    },
    async visible(selector) {
      return Boolean(await this.run(`return __vis(document.querySelector(${q(selector)}));`));
    },
    async count(selector) {
      return Number(await this.run(`return document.querySelectorAll(${q(selector)}).length;`));
    },
    async text(selector) {
      return String(
        (await this.run(`const el = document.querySelector(${q(selector)}); return el ? (el.innerText || el.textContent || '') : '';`)) ?? '',
      ).trim();
    },
    async attr(selector, name) {
      return this.run(`const el = document.querySelector(${q(selector)}); return el ? el.getAttribute(${q(name)}) : null;`);
    },
    async click(selector) {
      return Boolean(await this.run(`const el = document.querySelector(${q(selector)}); if (!el || !__vis(el)) return false; __click(el); return true;`));
    },
    async setValue(selector, value) {
      return Boolean(await this.run(`const el = document.querySelector(${q(selector)}); if (!el) return false; __setValue(el, ${q(value)}); return true;`));
    },
    async clickIndex(selector, index) {
      return Boolean(
        await this.run(`const el = document.querySelectorAll(${q(selector)})[${Number(index)}]; if (!el) return false; __click(el); return true;`),
      );
    },
    async frameCount(selector) {
      return Number(await this.run(`return document.querySelectorAll(${q(selector)}).length;`));
    },
  };
}

// ---------------------------------------------------------------------------
// mock 请求 / 日志
// ---------------------------------------------------------------------------

async function mockReset() {
  const res = await fetch(`${MOCK_BASE}/reset`, { method: 'POST', signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`POST /reset 失败：HTTP ${res.status}`);
}

async function getLogs() {
  const res = await fetch(`${MOCK_BASE}/logs`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`GET /logs 失败：HTTP ${res.status}`);
  const logs = await res.json();
  return Array.isArray(logs) ? logs : [];
}

async function waitMockRequests(predicate, { count = 1, timeout = 20000, description = 'mock 请求' } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const logs = await getLogs().catch(() => []);
    const hits = logs.filter(predicate);
    if (hits.length >= count) return hits;
    await sleep(100);
  }
  const logs = await getLogs().catch(() => []);
  const summary = logs.map((l) => ({
    path: l.path,
    model: l.body?.model,
    stream: l.body?.stream,
    messages: Array.isArray(l.body?.messages) ? l.body.messages.length : null,
  }));
  throw new Error(`等待 mock 请求超时（${timeout}ms）：${description}；当前请求：${JSON.stringify(summary)}`);
}

async function waitMockRequest(predicate, options = {}) {
  const hits = await waitMockRequests(predicate, { ...options, count: 1 });
  return hits[hits.length - 1];
}

// ---------------------------------------------------------------------------
// localStorage / store
// ---------------------------------------------------------------------------

async function readStore(p) {
  const raw = await p.run(`return localStorage.getItem(${q(STORE_KEY)});`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`localStorage.${STORE_KEY} 不是合法 JSON：${String(raw).slice(0, 200)}`);
  }
}

async function writeStore(p, store) {
  const literal = JSON.stringify(JSON.stringify(store));
  await p.run(`localStorage.setItem(${q(STORE_KEY)}, ${literal}); return true;`);
}

async function clearStorage(p) {
  await p.run('localStorage.clear(); sessionStorage.clear(); return true;');
}

function makeConfig(overrides = {}) {
  return {
    protocol: 'openai',
    baseUrl: `${MOCK_BASE}/openai/v1`,
    apiKey: 'sk-mock-openai',
    model: 'mock-gpt-4o',
    temperature: 0.85,
    maxTokens: 2048,
    extraHeaders: '',
    ...overrides,
  };
}

function makeSettings(overrides = {}) {
  return { lang: 'zh', layout: 'auto', speed: 'instant', sound: false, ...overrides };
}

function makeStore({ config = makeConfig(), settings = makeSettings(), sessions = [], activeSessionId = null } = {}) {
  return { version: 1, config, settings, activeSessionId, sessions };
}

function makeSession({
  id,
  modeId = 'rules',
  lang = 'zh',
  title,
  createdAt = Date.now() - 60_000,
  updatedAt = Date.now() - 1_000,
  turns = 1,
  messages,
}) {
  return {
    id,
    modeId,
    lang,
    title: title || `会话 ${id}`,
    createdAt,
    updatedAt,
    turns,
    messages: messages || [
      { role: 'user', content: '开始吧。' },
      { role: 'assistant', content: '<story>旧的故事。</story><choices>1. 一\n2. 二\n3. 三</choices>' },
    ],
  };
}

// ---------------------------------------------------------------------------
// 视图 / 导航
// ---------------------------------------------------------------------------

async function waitAppBoot(p, timeout = 30000) {
  await p.wait('document.readyState === "complete"', 'document 加载完成', timeout);
  await p.wait(
    '!!document.querySelector("#view-onboarding, #view-home, #view-game")',
    '应用视图挂载（#view-onboarding/#view-home/#view-game 至少一个存在）',
    20000,
  );
}

async function gotoApp(p) {
  await p.session.navigate(APP_URL, { timeout: 30000 });
  await waitAppBoot(p);
  await sleep(30);
}

async function reloadApp(p) {
  await p.session.reload({ timeout: 30000 });
  await waitAppBoot(p);
  await sleep(30);
}

async function waitView(p, name, timeout = 20000) {
  await p.wait(`__vis(document.querySelector(${q(`#view-${name}`)}))`, `#view-${name} 可见`, timeout);
}

async function assertViewOnly(p, expected) {
  const states = await p.run(`
    const out = {};
    for (const n of ['onboarding', 'home', 'game']) out[n] = __vis(document.querySelector('#view-' + n));
    return out;
  `);
  for (const name of ['onboarding', 'home', 'game']) {
    if (name === expected) assert(states[name] === true, `#view-${name} 应该可见，实际视图状态 ${JSON.stringify(states)}`);
    else assert(states[name] === false, `#view-${name} 应该隐藏，实际视图状态 ${JSON.stringify(states)}`);
  }
}

async function setDesktop(p) {
  await p.session.setViewport({ width: 1440, height: 720, mobile: false, deviceScaleFactor: 1 });
  await p.session.setUserAgent(DESKTOP_UA, { platform: 'Win32' });
  await sleep(50);
}

async function setPortrait(p) {
  await p.session.setViewport({ width: 390, height: 844, mobile: true, deviceScaleFactor: 1 });
  await p.session.setUserAgent(IPHONE_UA, { platform: 'iPhone' });
  await sleep(50);
}

/**
 * 固定界面语言。Headless 环境的 navigator.languages 未必是中文，而 §8.7 需要可控的语言基线，
 * 这里通过右上角 #lang-switch 的 [data-lang] 按钮切换（index.html 的真实结构）。
 */
async function ensureLang(p, lang) {
  const active = await p.run(`
    const btn = document.querySelector('#lang-switch [data-lang].is-active')
      || document.querySelector('#lang-switch [data-lang][aria-pressed="true"]');
    return btn ? btn.getAttribute('data-lang') : null;
  `);
  if (active === lang) return lang;
  const selector = `#lang-switch [data-lang="${lang}"]`;
  if (!(await p.exists(selector))) return active;
  const clicked = await p.click(selector);
  if (!clicked) return active;
  await p.wait(
    `(() => { try { const s = JSON.parse(localStorage.getItem(${q(STORE_KEY)}) || '{}'); return Boolean(s.settings && s.settings.lang === ${q(lang)}); } catch (_) { return false; } })()`,
    `界面语言切换为 ${lang}`,
    10000,
  );
  return lang;
}

async function startGame(p, cardIndex = 0) {
  await p.wait(`document.querySelectorAll('#mode-grid .mode-card').length > ${Number(cardIndex)}`, '模式卡渲染', 20000);
  const ok = await p.clickIndex('#mode-grid .mode-card', cardIndex);
  assert(ok, `点击第 ${cardIndex + 1} 张模式卡失败`);
  await waitView(p, 'game');
}

async function waitChoices(p, timeout = 25000) {
  await p.wait(`document.querySelectorAll('#choices-list .choice-btn').length >= 3`, '选项按钮渲染（>=3）', timeout);
  const count = await p.count('#choices-list .choice-btn');
  assert(count >= 3 && count <= 4, `选项数量应 3~4，实际 ${count}`);
  return count;
}

// ---------------------------------------------------------------------------
// v1.1 新手教程辅助
// ---------------------------------------------------------------------------

/** 「填入本页」按钮的候选文案（i18n 优先，回退中文/英文关键词）。 */
function useConfigActionTexts() {
  return [
    t('zh', 'guide.useConfigAction'),
    t('en', 'guide.useConfigAction'),
    '填入本页',
    '填入',
    'Use this config',
    'Use config',
    'Use',
  ].filter(Boolean);
}

/** 打开教程弹窗 → 断言内容非空 → 关闭。openerSelector 可为 #btn-open-guide / #btn-open-guide-settings。 */
async function assertGuideModalOpens(p, openerSelector) {
  assert(await p.exists(openerSelector), `缺少教程入口 ${openerSelector}`);
  const clicked = await p.click(openerSelector);
  assert(clicked, `点击教程入口 ${openerSelector} 失败`);

  await p.wait(
    '!!document.querySelector("#modal-guide") && __vis(document.querySelector("#modal-guide"))',
    `教程弹窗 #modal-guide 由 ${openerSelector} 打开`,
    12000,
  );
  const modalInfo = await p.run(`
    const modal = document.querySelector('#modal-guide');
    const body = document.querySelector('#guide-modal-body');
    return {
      modalText: __norm(modal ? modal.innerText || modal.textContent : ''),
      bodyText: __norm(body ? body.innerText || body.textContent : ''),
      bodyChildren: body ? body.children.length : 0,
      hasClose: Boolean(modal && modal.querySelector('[data-close-modal], [data-action="close"], .modal__close, button')),
    };
  `);
  assert(modalInfo.modalText.length > 60, `教程弹窗内容为空或过短（modalText=${modalInfo.modalText.length}）：${JSON.stringify(modalInfo).slice(0, 300)}`);
  assert(modalInfo.bodyText.length > 40, `#guide-modal-body 内容为空或过短（bodyText=${modalInfo.bodyText.length}）`);
  assert(modalInfo.bodyChildren >= 1, '#guide-modal-body 没有任何子节点（教程内容未渲染）');

  // 关闭：优先 [data-close-modal]，其次 [data-action="close"] / .modal__close
  const closeResult = await p.run(`
    const modal = document.querySelector('#modal-guide');
    if (!modal) return { ok: false, reason: '弹窗已不存在' };
    const closeBtn = modal.querySelector('[data-close-modal]')
      || modal.querySelector('[data-action="close"]')
      || modal.querySelector('.modal__close');
    if (!closeBtn) return { ok: false, reason: '找不到关闭按钮' };
    __click(closeBtn);
    return { ok: true };
  `);
  assert(closeResult.ok, `教程弹窗无法关闭：${JSON.stringify(closeResult)}`);
  await p.wait('!__vis(document.querySelector("#modal-guide"))', '教程弹窗关闭', 8000);
  return modalInfo;
}

// ---------------------------------------------------------------------------
// v1.1.1 布局识别回归辅助
// ---------------------------------------------------------------------------

/** 一次性应用「视口尺寸 + UA + 触屏」组合（不重载页面）。 */
async function applyEmulatedDevice(p, { width, height, userAgent, platform, touch, mobile }) {
  await p.session.setUserAgent(userAgent, { platform });
  await p.session.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: Boolean(mobile),
    screenOrientation: {
      type: width >= height ? 'landscapePrimary' : 'portraitPrimary',
      angle: width >= height ? 90 : 0,
    },
  });
  await p.session
    .send('Emulation.setTouchEmulationEnabled', { enabled: Boolean(touch), maxTouchPoints: touch ? 5 : 0 })
    .catch(() => {});
  await sleep(80);
}

async function readLayoutState(p) {
  return p.run(`
    const root = document.documentElement;
    const el = document.querySelector('.app-frame') || document.querySelector('#app');
    const rect = el ? el.getBoundingClientRect() : null;
    return {
      device: root.getAttribute('data-device') || root.dataset.device || null,
      layout: root.getAttribute('data-layout') || root.dataset.layout || null,
      ratio: rect && rect.height ? rect.width / rect.height : null,
      rect: rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null,
      inner: { width: window.innerWidth, height: window.innerHeight },
      touchPoints: navigator.maxTouchPoints || 0,
      coarse: Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches),
      ua: navigator.userAgent,
      env: window.__APPEALING_ENV__ || null,
    };
  `);
}

/**
 * 模拟一种设备组合（重载页面，让 layout-boot.js 在文档加载时执行），
 * 断言 data-device / data-layout / 舞台宽高比。
 */
async function assertLayoutCase(p, { name, width, height, userAgent, platform, touch, mobile, expect }) {
  await applyEmulatedDevice(p, { width, height, userAgent, platform, touch, mobile });
  await reloadApp(p);
  await p.wait('!!document.documentElement.getAttribute("data-layout")', `${name}：data-layout 已写入`, 15000);
  const state = await readLayoutState(p);
  const context = JSON.stringify({
    inner: state.inner,
    touchPoints: state.touchPoints,
    coarse: state.coarse,
    ua: state.ua.slice(0, 90),
  });
  eq(state.device, expect.device, `${name}：data-device 应为 ${expect.device}（${context}）`);
  eq(state.layout, expect.layout, `${name}：data-layout 应为 ${expect.layout}（${context}）`);
  truthy(state.ratio, `${name}：找不到 .app-frame 舞台元素`);
  assert(
    Math.abs(state.ratio - expect.ratio) <= 0.03,
    `${name}：舞台宽高比应 ≈ ${expect.ratio.toFixed(4)} ±0.03，实际 ${state.ratio?.toFixed(4)}（rect=${JSON.stringify(state.rect)}，inner=${JSON.stringify(state.inner)}）`,
  );
  if (typeof expect.check === 'function') expect.check(state);
  return state;
}

// ---------------------------------------------------------------------------
// 截图
// ---------------------------------------------------------------------------

const screenshots = {};

async function screenshot(p, name, expectedSize) {
  await p.eval('document.fonts.ready.then(() => true)').catch(() => {});
  await p
    .eval('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))')
    .catch(() => {});
  await sleep(150);
  const file = path.join(SCREENSHOTS_DIR, name);
  const shot = await p.session.screenshot(file);
  const size = readPngSize(shot.buffer);
  truthy(size, `截图 ${name} 不是合法 PNG`);
  if (expectedSize) {
    eq({ width: size.width, height: size.height }, expectedSize, `截图 ${name} 尺寸不符`);
  }
  assert(shot.buffer.length > 2000, `截图 ${name} 文件过小（${shot.buffer.length}B）`);
  screenshots[name] = { file, size, bytes: shot.buffer.length };
  console.log(`[qa] 截图 ${name} → ${path.relative(REPO_ROOT, file)} (${size.width}×${size.height}, ${shot.buffer.length}B)`);
  return file;
}

// ---------------------------------------------------------------------------
// 通用点击 / 诊断
// ---------------------------------------------------------------------------

async function tryClick(p, selector) {
  return p.click(selector).catch(() => false);
}

/** 在容器内按文案找按钮并点击；找不到返回诊断信息。 */
async function clickTextIn(p, containerSelector, texts, { excludePattern = 'delete|trash|remove|删除|移除|清空' } = {}) {
  const candidateTexts = texts.map((x) => String(x || '')).filter(Boolean);
  return p.run(`
    const root = document.querySelector(${q(containerSelector)});
    if (!root) return { ok: false, reason: '容器不存在: ' + ${q(containerSelector)} };
    const texts = ${JSON.stringify(candidateTexts)};
    const excl = new RegExp(${q(excludePattern)}, 'i');
    const nodes = [...root.querySelectorAll('button, [role="button"], a, [data-action]')];
    nodes.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
    for (const el of nodes) {
      const text = (el.textContent || '').trim();
      const label = (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.getAttribute('data-action') || '');
      if (excl.test(String(el.className || '') + ' ' + label)) continue;
      if (texts.some((x) => x && text.includes(x))) { __click(el); return { ok: true, text, cls: String(el.className || '') }; }
    }
    return {
      ok: false,
      reason: '未找到匹配按钮',
      candidates: nodes.map((el) => ({ text: (el.textContent || '').trim().slice(0, 30), cls: String(el.className || ''), label: (el.getAttribute('aria-label') || '').slice(0, 30) })),
    };
  `);
}

/** 在容器内找到一个会话行的删除按钮并点击。 */
async function clickDeleteIn(p, containerSelector, { sessionId, title }) {
  return p.run(`
    const root = document.querySelector(${q(containerSelector)});
    if (!root) return { ok: false, reason: '容器不存在: ' + ${q(containerSelector)} };
    const sid = ${q(sessionId || '')};
    const title = ${q(title || '')};
    const rows = [...root.querySelectorAll('[data-session-id], li, .session-item, .recent-item, article')];
    let row = sid ? rows.find((el) => el.getAttribute('data-session-id') === sid) : null;
    if (!row && title) row = rows.find((el) => (el.textContent || '').includes(title));
    const scope = row || root;
    const nodes = [...scope.querySelectorAll('button, [role="button"], a, [data-action]')];
    const del = nodes.find((el) => {
      const label = (String(el.className || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.getAttribute('data-action') || '')).toLowerCase();
      const text = (el.textContent || '').trim().toLowerCase();
      return /delete|trash|remove/.test(label) || /删除|移除|delete/.test(text);
    });
    if (!del) {
      return {
        ok: false,
        reason: '找不到删除按钮',
        rowFound: Boolean(row),
        candidates: nodes.map((el) => ({ text: (el.textContent || '').trim().slice(0, 24), cls: String(el.className || ''), label: el.getAttribute('aria-label') || '' })),
      };
    }
    __click(del);
    return { ok: true, clickedText: (del.textContent || '').trim(), rowFound: Boolean(row) };
  `);
}

async function confirmModal(p) {
  // 删除等操作会先弹 #modal-confirm（app.js confirmDialog），按钮 id 固定为 #btn-confirm-ok
  const appeared = await p
    .wait(
      '!!document.querySelector("#modal-confirm") && __vis(document.querySelector("#modal-confirm"))',
      '确认弹窗出现',
      5000,
    )
    .then(() => true)
    .catch(() => false);
  if (!appeared) return { ok: true, skipped: true };

  if (await p.visible('#btn-confirm-ok')) {
    const clicked = await p.click('#btn-confirm-ok');
    if (clicked) {
      await p.wait('!__vis(document.querySelector("#modal-confirm"))', '确认弹窗关闭', 8000).catch(() => {});
      return { ok: true, clicked: '#btn-confirm-ok' };
    }
  }

  const confirmTexts = [t('zh', 'confirm.ok'), t('zh', 'common.confirm'), '确认', '确定', '删除', 'Confirm', 'Delete', 'Yes']
    .filter(Boolean)
    .map((x) => String(x).toLowerCase());
  const cancelTexts = [t('zh', 'common.cancel'), t('zh', 'confirm.cancel'), '取消', 'Cancel']
    .filter(Boolean)
    .map((x) => String(x).toLowerCase());
  const res = await p.run(`
    const modal = document.querySelector('#modal-confirm');
    if (!modal) return { ok: false, reason: '#modal-confirm 不存在' };
    const confirmTexts = ${JSON.stringify(confirmTexts)};
    const cancelTexts = ${JSON.stringify(cancelTexts)};
    const nodes = [...modal.querySelectorAll('button, [role="button"], a, [data-action]')];
    for (const el of nodes) {
      const text = (el.textContent || '').trim().toLowerCase();
      const isCancel = cancelTexts.some((c) => c && text.includes(c));
      const isConfirm = confirmTexts.some((c) => c && text.includes(c));
      if (isCancel && !isConfirm) continue;
      if (isConfirm) { __click(el); return { ok: true, text: (el.textContent || '').trim() }; }
    }
    return { ok: false, reason: '确认按钮未找到', candidates: nodes.map((el) => (el.textContent || '').trim().slice(0, 24)) };
  `);
  if (res.ok) {
    await p.wait('!__vis(document.querySelector("#modal-confirm"))', '确认弹窗关闭', 8000).catch(() => {});
  }
  return res;
}

async function deleteSessionViaUI(p, { sessionId, title }) {
  await tryClick(p, '#btn-sessions');
  const modalShown = await p
    .wait('!!document.querySelector("#modal-sessions") && __vis(document.querySelector("#modal-sessions"))', '档案弹窗可见', 6000)
    .then(() => true)
    .catch(() => false);
  if (modalShown) {
    const del = await clickDeleteIn(p, '#modal-sessions', { sessionId, title });
    if (!del.ok) return { ok: false, path: 'modal', reason: del };
    const confirmed = await confirmModal(p);
    if (!confirmed.ok) return { ok: false, path: 'modal', reason: confirmed };
    return { ok: true, path: 'modal' };
  }
  // 回退：主页最近会话里的删除按钮
  const del = await clickDeleteIn(p, '#recent-list', { sessionId, title });
  if (!del.ok) return { ok: false, path: 'recent-list', reason: del };
  const confirmed = await confirmModal(p);
  if (!confirmed.ok) return { ok: false, path: 'recent-list', reason: confirmed };
  return { ok: true, path: 'recent-list' };
}

async function installDownloadProbe(p) {
  await p.run(`
    window.__qaDownload = window.__qaDownload || { blobUrls: 0, anchorClicks: 0, lastHref: null };
    if (!window.__qaPatchedDownloadProbe) {
      window.__qaPatchedDownloadProbe = true;
      const originalCreate = URL.createObjectURL;
      if (typeof originalCreate === 'function') {
        URL.createObjectURL = function (blob) {
          try { window.__qaDownload.blobUrls += 1; } catch (_) {}
          return originalCreate.call(URL, blob);
        };
      }
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        try {
          if (this.download) {
            // 只记录，不真正触发下载：headless 下真下载可能产生额外 console 噪声
            window.__qaDownload.anchorClicks += 1;
            window.__qaDownload.lastHref = this.href;
            return;
          }
        } catch (_) {}
        return originalClick.call(this);
      };
    }
    return true;
  `);
}

async function describePage(p) {
  if (!p) return null;
  try {
    return await p.run(`
      return {
        url: location.href,
        title: document.title,
        views: { onboarding: __vis(document.querySelector('#view-onboarding')), home: __vis(document.querySelector('#view-home')), game: __vis(document.querySelector('#view-game')) },
        device: document.documentElement.dataset.device || null,
        layout: document.documentElement.dataset.layout || null,
        storePresent: Boolean(localStorage.getItem(${q(STORE_KEY)})),
        visibleButtons: [...document.querySelectorAll('button, [role="button"]')]
          .filter(__vis)
          .map((el) => ({ id: el.id || null, text: (el.textContent || '').trim().slice(0, 24), cls: String(el.className || '') }))
          .slice(0, 40),
        storyText: __norm(document.querySelector('#story-log')?.innerText || '').slice(0, 260),
        onboardingStatus: __norm(document.querySelector('#onboarding-status')?.textContent || ''),
        choicesCount: document.querySelectorAll('#choices-list .choice-btn').length,
      };
    `);
  } catch (err) {
    return { error: firstLine(err) };
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

let mock = null;
let site = null;
let browser = null;
let page = null;
let P = null;
let I18N_LOADED = null;

const consoleErrors = [];
let passedSteps = 0;
let currentStep = 'setup';

function pushConsoleError(entry) {
  if (consoleErrors.length < 300) consoleErrors.push({ ...entry, ts: new Date().toISOString() });
}

function isIgnoredConsoleError(entry) {
  const text = String(entry.text || '');
  if (!text) return true;
  return [
    /Failed to load resource/i,
    /net::ERR/i,
    /favicon/i,
    /error401|badopenai/i,
    /status of 401/i,
    /401 \(Unauthorized\)/i,
    /Load failed|NetworkError|An error occurred while trying to fetch/i,
    /ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED/i,
  ].some((re) => re.test(text));
}

async function step(name, fn) {
  currentStep = name;
  console.log(`\n=== ${name} ===`);
  const started = Date.now();
  try {
    await fn();
  } catch (err) {
    if (P) {
      const info = await describePage(P).catch(() => null);
      console.log(`[qa] 页面诊断：${JSON.stringify(info, null, 2)}`);
    }
    throw err;
  }
  passedSteps += 1;
  console.log(`PASS ${name} (${Date.now() - started}ms)`);
}

async function cleanup() {
  const tasks = [];
  if (page) tasks.push(Promise.resolve(page.closeTarget?.()).catch(() => {}));
  if (browser) tasks.push(Promise.resolve(browser.close?.()).catch(() => {}));
  if (site) tasks.push(Promise.resolve(site.close?.()).catch(() => {}));
  if (mock) tasks.push(Promise.resolve(mock.close?.()).catch(() => {}));
  await Promise.allSettled(tasks);
  await sleep(100);
}

async function main() {
  await fsp.mkdir(SCREENSHOTS_DIR, { recursive: true });

  await loadOptionalModules();
  I18N_LOADED = Boolean(I18N);
  console.log(`[qa] i18n.js：${I18N ? '已加载（精确文案断言）' : '未就绪（宽松断言）'}`);
  console.log(`[qa] prompt.js：${PROMPT ? '已加载' : '未就绪'}`);
  console.log(`[qa] guide.js：${GUIDE ? '已加载（教程数据）' : '未就绪（DOM 文本回退）'}`);

  // =========================================================================
  // T0 v1.1 静态基线（Node 阶段，不需要浏览器）
  // =========================================================================
  await step('T0 §7 静态基线：guide.js 契约 / PROVIDER_PRESETS(DeepSeek=deepseek-flash) / index 钩子 / README 中英互链 / APP_VERSION=1.1.1', async () => {
    const result = await runStaticChecks({ root: REPO_ROOT });
    const failed = result.checks.filter((check) => !check.ok);
    console.log(`[qa] 静态检查 ${result.checks.length} 项：PASS ${result.checks.length - failed.length}，FAIL ${failed.length}`);
    for (const failure of result.failures) console.log(`[static] FAIL ${failure}`);
    if (!result.ok) throw new Error(`静态检查 ${failed.length} 项失败（详见上方 [static] FAIL 行）`);
  });

  if (STATIC_ONLY) {
    console.log('\nSTATIC CHECKS PASSED（--static-only，未启动浏览器）');
    return;
  }

  console.log('[qa] 启动 mock API server（127.0.0.1:8787）…');
  mock = await startMockServer();
  console.log(`[qa] mock server 就绪：${mock.listeningUrl}`);

  console.log('[qa] 启动静态服务器（127.0.0.1:8788）…');
  site = await startStaticServer({ root: REPO_ROOT, port: 8788 });
  console.log(`[qa] 静态服务器就绪：${site.url}`);

  const head = await fetch(APP_URL, { signal: AbortSignal.timeout(8000) }).catch((err) => ({ error: err }));
  if (!head || head.error || !head.ok) {
    const detail = head?.error ? firstLine(head.error) : `HTTP ${head?.status}`;
    throw new Error(
      `应用尚未就绪：GET ${APP_URL} → ${detail}。请确认 index.html 已提交到仓库根目录（静态服务器 root=${REPO_ROOT}）`,
    );
  }
  console.log('[qa] 应用入口可访问，启动无头 Edge…');

  try {
    browser = await launchEdge({ headless: true, port: 0 });
  } catch (err) {
    throw new Error(
      `${err.message}\n[qa] 浏览器部分需要完全权限（danger-full-access）的 shell；受限沙箱中 Edge 会 0x80000003 崩溃（契约 §1）。`,
    );
  }
  console.log(
    `[qa] Edge 已启动 pid=${browser.pid} devtoolsPort=${browser.port} version=${browser.browserVersion?.Browser || 'unknown'}`,
  );

  page = await browser.cdp.newPage();
  P = makePageApi(page);

  page.on('Runtime.consoleAPICalled', (event) => {
    if (event.params?.type !== 'error' && event.params?.type !== 'assert') return;
    const text = (event.params.args || [])
      .map((arg) => arg.value ?? arg.unserializableValue ?? arg.description ?? '')
      .join(' ');
    pushConsoleError({ source: `console.${event.params.type}`, text });
  });
  page.on('Runtime.exceptionThrown', (event) => {
    const details = event.params?.exceptionDetails;
    pushConsoleError({
      source: 'exception',
      text: details?.exception?.description || details?.text || 'unknown exception',
    });
  });
  page.on('Log.entryAdded', (event) => {
    const entry = event.params?.entry;
    if (entry?.level !== 'error') return;
    pushConsoleError({ source: 'log', text: `${entry.text}${entry.url ? ' @ ' + entry.url : ''}` });
  });

  await setDesktop(P);
  await gotoApp(P);

  // =========================================================================
  // §8.1 首次访问
  // =========================================================================
  await step('T1 §8.1 首次访问（清空 localStorage）→ 引导页 + 协议默认 openai + 预置 chips', async () => {
    await clearStorage(P);
    await reloadApp(P);

    await waitView(P, 'onboarding');
    await assertViewOnly(P, 'onboarding');

    for (const selector of [
      '#onboarding-form',
      '#input-base-url',
      '#input-api-key',
      '#input-model',
      '#btn-test-connection',
      '#btn-save-config',
      '#onboarding-status',
      '#preset-chips',
      '#protocol-switch',
    ]) {
      assert(await P.exists(selector), `缺少契约 §7 钩子元素 ${selector}`);
    }
    for (const selector of [
      '#onboarding-form',
      '#input-base-url',
      '#input-api-key',
      '#input-model',
      '#btn-test-connection',
      '#btn-save-config',
    ]) {
      assert(await P.visible(selector), `${selector} 在引导页不可见`);
    }
    for (const selector of ['#toast-root', '#live-region']) {
      assert(await P.exists(selector), `缺少契约 §7 钩子元素 ${selector}`);
    }

    // 协议默认 openai
    const protocolState = await P.run(`
      const root = document.querySelector('#protocol-switch');
      if (!root) return { ok: false, reason: '缺少 #protocol-switch' };
      const select = root.tagName === 'SELECT' ? root : root.querySelector('select');
      if (select) {
        const optionText = select.selectedOptions && select.selectedOptions[0] ? select.selectedOptions[0].textContent : '';
        return { ok: /openai/i.test(select.value || '') || /openai/i.test(optionText || ''), reason: 'select', value: select.value, optionText };
      }
      const attributeNodes = [...root.querySelectorAll('[data-protocol], [data-value]')];
      const isActive = (el) =>
        el.getAttribute('aria-pressed') === 'true' ||
        el.getAttribute('aria-checked') === 'true' ||
        Boolean(el.checked) ||
        Boolean(el.querySelector && el.querySelector('input:checked')) ||
        /(^|\\s|-)(active|selected|checked|current|is-active)(\\s|$|-)/.test(String(el.className || ''));
      const explicit = attributeNodes.map((el) => ({
        value: String(el.getAttribute('data-protocol') || el.getAttribute('data-value') || '').toLowerCase(),
        active: isActive(el),
        text: (el.textContent || '').trim().slice(0, 30),
      }));
      if (explicit.length) {
        const openai = explicit.find((x) => /openai/.test(x.value));
        const actives = explicit.filter((x) => x.active);
        return {
          ok: Boolean(openai) && actives.length > 0 && actives.every((x) => /openai/.test(x.value)),
          reason: 'data-protocol',
          explicit,
        };
      }
      const nodes = [...root.querySelectorAll('button, [role="button"], label, a')];
      const openaiNode = nodes.find((el) => /openai/i.test(el.textContent || ''));
      if (!openaiNode) return { ok: false, reason: '既无 data-protocol 也无 OpenAI 文本按钮', html: root.innerHTML.slice(0, 400) };
      return {
        ok: isActive(openaiNode),
        reason: 'text-match',
        explicit: nodes.map((el) => ({ text: (el.textContent || '').trim().slice(0, 30), active: isActive(el) })),
      };
    `);
    assert(protocolState.ok, `协议默认应为 openai，判定结果：${JSON.stringify(protocolState)}`);

    // 预置服务商 chips
    const chips = await P.run(`
      const root = document.querySelector('#preset-chips');
      if (!root) return { count: 0, text: '', buttons: 0 };
      const kids = [...root.children].filter((el) => el.nodeType === 1);
      return {
        count: kids.length,
        buttons: root.querySelectorAll('button, [role="button"], a, [data-provider]').length,
        text: __norm(root.textContent),
      };
    `);
    assert(chips.count >= 5, `预置服务商 chips 数量不足：${JSON.stringify(chips)}`);
    assert(/openai/i.test(chips.text), `预置 chips 未包含 OpenAI：${JSON.stringify(chips.text.slice(0, 200))}`);
    assert(/anthropic/i.test(chips.text), `预置 chips 未包含 Anthropic：${JSON.stringify(chips.text.slice(0, 200))}`);

    // headless 的默认 navigator 语言可能不同，先把界面固定为中文，保证后续 mock 返回中文、截图也是中文界面
    await ensureLang(P, 'zh');
  });

  // =========================================================================
  // v1.1 §7 T-新1/2/3/4：新手教程区 + 填入本页 + DeepSeek 预置 + 教程弹窗
  // =========================================================================
  await step('T1G §7 新手教程区：guide-step≥3 / guide-concept≥3 / provider-card≥8+外链 / 填入本页 / DeepSeek 预置 / 教程弹窗', async () => {
    // --- T-新1：教程区结构与数量 ---
    await P.wait('document.querySelectorAll("#guide-steps .guide-step").length >= 3', '教程三步渲染（#guide-steps .guide-step）', 15000);
    await P.wait('document.querySelectorAll("#guide-concepts .guide-concept").length >= 3', '概念区渲染（#guide-concepts .guide-concept）', 15000);
    await P.wait('document.querySelectorAll("#guide-providers .provider-card").length >= 8', '服务商卡渲染（#guide-providers .provider-card >=8）', 15000);

    const stepCount = await P.count('#guide-steps .guide-step');
    const conceptCount = await P.count('#guide-concepts .guide-concept');
    const cardCount = await P.count('#guide-providers .provider-card');
    assert(stepCount >= 3, `教程步骤应 ≥3，实际 ${stepCount}`);
    assert(conceptCount >= 3, `教程概念应 ≥3，实际 ${conceptCount}`);
    assert(cardCount >= 8, `服务商卡应 ≥8，实际 ${cardCount}`);
    if (Array.isArray(GUIDE?.GUIDE_PROVIDERS)) eq(cardCount, GUIDE.GUIDE_PROVIDERS.length, '服务商卡数量应等于 guide.js GUIDE_PROVIDERS');
    if (Array.isArray(GUIDE?.GUIDE_STEPS)) eq(stepCount, GUIDE.GUIDE_STEPS.length, '教程步骤数应等于 guide.js GUIDE_STEPS');
    if (Array.isArray(GUIDE?.GUIDE_CONCEPTS)) eq(conceptCount, GUIDE.GUIDE_CONCEPTS.length, '教程概念数应等于 guide.js GUIDE_CONCEPTS');

    // 每张卡都有 https 外链，且 target=_blank、rel 含 noopener
    const cardLinks = await P.run(`
      const cards = [...document.querySelectorAll('#guide-providers .provider-card')];
      return cards.map((card) => ({
        name: __norm(card.textContent).slice(0, 40),
        links: [...card.querySelectorAll('a[href]')].map((a) => ({
          href: a.getAttribute('href') || '',
          target: a.getAttribute('target') || '',
          rel: a.getAttribute('rel') || '',
        })),
      }));
    `);
    const noExternal = cardLinks.filter((card) => !card.links.some((link) => /^https:\/\//i.test(link.href)));
    assert(noExternal.length === 0, `以下服务商卡缺少 https 外链：${JSON.stringify(noExternal.map((card) => card.name))}`);
    const badLinkAttrs = cardLinks.flatMap((card) =>
      card.links
        .filter((link) => /^https:\/\//i.test(link.href))
        .filter((link) => link.target !== '_blank' || !/noopener/i.test(link.rel))
        .map((link) => ({ card: card.name, href: link.href, target: link.target, rel: link.rel })),
    );
    assert(badLinkAttrs.length === 0, `以下外链缺少 target=_blank / rel 含 noopener：${JSON.stringify(badLinkAttrs.slice(0, 6))}`);

    // --- T-新3：chips 里 DeepSeek 预设 = deepseek-flash ---
    const chipSelector = '#preset-chips [data-preset="deepseek"]';
    assert(await P.exists(chipSelector), '缺少 DeepSeek 预设 chip（#preset-chips [data-preset="deepseek"]）');
    await P.click(chipSelector);
    await sleep(100);
    eq(await P.run('return document.getElementById("input-base-url").value;'), 'https://api.deepseek.com', 'DeepSeek 预设 baseUrl 应为 https://api.deepseek.com');
    eq(await P.run('return document.getElementById("input-model").value;'), 'deepseek-flash', 'DeepSeek 预设 model 应为 deepseek-flash');
    eq(
      await P.run(`const el = document.querySelector('#protocol-switch [data-protocol].is-active'); return el ? el.dataset.protocol : null;`),
      'openai',
      'DeepSeek 预设协议应为 openai',
    );

    // --- T-新2：点 DeepSeek 卡「填入本页」---
    const useTexts = useConfigActionTexts();
    const fillResult = await P.run(`
      const cards = [...document.querySelectorAll('#guide-providers .provider-card')];
      const card = cards.find((el) => /deepseek/i.test(el.textContent || ''));
      if (!card) return { ok: false, reason: '未找到 DeepSeek 服务商卡' };
      const texts = ${JSON.stringify(useTexts)};
      const nodes = [...card.querySelectorAll('button, [role="button"], a, [data-action]')];
      const btn = nodes.find((el) => texts.some((text) => (el.textContent || '').includes(text)))
        || nodes.find((el) => /填入|填充|use/i.test(el.textContent || ''));
      if (!btn) return { ok: false, reason: '卡片内找不到「填入本页」按钮', candidates: nodes.map((el) => (el.textContent || '').trim().slice(0, 24)) };
      __click(btn);
      return { ok: true, text: (btn.textContent || '').trim() };
    `);
    assert(fillResult.ok, `DeepSeek 卡「填入本页」不可用：${JSON.stringify(fillResult)}`);
    await sleep(150);
    eq(await P.run('return document.getElementById("input-base-url").value;'), 'https://api.deepseek.com', '「填入本页」后 baseUrl 应为 https://api.deepseek.com');
    eq(await P.run('return document.getElementById("input-model").value;'), 'deepseek-flash', '「填入本页」后 model 应为 deepseek-flash');
    eq(
      await P.run(`const el = document.querySelector('#protocol-switch [data-protocol].is-active'); return el ? el.dataset.protocol : null;`),
      'openai',
      '「填入本页」后协议应为 openai',
    );

    // --- T-新4（入口一）：#btn-open-guide 打开教程弹窗 ---
    await assertGuideModalOpens(P, '#btn-open-guide');
    await waitView(P, 'onboarding');

    await screenshot(P, 'onboarding-landscape.png', { width: 1440, height: 720 });
  });

  // =========================================================================
  // §8.2 配置 + 测试连接 + 保存
  // =========================================================================
  await step('T2 §8.2 配置 OpenAI 指向 mock → 测试连接成功 → 保存进入主页并写 localStorage', async () => {
    await mockReset();
    await P.setValue('#input-base-url', `${MOCK_BASE}/openai/v1`);
    await P.setValue('#input-api-key', 'sk-mock-openai');
    await P.setValue('#input-model', 'mock-gpt-4o');
    await sleep(50);

    const clickedTest = await P.click('#btn-test-connection');
    assert(clickedTest, '点击 #btn-test-connection 失败');

    const testLog = await waitMockRequest((log) => log.path === '/openai/v1/chat/completions', {
      timeout: 20000,
      description: '点击「测试连接」后应发出 OpenAI chat/completions 请求',
    });
    eq(testLog.body?.model, 'mock-gpt-4o', '测试连接请求的 model 不正确（配置未生效）');
    assert(
      Array.isArray(testLog.body?.messages) && testLog.body.messages.length >= 1,
      `测试连接请求缺少 messages：${JSON.stringify(testLog.body)?.slice(0, 300)}`,
    );
    assert(
      String(testLog.headers?.authorization || '').toLowerCase().includes('sk-mock-openai'),
      `测试连接请求缺少 Authorization API Key：${JSON.stringify(testLog.headers?.authorization)}`,
    );

    await P.wait(
      '(() => { const el = document.querySelector("#onboarding-status"); return __vis(el) && __norm(el.textContent).length > 0; })()',
      '#onboarding-status 出现测试结果文案',
      15000,
    );
    const status = await P.run(`
      const el = document.querySelector('#onboarding-status');
      if (!el) return null;
      return { text: __norm(el.textContent), cls: String(el.className || ''), state: el.getAttribute('data-state') || '' };
    `);
    truthy(status?.text, '#onboarding-status 无文案');
    const successText = t('zh', 'onboarding.testSuccess');
    const failedText = t('zh', 'onboarding.testFailed');
    if (successText) {
      assert(
        status.text.includes(successText) || /success|ok/i.test(`${status.cls} ${status.state}`),
        `测试连接应成功，实际状态：${JSON.stringify(status)}`,
      );
    } else if (failedText) {
      assert(!status.text.includes(failedText), `测试连接失败：${JSON.stringify(status)}`);
    }

    await sleep(100);
    const clickedSave = await P.click('#btn-save-config');
    assert(clickedSave, '点击 #btn-save-config 失败');
    await waitView(P, 'home');
    await assertViewOnly(P, 'home');

    const store = await readStore(P);
    truthy(store, `保存配置后 localStorage.${STORE_KEY} 不存在`);
    eq(store.version, 1, '存储 version 应为 1');
    eq(store.config?.protocol, 'openai', 'config.protocol 应为 openai');
    eq(store.config?.baseUrl, `${MOCK_BASE}/openai/v1`, 'config.baseUrl 未保存');
    eq(store.config?.apiKey, 'sk-mock-openai', 'config.apiKey 未保存');
    eq(store.config?.model, 'mock-gpt-4o', 'config.model 未保存');
    eq(typeof store.config?.temperature, 'number', 'config.temperature 应为数字');
    eq(typeof store.config?.maxTokens, 'number', 'config.maxTokens 应为数字');
    eq(store.settings?.lang, 'zh', 'settings.lang 应为 zh');
    eq(store.settings?.layout, 'auto', 'settings.layout 应为 auto');
    assert(['slow', 'normal', 'fast', 'instant'].includes(store.settings?.speed), `settings.speed 非法：${store.settings?.speed}`);
    eq(typeof store.settings?.sound, 'boolean', 'settings.sound 应为 boolean');
    assert(Array.isArray(store.sessions), 'store.sessions 应为数组');

    await P.wait(`document.querySelectorAll('#mode-grid .mode-card').length >= 4`, '4 个模式卡渲染', 15000);
    eq(await P.count('#mode-grid .mode-card'), 4, '模式卡数量应为 4（rules/duel/court/jianghu）');

    await screenshot(P, 'home-landscape.png', { width: 1440, height: 720 });
  });

  // =========================================================================
  // §8.3 开新局：流式开场 → 打字结束 → 选项
  // =========================================================================
  await step('T3 §8.3 点模式卡 → 流式开场 → 打字结束 → 3~4 个 .choice-btn', async () => {
    const store = await readStore(P);
    store.settings.speed = 'instant';
    await writeStore(P, store);
    await reloadApp(P);
    await waitView(P, 'home');
    await mockReset();

    await startGame(P, 0);
    await P.wait(`document.querySelectorAll('#story-log .story-turn').length >= 1`, '.story-turn 渲染', 20000);
    const choiceCount = await waitChoices(P, 25000);

    const storyText = await P.text('#story-log');
    includes(storyText, '第 1 回合', '故事正文未包含 mock 第一回合标记（流式响应未解析？）');
    assert(!storyText.includes('<story>') && !storyText.includes('<choices>'), '故事正文残留 <story>/<choices> 协议标签');
    assert(/铜钥|客栈/.test(storyText), `故事正文缺少 mock 第一回合内容：${storyText.slice(0, 200)}`);

    await P.wait('document.querySelectorAll(".typing-cursor").length === 0', '打字光标消失（打字动画结束）', 15000);

    const log = await waitMockRequest((item) => item.path === '/openai/v1/chat/completions', {
      timeout: 15000,
      description: '开局应发出 OpenAI chat/completions 请求',
    });
    eq(log.body?.stream, true, '开局请求应为流式（stream:true）');
    eq(log.body?.model, 'mock-gpt-4o', '开局请求 model 不正确');
    eq(log.body?.messages?.length, 2, '开局请求 messages 长度应为 2（system + 开场 user）');
    eq(log.body?.messages?.[0]?.role, 'system', 'messages[0] 应为 system');
    eq(log.body?.messages?.[1]?.role, 'user', 'messages[1] 应为 user 开场消息');
    const systemPrompt = String(log.body?.messages?.[0]?.content || '');
    includes(systemPrompt, '<story>', 'system prompt 未包含输出协议 <story>');
    includes(systemPrompt, '<choices>', 'system prompt 未包含输出协议 <choices>');
    assert(/规则/.test(systemPrompt), 'system prompt 未包含规则模式设定（首张模式卡应为 rules）');
    includes(String(log.headers?.authorization || '').toLowerCase(), 'sk-mock-openai', 'OpenAI 请求缺 Authorization 头');

    console.log(`[qa] 第一回合选项（${choiceCount}）：${JSON.stringify(
      await P.run('return [...document.querySelectorAll("#choices-list .choice-btn")].map((el) => (el.textContent || "").trim());'),
    )}`);
  });

  // =========================================================================
  // §8.6 Markdown / LaTeX
  // =========================================================================
  await step('T4 §8.6 Markdown/LaTeX 渲染（strong/code/blockquote/.katex）', async () => {
    const strong = await P.count('#story-log .story-turn strong');
    const code = await P.count('#story-log .story-turn code');
    const blockquote = await P.count('#story-log .story-turn blockquote');
    const katex = await P.count('#story-log .story-turn .katex');
    const katexDisplay = await P.count('#story-log .story-turn .katex-display');
    assert(strong >= 2, `加粗未渲染（strong 数量 ${strong}）`);
    assert(code >= 1, `行内代码未渲染（code 数量 ${code}）`);
    assert(blockquote >= 1, `引用未渲染（blockquote 数量 ${blockquote}）`);
    assert(katex >= 2, `KaTeX 未渲染（.katex 数量 ${katex}；正文含行内 + 块级公式）`);
    assert(katexDisplay >= 1, `块级公式未按 display 模式渲染（.katex-display 数量 ${katexDisplay}；多行 $$ 应先压成单行）`);

    const storyText = await P.text('#story-log');
    assert(!storyText.includes('**'), `正文仍残留未渲染的 ** 标记：${storyText.slice(0, 200)}`);
    assert(!storyText.includes('$$'), `正文仍残留未渲染的 $$ 标记：${storyText.slice(0, 200)}`);

    const choices = await P.run(
      'return [...document.querySelectorAll("#choices-list .choice-btn")].map((el) => (el.textContent || "").trim());',
    );
    assert(choices.length >= 3 && choices.every(Boolean), `选项文案异常：${JSON.stringify(choices)}`);

    await screenshot(P, 'game-landscape.png', { width: 1440, height: 720 });
  });

  // =========================================================================
  // §8.4 第二回合：历史 + system prompt + localStorage
  // =========================================================================
  await step('T5 §8.4 点击选项 → 第二回合（历史 messages / system prompt / localStorage turns=2）', async () => {
    await mockReset();
    // .choice-btn 文本包含序号（如「一」/「01」），点击时发送的是纯选项文本，需要取 .choice-btn__text
    const firstChoice = await P.run(`
      const el = document.querySelector('#choices-list .choice-btn');
      if (!el) return null;
      const textEl = el.querySelector('.choice-btn__text');
      const raw = (textEl ? textEl.textContent : el.textContent) || '';
      return raw.trim().replace(/^[一二三四五六七八九十\\d]+[、.．)）]?\\s*/, '');
    `);
    truthy(firstChoice, '没有可点击的选项按钮');
    const clicked = await P.clickIndex('#choices-list .choice-btn', 0);
    assert(clicked, '点击第一个选项失败');

    const log = await waitMockRequest(
      (item) => item.path === '/openai/v1/chat/completions' && Array.isArray(item.body?.messages) && item.body.messages.length === 4,
      { timeout: 25000, description: '第二回合请求（messages 长度应为 4）' },
    );
    const roles = (log.body.messages || []).map((message) => message.role).join(',');
    eq(roles, 'system,user,assistant,user', '第二回合请求 messages 角色序列不正确');
    includes(String(log.body.messages[2]?.content || ''), '<story>', '历史 assistant 原文未保留 <story>');
    includes(String(log.body.messages[2]?.content || ''), '<choices>', '历史 assistant 原文未保留 <choices>');
    eq(normText(log.body.messages[3]?.content), normText(firstChoice), '第二回合 user 消息应等于所点选项原文');
    eq(log.body.stream, true, '第二回合请求应为流式');

    await waitChoices(P, 25000);
    await P.wait(`/第 2 回合/.test(document.querySelector('#story-log')?.innerText || '')`, '第二回合正文渲染', 25000);

    const store = await readStore(P);
    truthy(store.activeSessionId, 'localStorage.activeSessionId 未设置');
    const active = (store.sessions || []).find((session) => session.id === store.activeSessionId);
    truthy(active, 'activeSessionId 对应的会话不存在');
    eq(active.messages?.length, 4, '会话 messages 长度应为 4');
    eq(active.turns, 2, '会话 turns 应为 2');
    eq(active.modeId, 'rules', '会话 modeId 应为 rules');
    eq(active.lang, 'zh', '会话 lang 应为 zh');
    assert(typeof active.title === 'string' && active.title.length > 0, `会话 title 为空：${JSON.stringify(active.title)}`);
    eq(store.sessions.length, 1, '会话数量应为 1');
    // 注意：两回合后的 messages 顺序是 [开场 user, assistant, 玩家选择 user, assistant]（契约 §6）
    eq(active.messages?.[2]?.role, 'user', '会话第 3 条消息应为玩家选择（user）');
    eq(active.messages?.[3]?.role, 'assistant', '会话第 4 条消息应为 assistant');
    includes(String(active.messages?.[1]?.content || ''), '<story>', '会话里 assistant 原文应保留协议标签');
    includes(String(active.messages?.[3]?.content || ''), '<choices>', '会话里第二回合 assistant 原文应保留协议标签');
  });

  // =========================================================================
  // §8.8 刷新持久化 + 继续会话
  // =========================================================================
  await step('T6 §8.8 刷新页面 → 配置/会话仍在 → 主页最近会话 → 继续后可见历史回合', async () => {
    await reloadApp(P);
    await waitView(P, 'home');

    const store = await readStore(P);
    truthy(store, '刷新后 localStorage 丢失');
    eq(store.config?.model, 'mock-gpt-4o', '刷新后配置 model 丢失');
    eq(store.settings?.lang, 'zh', '刷新后 settings.lang 丢失');
    assert(store.sessions?.length >= 1, '刷新后会话丢失');

    await P.wait(`document.querySelectorAll('#recent-list li, #recent-list .recent-item, #recent-list [data-session-id]').length >= 1`, '主页最近会话渲染', 15000);

    const resume = await clickTextIn(
      P,
      '#recent-list',
      [t('zh', 'home.resumeButton'), t('zh', 'sessions.continue'), '继续', 'Continue', 'Resume'],
      { excludePattern: 'delete|trash|remove|删除|移除' },
    );
    if (resume.ok) {
      // 已点击
    } else {
      const fallback = await P.run(`
        const root = document.querySelector('#recent-list');
        if (!root) return { ok: false };
        const item = root.querySelector('[data-session-id]') || root.querySelector('li, .recent-item, article');
        if (!item) return { ok: false, reason: '没有可点击的最近会话项' };
        __click(item);
        return { ok: true, fallback: true };
      `);
      assert(fallback.ok, `最近会话里找不到「继续」按钮：${JSON.stringify(resume)} / fallback=${JSON.stringify(fallback)}`);
    }

    await waitView(P, 'game');
    await P.wait(`document.querySelectorAll('#story-log .story-turn').length >= 2`, '历史回合渲染（>=2）', 20000);
    const storyText = await P.text('#story-log');
    includes(storyText, '第 1 回合', '继续会话后缺少第一回合历史');
    includes(storyText, '第 2 回合', '继续会话后缺少第二回合历史');
  });

  // =========================================================================
  // §8.7 语言切换
  // =========================================================================
  await step('T7 §8.7 切换 English → 界面文案变化 → 后续请求 system prompt 含 English', async () => {
    const titleSelector = '[data-i18n="game.choicesTitle"]';
    const titleZh = await P.text(titleSelector);
    await mockReset();

    // 真实 DOM：语言按钮是 #lang-switch 内的 [data-lang] 子按钮（点击容器不会触发切换）
    const langSelector = '#lang-switch [data-lang="en"]';
    const clicked = (await P.exists(langSelector)) ? await P.click(langSelector) : await P.click('#lang-switch');
    assert(clicked, '点击语言切换按钮（English）失败');

    await P.wait(
      `(() => { try { const s = JSON.parse(localStorage.getItem(${q(STORE_KEY)}) || '{}'); return Boolean(s.settings && s.settings.lang === 'en'); } catch (_) { return false; } })()`,
      'localStorage settings.lang 变为 en',
      10000,
    );

    // 契约 §8.7：断言一个已知 key 的文案变成英文（i18n.js 可直接导入时用精确值）
    const expectedTitle = t('en', 'game.choicesTitle');
    if (expectedTitle) {
      await P.wait(
        `(() => { const el = document.querySelector(${q(titleSelector)}); return Boolean(el) && __vis(el) && __norm(el.textContent) === ${q(expectedTitle)}; })()`,
        `已知 key game.choicesTitle 的英文文案应为 ${JSON.stringify(expectedTitle)}`,
        10000,
      );
      eq(await P.text(titleSelector), expectedTitle, '切换英文后 game.choicesTitle 文案不正确');
      assert(titleZh !== expectedTitle, '切换英文后 game.choicesTitle 文案没有变化');
    } else {
      const pageText = await P.run('return __norm(document.body.innerText);');
      assert(/[A-Za-z]{4,}\s+[A-Za-z]{2,}/.test(pageText), '切换英文后页面没有英文文案');
    }

    const storeAfterSwitch = await readStore(P);
    eq(storeAfterSwitch.settings?.lang, 'en', '切换后 settings.lang 应为 en');

    await P.wait('__vis(document.querySelector("#input-free-action"))', '#input-free-action 可见', 10000);
    await P.setValue('#input-free-action', 'Look around carefully.');
    const sent = await P.click('#btn-send-action');
    assert(sent, '点击 #btn-send-action 失败');

    const log = await waitMockRequest(
      (item) =>
        item.path === '/openai/v1/chat/completions' &&
        /Look around carefully\./.test(JSON.stringify(item.body?.messages || [])),
      { timeout: 25000, description: '英文自由行动请求' },
    );
    const systemPrompt = String(log.body?.messages?.[0]?.content || '');
    assert(/English/.test(systemPrompt), '英文界面下 system prompt 未包含 English');
    assert(!/当前语言：简体中文/.test(systemPrompt), '英文界面下 system prompt 仍含中文语言指令');
    await P.wait(`/Turn 3/.test(document.querySelector('#story-log')?.innerText || '')`, '英文续写回合正文（Turn 3）渲染', 25000);
  });

  // =========================================================================
  // §8.5 跳过打字
  // =========================================================================
  await step('T8 §8.5 「跳过打字」在流式/打字中可用，点击后立即完整显示', async () => {
    const slowStore = makeStore({
      config: makeConfig({ baseUrl: `${MOCK_BASE}/slowopenai/v1` }),
      settings: makeSettings({ speed: 'slow' }),
    });
    await writeStore(P, slowStore);
    await reloadApp(P);
    await waitView(P, 'home');
    await mockReset();

    let slowResponse = null;
    const responsePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error('等待 slowopenai 响应完成超时（30s）'));
      }, 30000);
      const off = mock.on('response', (record) => {
        if (record.variant === 'slowopenai' && record.status === 200) {
          clearTimeout(timer);
          off();
          resolve(record);
        }
      });
    });

    await startGame(P, 0);
    await P.wait(
      '(() => { const el = document.querySelector("#btn-skip-typing"); return __vis(el) && !el.disabled; })()',
      '流式期间 #btn-skip-typing 可见且可用',
      12000,
    );
    // 等第一段正文出现，确保 Typewriter 已创建（skip 按钮 handler 依赖 ui.typewriter）
    await P.wait(
      '((document.querySelector("#story-log .story-turn__body")?.textContent || "").length >= 1)',
      '流式正文开始出现',
      12000,
    );
    const beforeSkip = await P.run(`
      const el = document.querySelector('#story-log');
      return { textLen: (el ? el.innerText : '').length, cursor: document.querySelectorAll('.typing-cursor').length };
    `);
    const skipClicked = await P.click('#btn-skip-typing');
    assert(skipClicked, '点击 #btn-skip-typing 失败');

    slowResponse = await responsePromise;
    truthy(slowResponse, 'slowopenai 响应未完成');

    const expected = buildReply({ lang: 'zh', turn: 1, variant: 'slowopenai' });
    const expectedStory = normText(expected.story);
    truthy(expectedStory.length > 80, 'mock slow 正文异常过短');

    const started = Date.now();
    let finalStory = '';
    while (Date.now() - started < 6000) {
      const info = await P.run(`
        const el = document.querySelector('#story-log');
        return { text: __norm(el ? el.innerText : ''), cursor: document.querySelectorAll('.typing-cursor').length };
      `);
      finalStory = info.text;
      if (finalStory.includes(expectedStory)) break;
      await sleep(100);
    }
    assert(
      finalStory.includes(expectedStory),
      `点击跳过打字后正文未完整显示（6s 内）。期望片段尾部：${JSON.stringify(expectedStory.slice(-60))}；实际尾部：${JSON.stringify(finalStory.slice(-120))}`,
    );
    eq(await P.count('.typing-cursor'), 0, '跳过打字后 .typing-cursor 应消失');
    console.log(`[qa] 跳过打字：点击前 ${beforeSkip.textLen} 字符，完成后 ${finalStory.length} 字符（无 skip 时 slow 速度需要更久）`);

    const log = await waitMockRequest((item) => item.path === '/slowopenai/v1/chat/completions', {
      timeout: 8000,
      description: '慢速请求应发往 /slowopenai 路径',
    });
    eq(log.body?.stream, true, '慢速请求应为流式');
  });

  // =========================================================================
  // §8.9 Anthropic 协议
  // =========================================================================
  await step('T9 §8.9 Anthropic 协议：x-api-key / anthropic-version / dangerous-direct-browser-access + 流式解析', async () => {
    await writeStore(
      P,
      makeStore({
        config: makeConfig({
          protocol: 'anthropic',
          baseUrl: `${MOCK_BASE}/anthropic/v1`,
          apiKey: 'sk-ant-mock',
          model: 'mock-claude',
        }),
        settings: makeSettings(),
      }),
    );
    await reloadApp(P);
    await waitView(P, 'home');
    await mockReset();

    await startGame(P, 0);
    await waitChoices(P, 25000);

    const log = await waitMockRequest((item) => item.path === '/anthropic/v1/messages', {
      timeout: 20000,
      description: 'Anthropic 协议请求应发往 /anthropic/v1/messages',
    });
    eq(log.headers?.['x-api-key'], 'sk-ant-mock', 'Anthropic 请求缺少正确的 x-api-key 头');
    eq(log.headers?.['anthropic-version'], '2023-06-01', 'Anthropic 请求缺少 anthropic-version: 2023-06-01');
    eq(
      String(log.headers?.['anthropic-dangerous-direct-browser-access']).toLowerCase(),
      'true',
      'Anthropic 请求缺少 anthropic-dangerous-direct-browser-access: true',
    );
    eq(log.body?.model, 'mock-claude', 'Anthropic 请求 model 不正确');
    eq(log.body?.stream, true, 'Anthropic 请求应为流式');
    assert(typeof log.body?.system === 'string' && log.body.system.length > 50, `Anthropic 请求 system 字段缺失或过短：${typeof log.body?.system}`);
    assert(/English|简体中文/.test(log.body.system), 'Anthropic system 字段缺少语言指令');
    assert(Array.isArray(log.body?.messages) && log.body.messages.length >= 1, 'Anthropic 请求 messages 缺失');
    assert(!log.body.messages.some((message) => message?.role === 'system'), 'Anthropic 协议 system 不应放 messages 里');

    const storyText = await P.text('#story-log');
    includes(storyText, '第 1 回合', 'Anthropic SSE 未正确解析出正文');
    const store = await readStore(P);
    const active = (store.sessions || []).find((session) => session.id === store.activeSessionId);
    eq(active?.messages?.[1]?.role, 'assistant', 'Anthropic 回合未写入 localStorage');
    includes(String(active?.messages?.[1]?.content || ''), '<choices>', 'Anthropic 回合 assistant 原文不完整');
  });

  // =========================================================================
  // §8.10 错误兜底
  // =========================================================================
  await step('T10 §8.10 错误兜底：401 提示+重试；badopenai 兜底 3 选项且渲染正常', async () => {
    // --- 401 ---
    await writeStore(
      P,
      makeStore({
        config: makeConfig({ baseUrl: `${MOCK_BASE}/error401openai/v1` }),
        settings: makeSettings(),
      }),
    );
    await reloadApp(P);
    await waitView(P, 'home');
    await mockReset();

    await startGame(P, 0);
    await P.wait('__vis(document.querySelector("#btn-retry-turn"))', '401 后出现 #btn-retry-turn', 25000);
    assert(await P.visible('#btn-retry-turn'), '401 后重试按钮不可见');
    eq(await P.count('#choices-list .choice-btn'), 0, '401 后不应出现选项按钮');
    await P.wait(
      '(() => { const el = document.querySelector("#game-error"); return Boolean(el) && __vis(el) && __norm(el.textContent).length > 0; })()',
      '401 后 #game-error 显示错误文案',
      15000,
    );
    const errorText = await P.text('#game-error');
    truthy(errorText, '401 后 #game-error 文案为空');
    const authError = t('zh', 'game.errorAuth');
    if (authError) {
      includes(errorText, authError, '401 后错误文案应为鉴权错误提示（game.errorAuth）');
    } else {
      assert(/密钥|key|鉴权/i.test(errorText), `401 后错误文案不符合预期：${errorText}`);
    }

    const failedLog = await waitMockRequest((item) => item.path === '/error401openai/v1/chat/completions', {
      timeout: 10000,
      description: '401 请求应发往 /error401openai',
    });
    eq(failedLog.status, 401, 'mock 401 请求的 status 应记录为 401');

    await P.click('#btn-retry-turn');
    const retried = await waitMockRequests((item) => item.path === '/error401openai/v1/chat/completions', {
      count: 2,
      timeout: 20000,
      description: '点击重试后应再次请求（共 2 次）',
    });
    assert(retried.length >= 2, '重试按钮未触发新请求');

    const failedStore = await readStore(P);
    const hasAssistant = (failedStore?.sessions || []).some((session) =>
      (session.messages || []).some((message) => message.role === 'assistant' && String(message.content || '').length > 0),
    );
    assert(!hasAssistant, '401 失败回合不应把 assistant 消息写进 localStorage');

    // --- badopenai 兜底 ---
    await writeStore(
      P,
      makeStore({
        config: makeConfig({ baseUrl: `${MOCK_BASE}/badopenai/v1` }),
        settings: makeSettings(),
      }),
    );
    await reloadApp(P);
    await waitView(P, 'home');
    await mockReset();

    await startGame(P, 0);
    await P.wait('document.querySelectorAll("#choices-list .choice-btn").length === 3', 'badopenai 兜底 3 个选项', 25000);
    eq(await P.count('#choices-list .choice-btn'), 3, '兜底选项数量应为 3');
    const badStory = await P.text('#story-log');
    assert(/雨声乍歇|孤灯/.test(badStory), `badopenai 正文未按兜底全文展示：${badStory.slice(0, 200)}`);
    assert(await P.count('#story-log .story-turn strong') >= 1, 'badopenai 正文加粗未渲染');
    assert(await P.count('#story-log .story-turn code') >= 1, 'badopenai 正文行内代码未渲染');
    assert(await P.count('#story-log .story-turn blockquote') >= 1, 'badopenai 正文引用未渲染');
    assert(await P.count('#story-log .story-turn .katex') >= 2, 'badopenai 正文 LaTeX 未渲染');
    const fallbackChoices = await P.run(
      'return [...document.querySelectorAll("#choices-list .choice-btn")].map((el) => (el.textContent || "").trim());',
    );
    assert(fallbackChoices.every(Boolean), `兜底选项文案为空：${JSON.stringify(fallbackChoices)}`);
  });

  // =========================================================================
  // §8.11 设备布局 + §8.12 字体
  // =========================================================================
  await step('T11 §8.11 桌面 2:1 / iPhone 9:16 布局 + §8.12 Fusion Pixel 字体', async () => {
    // --- 桌面 ---
    await setDesktop(P);
    await writeStore(P, makeStore({ settings: makeSettings() }));
    await reloadApp(P);
    await waitView(P, 'home');

    const desktop = await P.run(`
      const root = document.documentElement;
      const el = document.querySelector('.app-frame') || document.querySelector('#app');
      const rect = el ? el.getBoundingClientRect() : null;
      return {
        device: root.dataset.device || null,
        layout: root.dataset.layout || null,
        ratio: rect && rect.height ? rect.width / rect.height : null,
        rect: rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null,
        element: el ? (el.id || el.className || el.tagName) : null,
      };
    `);
    eq(desktop.device, 'desktop', '桌面 1440×720 下 documentElement.dataset.device 应为 desktop');
    eq(desktop.layout, 'landscape', '桌面 1440×720 下 documentElement.dataset.layout 应为 landscape');
    truthy(desktop.ratio, '找不到舞台元素（.app-frame 或 #app）');
    assert(Math.abs(desktop.ratio - 2) <= 0.03, `桌面舞台宽高比应 ≈ 2:1 ±0.03，实际 ${desktop.ratio?.toFixed(4)}（rect=${JSON.stringify(desktop.rect)}）`);

    // 字体（需在游戏正文页检测）
    await startGame(P, 0);
    await waitChoices(P, 25000);
    const fontInfo = await P.run(`
      return (async () => {
        await document.fonts.ready;
        return {
          check: document.fonts.check('24px "Fusion Pixel"'),
          checkCjk: document.fonts.check('24px "Fusion Pixel"', '天地玄黄'),
          faces: [...document.fonts].map((f) => ({ family: f.family, status: f.status })).slice(0, 20),
          storyFont: (() => { const el = document.querySelector('.story-turn'); return el ? getComputedStyle(el).fontFamily : null; })(),
        };
      })();
    `);
    let fontOk = fontInfo.check;
    if (!fontOk) {
      await sleep(1000);
      fontOk = await P.run(`return document.fonts.check('24px "Fusion Pixel"');`).catch(() => false);
    }
    assert(
      fontOk === true,
      `document.fonts.check('24px "Fusion Pixel"') 应为 true；实际 ${JSON.stringify({ check: fontInfo.check, checkCjk: fontInfo.checkCjk, faces: fontInfo.faces })}`,
    );
    includes(String(fontInfo.storyFont || ''), 'Fusion Pixel', '.story-turn 的计算字体应包含 Fusion Pixel');

    // --- 竖屏（iPhone UA + 390×844） ---
    await setPortrait(P);
    await reloadApp(P);
    await waitView(P, 'home');
    const portrait = await P.run(`
      const root = document.documentElement;
      const el = document.querySelector('.app-frame') || document.querySelector('#app');
      const rect = el ? el.getBoundingClientRect() : null;
      return {
        device: root.dataset.device || null,
        layout: root.dataset.layout || null,
        ratio: rect && rect.height ? rect.width / rect.height : null,
        rect: rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null,
        ua: navigator.userAgent,
        element: el ? (el.id || el.className || el.tagName) : null,
      };
    `);
    eq(portrait.device, 'mobile', 'iPhone UA + 390×844 下 dataset.device 应为 mobile');
    eq(portrait.layout, 'portrait', 'iPhone UA + 390×844 下 dataset.layout 应为 portrait');
    truthy(portrait.ratio, '竖屏下找不到舞台元素（.app-frame 或 #app）');
    assert(
      Math.abs(portrait.ratio - 9 / 16) <= 0.03,
      `竖屏舞台宽高比应 ≈ 9:16(0.5625) ±0.03，实际 ${portrait.ratio?.toFixed(4)}（rect=${JSON.stringify(portrait.rect)}）`,
    );
    includes(portrait.ua, 'iPhone', 'UA 覆盖未生效（navigator.userAgent 不含 iPhone）');

    // 竖屏游戏截图（含 Markdown/LaTeX 与选项）
    await startGame(P, 0);
    await waitChoices(P, 25000);
    await P.wait('document.querySelectorAll("#story-log .story-turn .katex").length >= 1', '竖屏 LaTeX 渲染', 20000);
    await screenshot(P, 'game-portrait.png', { width: 390, height: 844 });
  });

  // =========================================================================
  // §8.13 会话管理 + 导出
  // =========================================================================
  await step('T12 §8.13 删除会话后 localStorage 与 UI 同步；导出触发 blob/下载', async () => {
    await setDesktop(P);
    const now = Date.now();
    const sessionA = makeSession({
      id: 's_qa_a',
      title: '测试会话甲',
      createdAt: now - 120_000,
      updatedAt: now - 1_000,
      turns: 1,
      messages: [
        { role: 'user', content: '开始吧。' },
        { role: 'assistant', content: '<story>甲的故事。</story><choices>1. 一\n2. 二\n3. 三</choices>' },
      ],
    });
    const sessionB = makeSession({
      id: 's_qa_b',
      title: '测试会话乙',
      createdAt: now - 200_000,
      updatedAt: now - 5_000,
      turns: 1,
      messages: [
        { role: 'user', content: '开始吧。' },
        { role: 'assistant', content: '<story>乙的故事。</story><choices>1. 一\n2. 二\n3. 三</choices>' },
      ],
    });
    await writeStore(P, makeStore({ settings: makeSettings(), sessions: [sessionA, sessionB], activeSessionId: 's_qa_a' }));
    await reloadApp(P);
    await waitView(P, 'home');

    await P.wait(
      `(() => { const root = document.querySelector('#recent-list'); if (!root) return false; return root.querySelectorAll('[data-session-id], li, .recent-item').length >= 2; })()`,
      '主页最近会话 2 条',
      15000,
    );
    const beforeDelete = await readStore(P);
    eq(beforeDelete.sessions.length, 2, '删除前 localStorage 应有 2 个会话');

    const deleted = await deleteSessionViaUI(P, { sessionId: 's_qa_b', title: '测试会话乙' });
    assert(deleted.ok, `删除会话失败：${JSON.stringify(deleted)}`);

    await P.wait(
      `(() => { try { const s = JSON.parse(localStorage.getItem(${q(STORE_KEY)}) || '{}'); return Array.isArray(s.sessions) && s.sessions.length === 1; } catch (_) { return false; } })()`,
      '删除后 localStorage.sessions 长度变为 1',
      10000,
    );
    const afterDelete = await readStore(P);
    eq(afterDelete.sessions.length, 1, '删除后 localStorage 应只剩 1 个会话');
    assert(!afterDelete.sessions.some((session) => session.id === 's_qa_b'), '被删除的会话仍存在于 localStorage');
    await P.wait(
      `(() => {
        const modal = document.querySelector('#modal-sessions');
        const home = document.querySelector('#recent-list');
        const text = (modal ? modal.textContent : '') + ' ' + (home ? home.textContent : '');
        return !text.includes('测试会话乙');
      })()`,
      'UI 不再显示被删除的会话',
      10000,
    );

    // --- 导出 ---
    // 先关掉档案室弹窗（删除后它仍然开着），避免遮挡设置弹窗
    await P.run(`
      const closeBtn = document.querySelector('#modal-sessions [data-close-modal="sessions"]');
      if (closeBtn) __click(closeBtn);
      return true;
    `);
    await P.wait('!__vis(document.querySelector("#modal-sessions"))', '档案室弹窗关闭', 8000).catch(() => {});

    await installDownloadProbe(P);
    const openedSettings = await P.click('#btn-settings');
    assert(openedSettings, '点击 #btn-settings 失败');
    await P.wait('!!document.querySelector("#modal-settings") && __vis(document.querySelector("#modal-settings"))', '设置弹窗可见', 10000);

    // 切到「数据」tab（index.html：<button data-settings-tab="data">）
    const dataTabSelector = '[data-settings-tab="data"]';
    let tab;
    if (await P.exists(dataTabSelector)) {
      tab = { ok: await P.click(dataTabSelector), via: dataTabSelector };
      await sleep(100);
    } else {
      tab = await clickTextIn(P, '#modal-settings', [t('zh', 'settings.tabData'), '数据', 'Data', '存档'], {
        excludePattern: 'delete|trash|remove|删除|移除|清空',
      });
    }
    assert(tab.ok, `设置弹窗里找不到数据 tab：${JSON.stringify(tab)}`);

    await P.wait('__vis(document.querySelector("#btn-export-data"))', '导出按钮 #btn-export-data 可见', 8000);
    const exportSelector = '#btn-export-data';
    const exportClicked = await P.click(exportSelector);
    assert(exportClicked, `点击导出按钮失败（${JSON.stringify(exportSelector)}）`);
    await sleep(800);
    const downloadProbe = await P.run('return window.__qaDownload || { blobUrls: 0, anchorClicks: 0 };');
    assert(
      (downloadProbe.blobUrls || 0) >= 1 || (downloadProbe.anchorClicks || 0) >= 1,
      `导出未生成 blob URL 或触发下载：${JSON.stringify(downloadProbe)}`,
    );
    console.log(`[qa] 导出探针：${JSON.stringify(downloadProbe)}`);
  });

  // =========================================================================
  // §8.14 无 console error
  // =========================================================================
  await step('T13 §8.14 无 console error（过滤 mock 故意错误请求导致的网络错误）', async () => {
    const filtered = consoleErrors.filter((entry) => !isIgnoredConsoleError(entry));
    const ignored = consoleErrors.length - filtered.length;
    console.log(`[qa] console error 记录 ${consoleErrors.length} 条（其中 ${ignored} 条为 mock 故意错误/网络错误，已过滤）`);
    if (filtered.length > 0) {
      throw new Error(
        `存在 ${filtered.length} 条未过滤的 console error：\n${filtered
          .slice(0, 10)
          .map((entry) => `- [${entry.source}] ${entry.text.slice(0, 300)}`)
          .join('\n')}`,
      );
    }
  });

  // =========================================================================
  // 截图产物完整性
  // =========================================================================
  await step('T14 截图产物完整性（§7 四个固定文件名）', async () => {
    const expected = [
      ['onboarding-landscape.png', 1440, 720],
      ['home-landscape.png', 1440, 720],
      ['game-landscape.png', 1440, 720],
      ['game-portrait.png', 390, 844],
    ];
    for (const [name, width, height] of expected) {
      const file = path.join(SCREENSHOTS_DIR, name);
      assert(fs.existsSync(file), `缺少截图 ${file}`);
      const buffer = await fsp.readFile(file);
      const size = readPngSize(buffer);
      truthy(size, `截图 ${name} 不是合法 PNG`);
      eq({ width: size.width, height: size.height }, { width, height }, `截图 ${name} 尺寸不符`);
      assert(buffer.length > 2000, `截图 ${name} 文件过小（${buffer.length}B）`);
      console.log(`[qa] ${name}: ${size.width}×${size.height}, ${buffer.length}B`);
    }
  });

  // =========================================================================
  // v1.1 §7 T-新4（入口二）+ T-新5：设置里的教程入口 + 关于版本 1.1.1
  // =========================================================================
  await step('T15 §7 教程弹窗（设置入口 #btn-open-guide-settings）+ 设置→关于显示 1.1.1', async () => {
    await setDesktop(P);
    await writeStore(P, makeStore({ settings: makeSettings() }));
    await reloadApp(P);
    await waitView(P, 'home');

    const opened = await P.click('#btn-settings');
    assert(opened, '点击 #btn-settings 失败');
    await P.wait('!!document.querySelector("#modal-settings") && __vis(document.querySelector("#modal-settings"))', '设置弹窗可见', 10000);

    // 设置 → 接口 tab 的教程入口 #btn-open-guide-settings
    await P.click('[data-settings-tab="api"]').catch(() => false);
    await sleep(100);
    await assertGuideModalOpens(P, '#btn-open-guide-settings');

    // 教程弹窗关闭后设置弹窗应仍在；若被一并关闭则重新打开
    if (!(await P.visible('#modal-settings'))) {
      await P.click('#btn-settings');
      await P.wait('!!document.querySelector("#modal-settings") && __vis(document.querySelector("#modal-settings"))', '设置弹窗重新可见', 10000);
    }

    // 设置 → 关于：版本 1.1.1
    const aboutClicked = await P.click('[data-settings-tab="about"]');
    assert(aboutClicked, '点击设置「关于」tab 失败');
    await sleep(150);
    const aboutInfo = await P.run(`
      const modal = document.querySelector('#modal-settings');
      const panel = document.querySelector('[data-settings-panel="about"]');
      const versionEl = document.querySelector('#about-version');
      return {
        modalText: __norm(modal ? modal.innerText || modal.textContent : ''),
        panelText: __norm(panel ? (panel.innerText || panel.textContent) : ''),
        versionText: __norm(versionEl ? versionEl.innerText || versionEl.textContent : ''),
      };
    `);
    assert(
      /1\.1\.1/.test(aboutInfo.modalText) || /1\.1\.1/.test(aboutInfo.panelText),
      `设置→关于未显示版本 1.1.1（panelText=${JSON.stringify(aboutInfo.panelText.slice(0, 300))}）`,
    );
    if (aboutInfo.versionText) {
      includes(aboutInfo.versionText, '1.1.1', '#about-version 未显示 1.1.1');
    }
    console.log(`[qa] 设置→关于版本文案：${JSON.stringify(aboutInfo.versionText || aboutInfo.panelText.slice(0, 120))}`);
  });

  // =========================================================================
  // v1.1.1 T16 移动端布局识别回归（桌面 UA+触屏 / 手机横握 / 正常桌面）
  // =========================================================================
  await step(
    'T16 v1.1.1 移动端布局识别回归：桌面UA+触屏+390×844→portrait/0.563；手机UA+844×390→landscape/2；桌面1440×720→landscape/2',
    async () => {
      await writeStore(P, makeStore({ settings: makeSettings({ layout: 'auto' }) }));

      // c. 正常桌面 1440×720
      const desktopState = await assertLayoutCase(P, {
        name: '正常桌面 1440×720',
        width: 1440,
        height: 720,
        userAgent: DESKTOP_UA,
        platform: 'Win32',
        touch: false,
        mobile: false,
        expect: { device: 'desktop', layout: 'landscape', ratio: 2 },
      });

      // a. 桌面 UA + 触屏 + 390×844（应用内浏览器 / 手机浏览器「桌面模式」误报桌面 UA 的场景）
      const phoneDesktopUa = await assertLayoutCase(P, {
        name: '桌面UA+触屏+390×844',
        width: 390,
        height: 844,
        userAgent: DESKTOP_UA,
        platform: 'Win32',
        touch: true,
        mobile: true,
        expect: {
          device: 'mobile',
          layout: 'portrait',
          ratio: 9 / 16,
          check: (state) => {
            assert(!/iPhone|Android|Mobile/i.test(state.ua), `该场景 UA 不应是移动 UA：${state.ua.slice(0, 90)}`);
            assert(state.touchPoints > 0 || state.coarse, `触屏模拟未生效（touchPoints=${state.touchPoints}, coarse=${state.coarse}）`);
            assert(state.env && state.env.boot === true, 'layout-boot.js 未在文档加载时执行（window.__APPEALING_ENV__ 缺失）');
          },
        },
      });

      // b. 手机 UA + 844×390（手机横握 → 自动 2:1）
      const phoneLandscape = await assertLayoutCase(P, {
        name: '手机UA+844×390横握',
        width: 844,
        height: 390,
        userAgent: IPHONE_UA,
        platform: 'iPhone',
        touch: true,
        mobile: true,
        expect: {
          device: 'mobile',
          layout: 'landscape',
          ratio: 2,
          check: (state) => assert(/iPhone/i.test(state.ua), `手机 UA 未生效：${state.ua.slice(0, 90)}`),
        },
      });

      // 恢复桌面尺寸/UA，保持环境干净
      await setDesktop(P);
      await reloadApp(P);

      // T15/T16 期间的 console error 也纳入 §8.14 口径（T13 已在前面检查到 T12）
      const filteredErrors = consoleErrors.filter((entry) => !isIgnoredConsoleError(entry));
      if (filteredErrors.length > 0) {
        throw new Error(
          `T16 后存在 ${filteredErrors.length} 条未过滤 console error：\n${filteredErrors
            .slice(0, 8)
            .map((entry) => `- [${entry.source}] ${entry.text.slice(0, 240)}`)
            .join('\n')}`,
        );
      }

      console.log(
        `[qa] 布局回归比例：桌面 ${desktopState.ratio.toFixed(4)}；桌面UA触屏手机 ${phoneDesktopUa.ratio.toFixed(4)}；手机横握 ${phoneLandscape.ratio.toFixed(4)}`,
      );
    },
  );
}

let exitCode = 0;

try {
  await main();
  console.log(STATIC_ONLY ? '\nSTATIC CHECKS PASSED' : '\nALL TESTS PASSED');
  console.log(
    STATIC_ONLY
      ? `[qa] ${passedSteps} 个静态步骤通过（--static-only）`
      : `[qa] ${passedSteps} 个步骤全部通过，截图目录：${path.relative(REPO_ROOT, SCREENSHOTS_DIR)}`,
  );
} catch (err) {
  exitCode = 1;
  console.log(`\nFAIL ${currentStep} ${err?.message || err}`);
  if (err?.stack && process.env.QA_DEBUG) console.log(err.stack);
} finally {
  await cleanup();
  await sleep(50);
}

process.exit(exitCode);
