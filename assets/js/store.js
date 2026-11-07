/* ============================================================
 * 无尽文游 / Appealing Words — store.js
 * 纯前端本地存储：接口配置、设置、多会话存档。
 * 所有数据只存在浏览器 localStorage，不经过任何服务器。
 * ============================================================ */

const STORAGE_KEY = 'appealingwords.v1';
const APP_VERSION = '1.1.0';
const SCHEMA_VERSION = 1;
const MAX_SESSIONS = 40;
const MAX_MESSAGES = 200;
const CONTEXT_MAX_MESSAGES = 26;
const CONTEXT_MAX_CHARS = 42000;

export const DEFAULT_CONFIG = {
  protocol: 'openai',
  baseUrl: '',
  apiKey: '',
  model: '',
  temperature: 0.85,
  maxTokens: 2048,
  extraHeaders: '',
};

export function guessLang() {
  try {
    const list = navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || 'zh'];
    return String(list[0] || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch (err) {
    return 'zh';
  }
}

export function defaultSettings() {
  return { lang: guessLang(), layout: 'auto', speed: 'normal', sound: false };
}

function freshState() {
  return {
    version: SCHEMA_VERSION,
    config: { ...DEFAULT_CONFIG },
    settings: defaultSettings(),
    activeSessionId: null,
    sessions: [],
  };
}

/* ---------- 归一化 / 校验 ---------- */

function str(value, fallback = '') {
  return typeof value === 'string' ? value.slice(0, 20000) : fallback;
}

function num(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeConfig(input) {
  const cfg = { ...DEFAULT_CONFIG };
  if (!input || typeof input !== 'object') return cfg;
  cfg.protocol = input.protocol === 'anthropic' ? 'anthropic' : 'openai';
  cfg.baseUrl = str(input.baseUrl).trim();
  cfg.apiKey = str(input.apiKey).trim();
  cfg.model = str(input.model).trim();
  cfg.temperature = num(input.temperature, DEFAULT_CONFIG.temperature, 0, 2);
  cfg.maxTokens = Math.round(num(input.maxTokens, DEFAULT_CONFIG.maxTokens, 64, 65536));
  cfg.extraHeaders = str(input.extraHeaders).trim();
  return cfg;
}

function sanitizeSettings(input) {
  const settings = defaultSettings();
  if (!input || typeof input !== 'object') return settings;
  if (input.lang === 'zh' || input.lang === 'en') settings.lang = input.lang;
  if (input.layout === 'auto' || input.layout === 'landscape' || input.layout === 'portrait') {
    settings.layout = input.layout;
  }
  if (['slow', 'normal', 'fast', 'instant'].includes(input.speed)) settings.speed = input.speed;
  settings.sound = input.sound === true;
  return settings;
}

function sanitizeMessage(input) {
  if (!input || typeof input !== 'object') return null;
  const role = input.role === 'assistant' ? 'assistant' : input.role === 'user' ? 'user' : null;
  if (!role) return null;
  const content = typeof input.content === 'string' ? input.content : '';
  if (!content) return null;
  return { role, content: content.slice(0, 60000) };
}

function sanitizeSession(input) {
  if (!input || typeof input !== 'object') return null;
  const id = str(input.id).trim();
  if (!id) return null;
  const messages = Array.isArray(input.messages)
    ? input.messages.map(sanitizeMessage).filter(Boolean).slice(-MAX_MESSAGES)
    : [];
  const now = Date.now();
  const createdAt = Number.isFinite(input.createdAt) ? input.createdAt : now;
  const updatedAt = Number.isFinite(input.updatedAt) ? input.updatedAt : createdAt;
  return {
    id,
    modeId: str(input.modeId, 'rules') || 'rules',
    lang: input.lang === 'en' ? 'en' : 'zh',
    title: str(input.title),
    createdAt,
    updatedAt,
    turns: Number.isFinite(input.turns) ? Math.max(0, Math.floor(input.turns)) : 0,
    messages,
  };
}

function normalizeState(input, base) {
  const state = { ...base };
  if (!input || typeof input !== 'object') return state;
  state.config = sanitizeConfig(input.config);
  state.settings = sanitizeSettings(input.settings);
  state.activeSessionId = typeof input.activeSessionId === 'string' ? input.activeSessionId : null;
  state.sessions = Array.isArray(input.sessions)
    ? input.sessions.map(sanitizeSession).filter(Boolean)
    : [];
  state.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  if (state.sessions.length > MAX_SESSIONS) state.sessions.length = MAX_SESSIONS;
  if (state.activeSessionId && !state.sessions.some((s) => s.id === state.activeSessionId)) {
    state.activeSessionId = state.sessions.length ? state.sessions[0].id : null;
  }
  return state;
}

function load() {
  const base = freshState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    return normalizeState(JSON.parse(raw), base);
  } catch (err) {
    console.warn('[store] 读取本地存档失败', err);
    return base;
  }
}

let state = load();

/* ---------- 保存 ---------- */

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    // 配额不足：裁剪最旧存档与过长消息后重试一次
    console.warn('[store] 写入失败，尝试裁剪后重试', err);
    try {
      state.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      while (state.sessions.length > 10) state.sessions.pop();
      for (const session of state.sessions) {
        if (session.messages.length > 80) session.messages = session.messages.slice(-80);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err2) {
      console.warn('[store] 写入仍然失败', err2);
      return false;
    }
  }
}

/* ---------- 配置 / 设置 ---------- */

export function getConfig() {
  return { ...state.config };
}

export function updateConfig(patch) {
  state.config = sanitizeConfig({ ...state.config, ...(patch || {}) });
  persist();
  return getConfig();
}

export function isConfigured() {
  return Boolean(state.config.baseUrl && state.config.model);
}

export function getSettings() {
  return { ...state.settings };
}

export function updateSettings(patch) {
  state.settings = sanitizeSettings({ ...state.settings, ...(patch || {}) });
  persist();
  return getSettings();
}

/* ---------- 会话 ---------- */

export function getSessions() {
  return state.sessions
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((s) => ({ ...s, messages: s.messages.slice() }));
}

export function getSession(id) {
  const session = state.sessions.find((s) => s.id === id);
  if (!session) return null;
  return { ...session, messages: session.messages.slice() };
}

export function getActiveSessionId() {
  return state.activeSessionId;
}

export function setActiveSession(id) {
  if (id && !state.sessions.some((s) => s.id === id)) return null;
  state.activeSessionId = id || null;
  persist();
  return state.activeSessionId;
}

export function createSession({ modeId, lang }) {
  const id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();
  const session = {
    id,
    modeId: modeId || 'rules',
    lang: lang === 'en' ? 'en' : 'zh',
    title: '',
    createdAt: now,
    updatedAt: now,
    turns: 0,
    messages: [],
  };
  state.sessions.unshift(session);
  if (state.sessions.length > MAX_SESSIONS) state.sessions.length = MAX_SESSIONS;
  state.activeSessionId = id;
  persist();
  return getSession(id);
}

export function updateSession(id, patch) {
  const session = state.sessions.find((s) => s.id === id);
  if (!session) return null;
  const merged = { ...session, ...(patch || {}) };
  session.modeId = merged.modeId;
  session.lang = merged.lang === 'en' ? 'en' : 'zh';
  session.title = typeof merged.title === 'string' ? merged.title : session.title;
  session.turns = Number.isFinite(merged.turns) ? Math.max(0, Math.floor(merged.turns)) : session.turns;
  session.messages = Array.isArray(merged.messages)
    ? merged.messages.map(sanitizeMessage).filter(Boolean).slice(-MAX_MESSAGES)
    : session.messages;
  session.updatedAt = Date.now();
  persist();
  return getSession(id);
}

export function touchSession(id) {
  const session = state.sessions.find((s) => s.id === id);
  if (!session) return null;
  session.updatedAt = Date.now();
  persist();
  return getSession(id);
}

export function appendMessage(id, message) {
  const session = state.sessions.find((s) => s.id === id);
  if (!session) return null;
  const clean = sanitizeMessage(message);
  if (!clean) return getSession(id);
  session.messages.push(clean);
  if (session.messages.length > MAX_MESSAGES) session.messages = session.messages.slice(-MAX_MESSAGES);
  session.updatedAt = Date.now();
  persist();
  return getSession(id);
}

export function deleteSession(id) {
  const before = state.sessions.length;
  state.sessions = state.sessions.filter((s) => s.id !== id);
  if (state.activeSessionId === id) {
    state.activeSessionId = state.sessions.length ? state.sessions[0].id : null;
  }
  persist();
  return state.sessions.length !== before;
}

export function clearAll() {
  state = freshState();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    /* ignore */
  }
  return state;
}

/* ---------- 上下文窗口 ---------- */

export function buildContextMessages(id) {
  const session = state.sessions.find((s) => s.id === id);
  if (!session) return [];
  let messages = session.messages.map((m) => ({ role: m.role, content: m.content }));

  if (messages.length > CONTEXT_MAX_MESSAGES) {
    messages = messages.slice(-CONTEXT_MAX_MESSAGES);
  }
  let total = messages.reduce((sum, m) => sum + m.content.length, 0);
  while (total > CONTEXT_MAX_CHARS && messages.length > 6) {
    const removed = messages.shift();
    total -= removed.content.length;
  }
  while (messages.length && messages[0].role !== 'user') messages.shift();
  return messages;
}

/* ---------- 导出 / 导入 ---------- */

export function exportJSON() {
  return JSON.stringify(
    {
      app: 'AppealingWords',
      schema: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      config: state.config,
      settings: state.settings,
      activeSessionId: state.activeSessionId,
      sessions: state.sessions,
    },
    null,
    2
  );
}

export function importJSON(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: 'invalid-json' };
  }
  const data = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
  if (!data || typeof data !== 'object' || !Array.isArray(data.sessions)) {
    return { ok: false, error: 'invalid-shape' };
  }
  const normalized = normalizeState(data, freshState());
  if (!normalized.sessions.length && !normalized.config.baseUrl) {
    return { ok: false, error: 'empty' };
  }
  state = normalized;
  if (!persist()) return { ok: false, error: 'storage-full' };
  return { ok: true, state };
}

export function getRawState() {
  return JSON.parse(JSON.stringify(state));
}

export { STORAGE_KEY, APP_VERSION, MAX_SESSIONS, MAX_MESSAGES };
