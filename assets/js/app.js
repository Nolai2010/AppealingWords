/* ============================================================
 * 无尽文游 / Appealing Words — app.js
 * 纯前端文字游戏主控制器：
 *   引导配置 → 选择模式 → 流式推演 → 选项/自由行动 → 本地存档
 * ============================================================ */

import {
  STRINGS,
  LANGS,
  LANG_LABELS,
  NUMERALS,
  PROVIDER_PRESETS,
} from './i18n.js';
import { MODES, buildSystemPrompt, OPENING_MESSAGE, FALLBACK_CHOICES } from './prompt.js';
import { GUIDE_STEPS, GUIDE_CONCEPTS, GUIDE_PROVIDERS, GUIDE_FAQ } from './guide.js';
import * as store from './store.js';
import { streamChat, testConnection, parseExtraHeaders, isAbortError } from './api.js';
import {
  parseResponse,
  extractStreamStory,
  plainifyForTyping,
  renderRich,
  titleFromStory,
  escapeHtml,
} from './render.js';
import { Typewriter } from './typewriter.js';

const APP_VERSION = store.APP_VERSION;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const ui = {
  lang: 'zh',
  view: 'onboarding',
  device: 'desktop',
  session: null,
  streaming: false,
  abort: null,
  typewriter: null,
  streamArticle: null,
  streamBody: null,
  streamRaw: '',
  pendingFinalize: null,
  lastScene: null,
  confirmResolve: null,
  audioCtx: null,
  presetId: null,
  lastFocus: null,
  statusKind: 'ready',
  guideTarget: 'onboarding',
  booted: false,
};

/* ============================================================
 * i18n
 * ============================================================ */

function interpolate(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => {
    if (vars && Object.prototype.hasOwnProperty.call(vars, key)) return String(vars[key]);
    return match;
  });
}

function t(key, vars) {
  const table = STRINGS[ui.lang] || STRINGS.zh || {};
  const fallback = STRINGS.zh || {};
  const value = table[key] != null ? table[key] : fallback[key];
  if (value == null) return key;
  return interpolate(value, vars);
}

function langLabel(lang) {
  return LANG_LABELS[lang] || lang;
}

function applyI18n() {
  $$('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  $$('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  $$('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  });

  document.documentElement.lang = ui.lang === 'zh' ? 'zh-CN' : 'en';
  document.documentElement.dataset.lang = ui.lang;
  document.title = t('meta.title');
  const desc = $('meta[name="description"]');
  if (desc) desc.setAttribute('content', t('meta.description'));
  const ogTitle = $('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', t('meta.title'));
  const ogDesc = $('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', t('meta.description'));

  refreshLangSwitch();
  updateToggleKeyLabels();
  refreshDynamicTexts();
}

function refreshLangSwitch() {
  $$('#lang-switch [data-lang]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.lang === ui.lang);
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === ui.lang));
  });
}

function refreshDynamicTexts() {
  updateStatusbar();
  updateHomeApiStatus();
  updateSoundState();
  updateAboutTexts();
  updateProtocolPlaceholders();
  renderGuide();
  setStatus(ui.statusKind || 'ready');
  if (ui.view === 'home') renderHome();
  if (ui.view === 'game') {
    updateGameHeader();
    rerenderChoices();
  }
  const sessionsModal = document.getElementById('modal-sessions');
  if (sessionsModal && !sessionsModal.hidden) renderSessions();
}

/* ============================================================
 * 布局 / 设备识别（User-Agent）
 * ============================================================ */

function isCoarsePointer() {
  try {
    return Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  } catch (err) {
    return false;
  }
}

function detectDevice() {
  const ua = navigator.userAgent || '';
  const isMobileUa =
    /Android|iPhone|iPod|iPad|Windows Phone|Mobile|HarmonyOS|OpenHarmony|MicroMessenger|MiuiBrowser|HuaweiBrowser|ArkWeb|Silk|Kindle|BlackBerry|Opera Mini|IEMobile/i.test(
      ua
    );
  const isIpadOs = /Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1;
  const hasTouch = (navigator.maxTouchPoints || 0) > 0;
  const viewportWidth = window.innerWidth || 0;
  const screenWidth = (window.screen && window.screen.width) || 0;
  const narrowViewport =
    (viewportWidth > 0 && viewportWidth <= 820) || (screenWidth > 0 && screenWidth <= 820);
  // 应用内浏览器 / 手机浏览器「桌面模式」可能上报桌面 UA，但仍有触屏且视口窄：
  // 这类情况也按移动端处理，避免 2:1 舞台在手机上被挤成一条。
  ui.device =
    isMobileUa || isIpadOs || ((hasTouch || isCoarsePointer()) && narrowViewport)
      ? 'mobile'
      : 'desktop';
}

function currentLayout() {
  const settings = store.getSettings();
  if (settings.layout === 'landscape' || settings.layout === 'portrait') return settings.layout;
  if (ui.device === 'mobile') {
    // 竖握手机 → 9:16；横握手机 → 2:1，避免竖屏舞台在横屏里缩放得很小
    return window.innerHeight >= window.innerWidth ? 'portrait' : 'landscape';
  }
  // 桌面端：窗口很窄且竖长时也照顾可读性
  if (window.innerWidth < 520 && window.innerHeight > window.innerWidth) return 'portrait';
  return 'landscape';
}

function applyLayout() {
  document.documentElement.dataset.device = ui.device;
  document.documentElement.dataset.layout = currentLayout();
  const deviceEl = $('#status-device');
  if (deviceEl) deviceEl.textContent = currentLayout() === 'portrait' ? '9:16' : '2:1';
  updateAboutTexts();
  if (typeof applyGuideFolding === 'function') applyGuideFolding();
}

function handleViewportChange() {
  detectDevice();
  applyLayout();
}

/* ============================================================
 * 视图切换
 * ============================================================ */

function showView(name) {
  const map = { onboarding: 'view-onboarding', home: 'view-home', game: 'view-game' };
  Object.entries(map).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.hidden = key !== name;
  });
  ui.view = name;
  document.documentElement.dataset.view = name;
  const main = $('#main');
  if (main) {
    main.scrollTop = 0;
    try {
      main.focus({ preventScroll: true });
    } catch (err) {
      /* ignore */
    }
  }
}

function goHome() {
  if (ui.view === 'game') {
    if (ui.streaming) {
      confirmDialog(t('game.quitConfirm')).then((ok) => {
        if (!ok) return;
        abortStream();
        showView('home');
        renderHome();
      });
      return;
    }
    showView('home');
    renderHome();
    return;
  }
  showView('home');
  renderHome();
}

/* ============================================================
 * Toast / 状态栏 / aria-live
 * ============================================================ */

function toast(message, type = 'ok', duration = 2800) {
  const root = $('#toast-root');
  if (!root || !message) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  root.appendChild(el);
  window.setTimeout(() => {
    el.classList.add('is-leaving');
    window.setTimeout(() => el.remove(), 320);
  }, duration);
}

function announce(message) {
  const el = $('#live-region');
  if (el) el.textContent = message;
}

function setStatus(kind) {
  ui.statusKind = kind;
  const el = $('#status-text');
  if (el) el.textContent = t(`status.${kind}`);
}

function updateStatusbar() {
  const cfg = store.getConfig();
  const modelEl = $('#status-model');
  if (modelEl) modelEl.textContent = store.isConfigured() ? t('status.provider', { model: cfg.model }) : '';
  const deviceEl = $('#status-device');
  if (deviceEl) deviceEl.textContent = currentLayout() === 'portrait' ? '9:16' : '2:1';
}

/* ============================================================
 * 模态框 / 确认框
 * ============================================================ */

function openModal(id, focusEl) {
  const modal = document.getElementById(id);
  if (!modal) return;
  ui.lastFocus = document.activeElement;
  modal.hidden = false;
  document.body.classList.add('is-modal-open');
  const target =
    focusEl ||
    modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  window.setTimeout(() => {
    try {
      if (target) target.focus({ preventScroll: true });
    } catch (err) {
      /* ignore */
    }
  }, 30);
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.hidden = true;
  if (!document.querySelector('.modal:not([hidden])')) {
    document.body.classList.remove('is-modal-open');
  }
}

function closeTopModal() {
  const open = $$('.modal:not([hidden])');
  if (!open.length) return;
  const top = open[open.length - 1];
  if (top.id === 'modal-confirm') {
    resolveConfirm(false);
    return;
  }
  closeModal(top.id);
}

function confirmDialog(message, options = {}) {
  return new Promise((resolve) => {
    const modal = $('#modal-confirm');
    if (!modal) {
      resolve(window.confirm(message));
      return;
    }
    const messageEl = $('#confirm-message');
    const titleEl = $('#confirm-title');
    const okBtn = $('#btn-confirm-ok');
    if (messageEl) messageEl.textContent = message;
    if (titleEl) titleEl.textContent = options.title || t('confirm.title');
    if (okBtn) okBtn.textContent = options.okText || t('confirm.ok');
    ui.confirmResolve = resolve;
    openModal('modal-confirm', okBtn);
  });
}

function resolveConfirm(value) {
  const resolve = ui.confirmResolve;
  ui.confirmResolve = null;
  closeModal('modal-confirm');
  if (resolve) resolve(Boolean(value));
}

/* ============================================================
 * 配置表单
 * ============================================================ */

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (document.activeElement === el) return;
  el.value = value == null ? '' : String(value);
}

function setProtocolSwitch(selector, protocol) {
  $$(`${selector} [data-protocol]`).forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.protocol === protocol);
  });
}

function getProtocolSwitch(selector) {
  const active = $(`${selector} [data-protocol].is-active`);
  return active ? active.dataset.protocol : 'openai';
}

function updateProtocolPlaceholders() {
  const onboardingProtocol = getProtocolSwitch('#protocol-switch');
  const settingsProtocol = getProtocolSwitch('#settings-protocol-switch');
  const placeholderFor = (protocol) =>
    t(protocol === 'anthropic' ? 'onboarding.baseUrlPlaceholderAnthropic' : 'onboarding.baseUrlPlaceholderOpenai');
  const onboardingInput = $('#input-base-url');
  if (onboardingInput) onboardingInput.setAttribute('placeholder', placeholderFor(onboardingProtocol));
  const settingsInput = $('#set-base-url');
  if (settingsInput) settingsInput.setAttribute('placeholder', placeholderFor(settingsProtocol));
}

function fillConfigFields(prefix, cfg) {
  setInputValue(`${prefix}base-url`, cfg.baseUrl);
  setInputValue(`${prefix}api-key`, cfg.apiKey);
  setInputValue(`${prefix}model`, cfg.model);
  setInputValue(`${prefix}temperature`, cfg.temperature);
  setInputValue(`${prefix}max-tokens`, cfg.maxTokens);
  setInputValue(`${prefix}extra-headers`, cfg.extraHeaders);
  const switchSelector = prefix === 'input-' ? '#protocol-switch' : '#settings-protocol-switch';
  setProtocolSwitch(switchSelector, cfg.protocol);
  updateProtocolPlaceholders();
}

function readConfigFields(prefix) {
  const value = (suffix) => {
    const el = document.getElementById(`${prefix}${suffix}`);
    return el ? el.value : '';
  };
  const switchSelector = prefix === 'input-' ? '#protocol-switch' : '#settings-protocol-switch';
  const temperature = Number.parseFloat(value('temperature'));
  const maxTokens = Number.parseInt(value('max-tokens'), 10);
  return {
    protocol: getProtocolSwitch(switchSelector),
    baseUrl: value('base-url').trim(),
    apiKey: value('api-key').trim(),
    model: value('model').trim(),
    temperature: Number.isFinite(temperature) ? temperature : 0.85,
    maxTokens: Number.isFinite(maxTokens) ? maxTokens : 2048,
    extraHeaders: value('extra-headers').trim(),
  };
}

function validateConfig(config) {
  if (!config.baseUrl) return t('onboarding.needBaseUrl');
  if (!config.model) return t('onboarding.needModel');
  let url = config.baseUrl;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) throw new Error('bad host');
  } catch (err) {
    return t('onboarding.invalidUrl');
  }
  try {
    parseExtraHeaders(config.extraHeaders);
  } catch (err) {
    return t('onboarding.invalidHeaders');
  }
  return '';
}

function setFormStatus(selector, type, message) {
  const el = $(selector);
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('is-ok', type === 'ok');
  el.classList.toggle('is-error', type === 'error');
}

function formatApiError(err, options = {}) {
  const detail = (err && err.message ? String(err.message) : '').trim();
  const code = err && err.code;
  let message;
  switch (code) {
    case 'auth':
      message = t('game.errorAuth');
      break;
    case 'rate':
    case 'quota':
      message = t('game.errorRate');
      break;
    case 'network':
      message = t('game.errorCors');
      break;
    case 'timeout':
      message = t('game.errorTimeout');
      break;
    case 'empty':
      message = t('game.errorEmpty');
      break;
    case 'config':
      message = options.validationPrefix ? options.validationPrefix : t('game.errorCors');
      break;
    default:
      message = t('game.errorGeneric', { message: detail || 'HTTP Error' });
  }
  if (options.testPrefix) return t('onboarding.testFailed');
  return message;
}

function updateToggleKeyLabels() {
  const map = [
    ['#btn-toggle-key', '#input-api-key'],
    ['#btn-toggle-set-key', '#set-api-key'],
  ];
  map.forEach(([btnSelector, inputSelector]) => {
    const btn = $(btnSelector);
    const input = $(inputSelector);
    if (!btn || !input) return;
    btn.textContent = t(input.type === 'password' ? 'onboarding.showKey' : 'onboarding.hideKey');
    btn.setAttribute('aria-pressed', String(input.type !== 'password'));
  });
}

function toggleKeyVisibility(inputSelector) {
  const input = $(inputSelector);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  updateToggleKeyLabels();
}

/* ============================================================
 * 引导页
 * ============================================================ */

function buildPresetChips() {
  const box = $('#preset-chips');
  if (!box) return;
  box.innerHTML = '';
  PROVIDER_PRESETS.forEach((preset) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.preset = preset.id;
    btn.textContent = preset.label;
    box.appendChild(btn);
  });
  updatePresetActive();
}

function updatePresetActive() {
  $$('#preset-chips .chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.preset === ui.presetId);
  });
}

function applyPreset(id) {
  const preset = PROVIDER_PRESETS.find((item) => item.id === id);
  if (!preset) return;
  ui.presetId = id;
  setProtocolSwitch('#protocol-switch', preset.protocol);
  if (id === 'custom') {
    setInputValue('input-base-url', '');
    setInputValue('input-model', '');
    const base = $('#input-base-url');
    if (base) base.focus();
  } else {
    setInputValue('input-base-url', preset.baseUrl || '');
    setInputValue('input-model', preset.model || '');
    const modelInput = $('#input-model');
    if (modelInput) modelInput.focus();
  }
  updatePresetActive();
  updateProtocolPlaceholders();
}

function buildModelDatalist() {
  const list = $('#model-suggestions');
  if (!list) return;
  list.innerHTML = '';
  PROVIDER_PRESETS.forEach((preset) => {
    if (!preset.model) return;
    const option = document.createElement('option');
    option.value = preset.model;
    option.label = preset.label;
    list.appendChild(option);
  });
}

function initOnboarding() {
  buildPresetChips();
  buildModelDatalist();
  fillConfigFields('input-', store.getConfig());
  updatePresetActive();
}

/* ============================================================
 * 新手教程（guide.js 渲染）
 * ============================================================ */

function guideText(value, fallbackLang) {
  if (!value) return '';
  return value[ui.lang] || value.zh || value.en || '';
}

function guideCorsTag(cors) {
  if (cors === 'ok') return t('guide.corsOkTag');
  if (cors === 'relay') return t('guide.corsRelayTag');
  return t('guide.corsUnknownTag');
}

function guideCurrencyTag(currency) {
  if (currency === 'cny') return t('guide.currencyCny');
  if (currency === 'usd') return t('guide.currencyUsd');
  return t('guide.currencyBoth');
}

function createGuideSteps() {
  const wrap = document.createElement('div');
  wrap.className = 'guide-steps';
  GUIDE_STEPS.forEach((step, index) => {
    const el = document.createElement('article');
    el.className = 'guide-step';
    const num = document.createElement('span');
    num.className = 'guide-step__num';
    num.textContent = String(index + 1).padStart(2, '0');
    const title = document.createElement('h3');
    title.className = 'guide-step__title';
    title.textContent = guideText(step.title);
    const body = document.createElement('p');
    body.className = 'guide-step__body';
    body.textContent = guideText(step.body);
    el.append(num, title, body);
    const tipText = guideText(step.tip);
    if (tipText) {
      const tip = document.createElement('p');
      tip.className = 'guide-step__tip';
      tip.textContent = tipText;
      el.appendChild(tip);
    }
    wrap.appendChild(el);
  });
  return wrap;
}

function createGuideConcepts() {
  const wrap = document.createElement('div');
  wrap.className = 'guide-concepts';
  GUIDE_CONCEPTS.forEach((concept) => {
    const el = document.createElement('article');
    el.className = 'guide-concept';
    const term = document.createElement('h3');
    term.className = 'guide-concept__term';
    term.textContent = guideText(concept.term);
    const desc = document.createElement('p');
    desc.className = 'guide-concept__desc';
    desc.textContent = guideText(concept.desc);
    el.append(term, desc);
    if (concept.example) {
      const example = document.createElement('code');
      example.className = 'guide-concept__example';
      example.textContent = concept.example;
      el.appendChild(example);
    }
    wrap.appendChild(el);
  });
  return wrap;
}

function createGuideProviderCard(provider) {
  const card = document.createElement('article');
  card.className = 'provider-card';
  card.dataset.provider = provider.id;

  const head = document.createElement('div');
  head.className = 'provider-card__head';
  const name = document.createElement('h3');
  name.className = 'provider-card__name';
  name.textContent = provider.name;
  const tags = document.createElement('div');
  tags.className = 'provider-card__tags';
  if (provider.recommended) {
    const tag = document.createElement('span');
    tag.className = 'provider-card__tag is-recommended';
    tag.textContent = t('guide.recommendedTag');
    tags.appendChild(tag);
  }
  const corsTag = document.createElement('span');
  corsTag.className = `provider-card__tag is-cors-${provider.cors || 'unknown'}`;
  corsTag.textContent = guideCorsTag(provider.cors);
  tags.appendChild(corsTag);
  const currencyTag = document.createElement('span');
  currencyTag.className = 'provider-card__tag is-currency';
  currencyTag.textContent = guideCurrencyTag(provider.currency);
  tags.appendChild(currencyTag);
  head.append(name, tags);

  const highlight = document.createElement('p');
  highlight.className = 'provider-card__highlight';
  highlight.textContent = guideText(provider.highlights);

  const url = document.createElement('code');
  url.className = 'provider-card__url';
  url.textContent = provider.baseUrl;

  const actions = document.createElement('div');
  actions.className = 'provider-card__actions';
  const keyLink = document.createElement('a');
  keyLink.className = 'btn btn--ghost provider-card__key';
  keyLink.href = provider.keyUrl;
  keyLink.target = '_blank';
  keyLink.rel = 'noopener noreferrer';
  keyLink.textContent = t('guide.getKeyAction');
  const docsLink = document.createElement('a');
  docsLink.className = 'provider-card__docs';
  docsLink.href = provider.docsUrl;
  docsLink.target = '_blank';
  docsLink.rel = 'noopener noreferrer';
  docsLink.textContent = t('guide.docsAction');
  const fillBtn = document.createElement('button');
  fillBtn.type = 'button';
  fillBtn.className = 'btn btn--primary provider-card__fill';
  fillBtn.dataset.guideFill = provider.id;
  fillBtn.textContent = t('guide.useConfigAction');
  actions.append(keyLink, docsLink, fillBtn);

  card.append(head, highlight, url);
  const noteText = guideText(provider.note);
  if (noteText) {
    const note = document.createElement('p');
    note.className = 'provider-card__note';
    note.textContent = noteText;
    card.appendChild(note);
  }
  card.appendChild(actions);
  return card;
}

function createGuideProviders() {
  const wrap = document.createElement('div');
  wrap.className = 'guide-providers';
  GUIDE_PROVIDERS.forEach((provider) => wrap.appendChild(createGuideProviderCard(provider)));
  return wrap;
}

function createGuideFaq() {
  const wrap = document.createElement('div');
  wrap.className = 'guide-faq__items';
  GUIDE_FAQ.forEach((item) => {
    const details = document.createElement('details');
    details.className = 'guide-faq__item';
    const summary = document.createElement('summary');
    summary.textContent = guideText(item.q);
    const answer = document.createElement('p');
    answer.textContent = guideText(item.a);
    details.append(summary, answer);
    wrap.appendChild(details);
  });
  return wrap;
}

function createGuideSection(titleKey, content, className) {
  const section = document.createElement('section');
  section.className = className || 'guide-block';
  const heading = document.createElement('h3');
  heading.className = 'guide-block__title';
  heading.textContent = t(titleKey);
  section.append(heading, content);
  return section;
}

function applyGuideFolding() {
  const portrait = document.documentElement.dataset.layout === 'portrait';
  $$('[data-guide-fold]').forEach((section) => {
    let toggle = Array.from(section.children).find((child) => child.classList && child.classList.contains('guide-fold__toggle'));
    let shouldFold;
    if (section.dataset.userFold === '0') shouldFold = false;
    else if (section.dataset.userFold === '1') shouldFold = true;
    else shouldFold = portrait;
    section.classList.toggle('is-folded', shouldFold);
    if (!portrait) {
      if (toggle) toggle.remove();
      delete section.dataset.userFold;
      return;
    }
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'guide-fold__toggle ghost-btn';
      toggle.addEventListener('click', () => {
        const nowFolded = !section.classList.contains('is-folded');
        section.classList.toggle('is-folded', nowFolded);
        section.dataset.userFold = nowFolded ? '1' : '0';
        toggle.textContent = t(nowFolded ? 'guide.expand' : 'guide.collapse');
      });
      section.appendChild(toggle);
    }
    toggle.textContent = t(section.classList.contains('is-folded') ? 'guide.expand' : 'guide.collapse');
  });
}

function renderGuide() {
  const steps = $('#guide-steps');
  if (steps) steps.replaceChildren(createGuideSteps());
  const concepts = $('#guide-concepts');
  if (concepts) concepts.replaceChildren(createGuideConcepts());
  const providers = $('#guide-providers');
  if (providers) providers.replaceChildren(createGuideProviders());
  const faq = $('#guide-faq');
  if (faq) faq.replaceChildren(createGuideFaq());

  const modalBody = $('#guide-modal-body');
  if (!modalBody) return;
  const notes = document.createElement('div');
  notes.className = 'guide-notes';
  const providerNote = document.createElement('p');
  providerNote.className = 'guide-note';
  providerNote.textContent = t('guide.providerNote');
  const costNote = document.createElement('p');
  costNote.className = 'guide-note guide-note--cost';
  costNote.textContent = t('guide.costNote');
  const securityNote = document.createElement('p');
  securityNote.className = 'guide-note';
  securityNote.textContent = t('guide.securityNote');
  notes.append(providerNote, costNote, securityNote);

  const faqSection = document.createElement('section');
  faqSection.className = 'guide-block';
  const faqHeading = document.createElement('h3');
  faqHeading.className = 'guide-block__title';
  faqHeading.textContent = t('guide.faqLabel');
  faqSection.append(faqHeading, createGuideFaq());

  modalBody.replaceChildren(
    createGuideSection('guide.stepsLabel', createGuideSteps()),
    createGuideSection('guide.conceptsLabel', createGuideConcepts()),
    createGuideSection('guide.providersLabel', createGuideProviders()),
    notes,
    faqSection
  );
  applyGuideFolding();
}

function applyGuideProvider(providerId) {
  const provider = GUIDE_PROVIDERS.find((item) => item.id === providerId);
  if (!provider) return;
  const target = ui.guideTarget === 'settings' ? 'settings' : 'onboarding';
  const protocolSelector = target === 'settings' ? '#settings-protocol-switch' : '#protocol-switch';
  const prefix = target === 'settings' ? 'set-' : 'input-';
  const statusSelector = target === 'settings' ? '#settings-api-status' : '#onboarding-status';
  setProtocolSwitch(protocolSelector, provider.protocol === 'anthropic' ? 'anthropic' : 'openai');
  setInputValue(`${prefix}base-url`, provider.baseUrl || '');
  setInputValue(`${prefix}model`, provider.model || '');
  if (target === 'onboarding') {
    ui.presetId = provider.id;
    updatePresetActive();
  }
  updateProtocolPlaceholders();
  setFormStatus(statusSelector, 'ok', t('onboarding.filledHint'));
  closeModal('modal-guide');
  const form =
    target === 'settings' ? document.querySelector('#modal-settings [data-settings-panel="api"]') : $('#onboarding-form');
  if (form && typeof form.scrollIntoView === 'function') {
    try {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      /* ignore */
    }
  }
  const keyInput = document.getElementById(`${prefix}api-key`);
  if (keyInput && !keyInput.value) {
    try {
      keyInput.focus({ preventScroll: true });
    } catch (err) {
      /* ignore */
    }
  }
}

async function handleTestConnection(prefix, statusSelector, buttonEl) {
  const config = readConfigFields(prefix);
  const invalid = validateConfig(config);
  if (invalid) {
    setFormStatus(statusSelector, 'error', invalid);
    return;
  }
  const originalText = buttonEl.textContent;
  buttonEl.disabled = true;
  buttonEl.textContent = t(prefix === 'input-' ? 'onboarding.testingButton' : 'settings.testingButton');
  setFormStatus(statusSelector, '', '');
  try {
    const result = await testConnection(config, { testMessage: t('api.testMessage') });
    const latency = Number.isFinite(result.latency) ? `${result.latency}ms` : '';
    setFormStatus(statusSelector, 'ok', `${t('onboarding.testSuccess')} ${latency}`.trim());
    toast(t('onboarding.testSuccess'), 'ok');
  } catch (err) {
    const detail = err && err.message ? err.message : '';
    setFormStatus(statusSelector, 'error', t('onboarding.testFailed') + (detail ? `（${detail}）` : ''));
  } finally {
    buttonEl.disabled = false;
    buttonEl.textContent = originalText;
  }
}

function handleOnboardingSubmit(event) {
  event.preventDefault();
  const config = readConfigFields('input-');
  const invalid = validateConfig(config);
  if (invalid) {
    setFormStatus('#onboarding-status', 'error', invalid);
    return;
  }
  store.updateConfig(config);
  store.updateSettings({ lang: ui.lang });
  setFormStatus('#onboarding-status', 'ok', t('onboarding.savedToast'));
  toast(t('onboarding.savedToast'), 'ok');
  resetGameState();
  showView('home');
  renderHome();
  updateStatusbar();
}

/* ============================================================
 * 主页
 * ============================================================ */

function modeById(id) {
  return MODES.find((mode) => mode.id === id) || MODES[0];
}

function modeName(mode) {
  return (mode.names && (mode.names[ui.lang] || mode.names.zh)) || mode.id;
}

function updateHomeApiStatus() {
  const textEl = $('#home-api-text');
  const wrap = $('#home-api-status');
  if (!textEl) return;
  const configured = store.isConfigured();
  textEl.textContent = configured
    ? t('home.apiConfigured', { model: store.getConfig().model })
    : t('home.apiMissing');
  if (wrap) {
    wrap.classList.toggle('is-ok', configured);
    wrap.classList.toggle('is-warn', !configured);
  }
  const btn = $('#btn-configure-api');
  if (btn) btn.hidden = configured;
}

function renderModeGrid() {
  const grid = $('#mode-grid');
  if (!grid) return;
  grid.innerHTML = '';
  MODES.forEach((mode) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mode-card';
    btn.dataset.mode = mode.id;
    if (mode.accent) btn.style.setProperty('--accent', mode.accent);
    const primary = modeName(mode);
    const secondary = mode.names ? mode.names[ui.lang === 'zh' ? 'en' : 'zh'] : '';
    btn.innerHTML =
      `<span class="mode-card__sigil">${escapeHtml(mode.sigil || '')}</span>` +
      `<span class="mode-card__name">${escapeHtml(primary)}</span>` +
      `<span class="mode-card__en">${escapeHtml(secondary || '')}</span>` +
      `<span class="mode-card__blurb">${escapeHtml((mode.blurbs && (mode.blurbs[ui.lang] || mode.blurbs.zh)) || '')}</span>` +
      `<span class="mode-card__cta">${escapeHtml(t('home.playMode'))}</span>`;
    grid.appendChild(btn);
  });
}

function relativeDate(timestamp) {
  const diff = Date.now() - Number(timestamp || 0);
  if (!Number.isFinite(diff) || diff < 0) return t('common.justNow');
  if (diff < 60000) return t('common.justNow');
  if (diff < 3600000) return t('common.minutesAgo', { n: Math.floor(diff / 60000) });
  if (diff < 86400000) return t('common.hoursAgo', { n: Math.floor(diff / 3600000) });
  if (diff < 7 * 86400000) return t('common.daysAgo', { n: Math.floor(diff / 86400000) });
  try {
    return new Intl.DateTimeFormat(ui.lang === 'zh' ? 'zh-CN' : 'en', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(Number(timestamp)));
  } catch (err) {
    return '';
  }
}

function buildSessionRow(session, className) {
  const row = document.createElement('div');
  row.className = className;
  row.dataset.sessionId = session.id;
  const mode = modeById(session.modeId);

  const main = document.createElement('button');
  main.type = 'button';
  main.className = `${className}__main`;
  main.dataset.action = 'open';
  const title = document.createElement('span');
  title.className = `${className}__title`;
  title.textContent = session.title || t('common.unnamedSession');
  const meta = document.createElement('span');
  meta.className = `${className}__meta`;
  meta.textContent = t('home.sessionMeta', {
    mode: modeName(mode),
    turns: session.turns || 0,
    date: relativeDate(session.updatedAt),
  });
  main.append(title, meta);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = `${className}__del ghost-btn`;
  del.dataset.action = 'delete';
  del.textContent = t('common.delete');

  row.append(main, del);
  return row;
}

function renderRecent() {
  const list = $('#recent-list');
  const empty = $('#recent-empty');
  if (!list) return;
  list.innerHTML = '';
  const sessions = store.getSessions().slice(0, 5);
  if (empty) empty.hidden = sessions.length > 0;
  sessions.forEach((session) => list.appendChild(buildSessionRow(session, 'recent-row')));
}

function renderHome() {
  updateHomeApiStatus();
  renderModeGrid();
  renderRecent();
  updateStatusbar();
}

/* ============================================================
 * 游戏：渲染
 * ============================================================ */

function updateGameHeader() {
  const session = ui.session;
  if (!session) return;
  const mode = modeById(session.modeId);
  const view = $('#view-game');
  if (view && mode.accent) view.style.setProperty('--accent', mode.accent);
  const sigil = $('#game-mode-sigil');
  if (sigil) sigil.textContent = mode.sigil || '';
  const nameEl = $('#game-mode-name');
  if (nameEl) nameEl.textContent = modeName(mode);
  const titleEl = $('#game-session-title');
  if (titleEl) titleEl.textContent = session.title || t('common.unnamedSession');
  const turnEl = $('#game-turn');
  if (turnEl) {
    turnEl.textContent = t('game.turnLabel', {
      n: (session.turns || 0) + (ui.streaming ? 1 : 0),
    });
  }
  const providerEl = $('#game-provider');
  if (providerEl) providerEl.textContent = store.getConfig().model || '';
  updateContextInfo();
}

function updateContextInfo() {
  const el = $('#game-context');
  if (!el || !ui.session) return;
  const session = store.getSession(ui.session.id);
  const count = session ? session.messages.length : 0;
  el.textContent = t('game.contextInfo', { n: count });
}

function scrollStoryToBottom(force) {
  const log = $('#story-log');
  if (!log) return;
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 140;
  if (force || nearBottom) log.scrollTop = log.scrollHeight;
}

function appendPlayerTurn(text, options = {}) {
  const log = $('#story-log');
  if (!log) return;
  const article = document.createElement('article');
  article.className = 'story-turn story-turn--player';
  if (options.animate === false) article.classList.add('no-animate');
  else article.classList.add('is-entering');
  const label = document.createElement('span');
  label.className = 'story-turn__player-label';
  label.textContent = t('game.playerChoiceLabel');
  const body = document.createElement('div');
  body.className = 'story-turn__body';
  body.textContent = text;
  article.append(label, body);
  log.appendChild(article);
  scrollStoryToBottom(options.animate !== false);
}

function appendAiTurnStatic(story, turnNumber) {
  const log = $('#story-log');
  if (!log) return;
  const article = document.createElement('article');
  article.className = 'story-turn story-turn--ai no-animate';
  const meta = document.createElement('span');
  meta.className = 'story-turn__meta';
  meta.textContent = t('game.turnLabel', { n: turnNumber });
  const body = document.createElement('div');
  body.className = 'story-turn__body';
  renderRich(body, story);
  article.append(meta, body);
  log.appendChild(article);
}

function createStreamingTurn(turnNumber) {
  const log = $('#story-log');
  if (!log) return null;
  const article = document.createElement('article');
  article.className = 'story-turn story-turn--ai is-streaming is-entering';
  const meta = document.createElement('span');
  meta.className = 'story-turn__meta';
  meta.textContent = t('game.turnLabel', { n: turnNumber });
  const body = document.createElement('div');
  body.className = 'story-turn__body';
  const cursor = document.createElement('span');
  cursor.className = 'typing-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  article.append(meta, body, cursor);
  log.appendChild(article);
  scrollStoryToBottom(true);
  return { article, body };
}

function renderStoryHistory() {
  const log = $('#story-log');
  if (!log) return;
  log.innerHTML = '';
  const session = ui.session;
  if (!session) return;
  let turnNumber = 0;
  session.messages.forEach((message, index) => {
    if (index === 0 && message.role === 'user') return; // 开场占位消息不展示
    if (message.role === 'user') {
      appendPlayerTurn(message.content, { animate: false });
      return;
    }
    turnNumber += 1;
    const parsed = parseResponse(message.content);
    appendAiTurnStatic(parsed.story || '', turnNumber);
  });
  scrollStoryToBottom(true);
}

function clearChoices() {
  const list = $('#choices-list');
  if (list) list.innerHTML = '';
}

function hideError() {
  const el = $('#game-error');
  if (el) {
    el.hidden = true;
    el.textContent = '';
  }
}

function showError(message) {
  const el = $('#game-error');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

function showRetry(visible) {
  const el = $('#btn-retry-turn');
  if (el) el.hidden = !visible;
}

function showSkip(visible) {
  const el = $('#btn-skip-typing');
  if (el) el.hidden = !visible;
}

function setBusy(busy) {
  document.body.classList.toggle('is-busy', busy);
  const input = $('#input-free-action');
  const send = $('#btn-send-action');
  if (input) input.disabled = busy;
  if (send) send.disabled = busy;
  const choices = $('#choices-list');
  if (choices) choices.classList.toggle('is-disabled', busy);
}

function renderChoices(choices) {
  const list = $('#choices-list');
  if (!list) return;
  list.innerHTML = '';
  const numerals = NUMERALS[ui.lang] || NUMERALS.zh;
  const source =
    Array.isArray(choices) && choices.length
      ? choices
      : FALLBACK_CHOICES[ui.lang] || FALLBACK_CHOICES.zh || [];
  const finalChoices = source.slice(0, 5);
  finalChoices.forEach((text, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice-btn';
    btn.style.setProperty('--i', String(index));
    const num = document.createElement('span');
    num.className = 'choice-btn__num';
    num.textContent = numerals[index] || String(index + 1);
    const textEl = document.createElement('span');
    textEl.className = 'choice-btn__text';
    textEl.textContent = text;
    btn.append(num, textEl);
    btn.addEventListener('click', () => {
      if (ui.streaming) return;
      handleChoice(text);
    });
    list.appendChild(btn);
  });
  const panel = $('.choices-panel');
  if (panel) panel.classList.remove('is-thinking');
}

function rerenderChoices() {
  if (ui.view !== 'game') return;
  if (ui.streaming) return;
  const session = ui.session;
  if (!session) return;
  const last = session.messages[session.messages.length - 1];
  if (!last || last.role !== 'assistant') return;
  const parsed = parseResponse(last.content);
  if (parsed.choices && parsed.choices.length) renderChoices(parsed.choices);
}

/* ============================================================
 * 游戏：会话生命周期
 * ============================================================ */

function resetGameState() {
  abortStream(true);
  ui.session = null;
  ui.lastScene = null;
  clearChoices();
  hideError();
  showRetry(false);
  showSkip(false);
  setBusy(false);
  const log = $('#story-log');
  if (log) log.innerHTML = '';
}

function resetGameView() {
  clearChoices();
  hideError();
  showRetry(false);
  showSkip(false);
  const log = $('#story-log');
  if (log) log.innerHTML = '';
  setBusy(false);
  ui.streaming = false;
}

function prepareGame() {
  const session = ui.session;
  if (!session) return;
  updateGameHeader();
  renderStoryHistory();
  const last = session.messages[session.messages.length - 1];
  if (!last) {
    setStatus('ready');
    startOpening();
    return;
  }
  if (last.role === 'assistant') {
    const parsed = parseResponse(last.content);
    ui.lastScene = parsed;
    renderChoices(parsed.choices && parsed.choices.length ? parsed.choices : FALLBACK_CHOICES[ui.lang]);
    setStatus('ready');
  } else {
    ui.lastScene = null;
    clearChoices();
    showRetry(true);
    setStatus('error');
  }
  updateStatusbar();
}

function startMode(modeId) {
  if (!store.isConfigured()) {
    toast(t('home.apiMissing'), 'error');
    openSettings('api');
    return;
  }
  closeAllModals();
  const session = store.createSession({ modeId, lang: ui.lang });
  ui.session = session;
  showView('game');
  resetGameView();
  prepareGame();
}

function openSession(sessionId) {
  const session = store.getSession(sessionId);
  if (!session) {
    toast(t('sessions.corruptToast'), 'error');
    return;
  }
  store.setActiveSession(sessionId);
  ui.session = session;
  closeAllModals();
  showView('game');
  resetGameView();
  prepareGame();
}

async function startOpening() {
  const session = ui.session;
  if (!session) return;
  if (ui.streaming) return;
  const opening = OPENING_MESSAGE[ui.lang] || OPENING_MESSAGE.zh || '开始吧。';
  store.appendMessage(session.id, { role: 'user', content: opening });
  ui.session = store.getSession(session.id);
  renderStoryHistory();
  await requestTurn();
}

async function handleChoice(text) {
  const input = $('#input-free-action');
  if (input) input.value = '';
  await sendAction(text);
}

async function sendAction(text) {
  const action = String(text || '').trim();
  if (!action || ui.streaming) return;
  if (!store.isConfigured()) {
    toast(t('home.apiMissing'), 'error');
    openSettings('api');
    return;
  }
  const session = ui.session;
  if (!session) return;
  const last = session.messages[session.messages.length - 1];
  if (last && last.role === 'user') {
    // 上一回合的玩家行动没有得到回应（报错 / 中途离开）：用新行动替换它，
    // 避免出现连续两条 user 消息（Anthropic 等接口要求 user/assistant 严格交替）。
    store.updateSession(session.id, {
      messages: [...session.messages.slice(0, -1), { role: 'user', content: action }],
    });
    ui.session = store.getSession(session.id);
    renderStoryHistory();
  } else {
    store.appendMessage(session.id, { role: 'user', content: action });
    ui.session = store.getSession(session.id);
    appendPlayerTurn(action);
  }
  clearChoices();
  hideError();
  showRetry(false);
  await requestTurn();
}

/* ============================================================
 * 游戏：请求与流式
 * ============================================================ */

function ensureProtocolText(raw, story, choices) {
  const hasStory = /<\s*story\s*>/i.test(raw) && /<\s*\/\s*story\s*>/i.test(raw);
  const hasChoices = /<\s*choices\s*>/i.test(raw) && /<\s*\/\s*choices\s*>/i.test(raw);
  if (hasStory && hasChoices) return raw;
  const choiceLines = choices.map((choice, index) => `${index + 1}. ${choice}`).join('\n');
  return `<story>\n${story}\n</story>\n<choices>\n${choiceLines}\n</choices>`;
}

function setStreamingState(streaming) {
  ui.streaming = streaming;
  setBusy(streaming);
  showSkip(streaming);
  if (streaming) {
    setStatus('streaming');
    const panel = $('.choices-panel');
    if (panel) panel.classList.add('is-thinking');
  }
  updateGameHeader();
}

function playTypingSound(chars) {
  if (!store.getSettings().sound) return;
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    if (!ui.audioCtx) ui.audioCtx = new AudioCtor();
    const ctx = ui.audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const count = Math.min(3, Math.max(1, chars));
    for (let i = 0; i < count; i += 1) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = 1500 + Math.random() * 700;
      const start = now + i * 0.01;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.025, start + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.06);
    }
  } catch (err) {
    /* 静默失败 */
  }
}

function abortStream(silent = false) {
  if (ui.abort) {
    try {
      ui.abort.abort();
    } catch (err) {
      /* ignore */
    }
    ui.abort = null;
  }
  if (ui.typewriter) {
    ui.typewriter.stop();
    ui.typewriter = null;
  }
  ui.streaming = false;
  setBusy(false);
  showSkip(false);
  if (silent) {
    setStatus('ready');
    ui.streamRaw = '';
  }
}

function cleanupStreamingArticle() {
  if (ui.streamArticle && ui.streamArticle.parentNode) {
    ui.streamArticle.remove();
  }
  ui.streamArticle = null;
  ui.streamBody = null;
  ui.pendingFinalize = null;
}

function finalizeTurn(story, choices) {
  const article = ui.streamArticle;
  const body = ui.streamBody;
  if (article) {
    article.classList.remove('is-streaming', 'is-entering');
    const cursor = article.querySelector('.typing-cursor');
    if (cursor) cursor.remove();
  }
  if (body) renderRich(body, story);
  ui.typewriter = null;
  cleanupStreamingArticleRefsOnly();
  ui.streaming = false;
  setBusy(false);
  showSkip(false);
  renderChoices(choices);
  updateGameHeader();
  updateContextInfo();
  updateStatusbar();
  setStatus('saved');
  scrollStoryToBottom(false);
  if (ui.session) {
    announce(t('game.turnLabel', { n: ui.session.turns || 1 }));
  }
}

function cleanupStreamingArticleRefsOnly() {
  ui.streamArticle = null;
  ui.streamBody = null;
  ui.pendingFinalize = null;
  ui.streamRaw = '';
}

function handleTurnError(err) {
  if (ui.typewriter) {
    ui.typewriter.stop();
    ui.typewriter = null;
  }
  cleanupStreamingArticle();
  setStreamingState(false);
  setBusy(false);
  if (isAbortError(err)) {
    setStatus('ready');
    return;
  }
  showError(formatApiError(err));
  showRetry(true);
  setStatus('error');
  updateStatusbar();
}

async function requestTurn() {
  if (ui.streaming) return;
  const session = ui.session;
  if (!session) return;
  if (!store.isConfigured()) {
    toast(t('home.apiMissing'), 'error');
    openSettings('api');
    return;
  }
  const context = store.buildContextMessages(session.id);
  if (!context.length) return;

  const lang = ui.lang;
  const mode = modeById(session.modeId);
  const config = store.getConfig();
  store.updateSession(session.id, { lang });
  ui.session = store.getSession(session.id);

  hideError();
  showRetry(false);
  setStreamingState(true);
  const turnNumber = (ui.session.turns || 0) + 1;
  const created = createStreamingTurn(turnNumber);
  if (!created) {
    setStreamingState(false);
    return;
  }
  ui.streamArticle = created.article;
  ui.streamBody = created.body;
  ui.streamRaw = '';

  const tw = new Typewriter(created.body, {
    speed: store.getSettings().speed,
    onDone: () => {
      const finalize = ui.pendingFinalize;
      ui.pendingFinalize = null;
      if (typeof finalize === 'function') finalize();
    },
    onUpdate: () => scrollStoryToBottom(false),
    onType: (chars) => playTypingSound(chars),
  });
  ui.typewriter = tw;

  const controller = new AbortController();
  ui.abort = controller;

  try {
    const result = await streamChat(config, {
      system: buildSystemPrompt(mode.id, lang),
      messages: context,
      signal: controller.signal,
      onDelta: (delta, full) => {
        ui.streamRaw = full;
        const visibleStory = extractStreamStory(full);
        tw.feed(plainifyForTyping(visibleStory));
      },
    });

    ui.streamRaw = result.text || ui.streamRaw;
    const parsed = parseResponse(ui.streamRaw);
    let story = parsed.story && parsed.story.trim() ? parsed.story.trim() : plainifyForTyping(ui.streamRaw).trim();
    let choices = parsed.choices && parsed.choices.length ? parsed.choices.slice() : [];
    if (!choices.length) {
      choices = (FALLBACK_CHOICES[lang] || FALLBACK_CHOICES.zh || []).slice();
    }
    if (!story) {
      throw Object.assign(new Error(t('game.errorEmpty')), { code: 'empty' });
    }

    const assistantContent = ensureProtocolText(ui.streamRaw, story, choices);
    store.appendMessage(session.id, { role: 'assistant', content: assistantContent });
    const patch = { turns: (ui.session.turns || 0) + 1, lang };
    let latest = store.getSession(session.id);
    if (latest && !latest.title) {
      patch.title = titleFromStory(story, lang) || t('common.unnamedSession');
    }
    store.updateSession(session.id, patch);
    ui.session = store.getSession(session.id);
    const finalStory = story;
    const finalChoices = choices;
    ui.pendingFinalize = () => finalizeTurn(finalStory, finalChoices);
    tw.end();

    if (ui.session && !ui.session.title && patch.title) {
      updateGameHeader();
    }
  } catch (err) {
    if (ui.abort === controller) ui.abort = null;
    handleTurnError(err);
  } finally {
    if (ui.abort === controller) ui.abort = null;
  }
}

async function retryTurn() {
  if (ui.streaming) return;
  const session = ui.session;
  if (!session) return;
  const last = session.messages[session.messages.length - 1];
  if (!last || last.role !== 'user') return;
  hideError();
  showRetry(false);
  await requestTurn();
}

/* ============================================================
 * 设置
 * ============================================================ */

function switchSettingsTab(tab) {
  $$('[data-settings-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.settingsTab === tab);
    btn.setAttribute('aria-selected', String(btn.dataset.settingsTab === tab));
  });
  $$('[data-settings-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== tab;
  });
  const modal = $('#modal-settings');
  if (modal) modal.dataset.tab = tab;
}

function updateSoundState() {
  const el = $('#sound-state');
  if (!el) return;
  const soundOn = Boolean(store.getSettings().sound);
  el.textContent = t(soundOn ? 'settings.soundOn' : 'settings.soundOff');
  el.classList.toggle('is-on', soundOn);
}

function updateAboutTexts() {
  const deviceEl = $('#about-device');
  if (deviceEl) {
    deviceEl.textContent = t('settings.aboutDevice', {
      device: t(ui.device === 'mobile' ? 'settings.deviceMobile' : 'settings.deviceDesktop'),
    });
  }
  const versionEl = $('#about-version');
  if (versionEl) versionEl.textContent = t('settings.version', { version: APP_VERSION });
}

function fillSettingsControls() {
  const settings = store.getSettings();
  const layout = $('#select-layout');
  const speed = $('#select-speed');
  const sound = $('#toggle-sound');
  if (layout) layout.value = settings.layout;
  if (speed) speed.value = settings.speed;
  if (sound) sound.checked = Boolean(settings.sound);
  updateSoundState();
}

function openSettings(tab = 'api') {
  fillConfigFields('set-', store.getConfig());
  fillSettingsControls();
  switchSettingsTab(tab);
  updateAboutTexts();
  openModal('modal-settings');
}

function saveSettingsApi() {
  const config = readConfigFields('set-');
  const invalid = validateConfig(config);
  if (invalid) {
    setFormStatus('#settings-api-status', 'error', invalid);
    return;
  }
  store.updateConfig(config);
  setFormStatus('#settings-api-status', 'ok', t('settings.savedToast'));
  toast(t('settings.savedToast'), 'ok');
  updateStatusbar();
  updateHomeApiStatus();
  updateGameHeader();
  if (ui.view === 'onboarding' && store.isConfigured()) {
    closeModal('modal-settings');
    showView('home');
    renderHome();
  }
}

function saveSetting(patch) {
  store.updateSettings(patch);
  updateSoundState();
}

async function exportData() {
  try {
    const json = store.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    anchor.href = url;
    anchor.download = `appealingwords-${stamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(t('settings.exportedToast'), 'ok');
  } catch (err) {
    toast(t('toast.storageError'), 'error');
  }
}

async function importDataFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const result = store.importJSON(text);
    if (!result.ok) {
      toast(t('settings.importFailedToast'), 'error');
      return;
    }
    afterDataReplaced();
    toast(t('settings.importedToast'), 'ok');
  } catch (err) {
    toast(t('settings.importFailedToast'), 'error');
  }
}

async function clearAllData() {
  const ok = await confirmDialog(t('settings.clearConfirm'), { danger: true });
  if (!ok) return;
  abortStream(true);
  store.clearAll();
  ui.session = null;
  ui.lang = store.getSettings().lang;
  closeAllModals();
  afterDataReplaced();
  toast(t('settings.clearedToast'), 'ok');
}

function afterDataReplaced() {
  ui.lang = store.getSettings().lang;
  applyI18n();
  applyLayout();
  initOnboarding();
  fillConfigFields('set-', store.getConfig());
  fillSettingsControls();
  resetGameState();
  if (store.isConfigured()) {
    showView('home');
    renderHome();
  } else {
    showView('onboarding');
  }
  updateStatusbar();
}

/* ============================================================
 * 档案室
 * ============================================================ */

function renderSessions() {
  const list = $('#session-list');
  const empty = $('#sessions-empty');
  const countEl = $('#sessions-count');
  if (!list) return;
  const sessions = store.getSessions();
  if (countEl) countEl.textContent = t('sessions.count', { count: sessions.length });
  list.innerHTML = '';
  if (empty) empty.hidden = sessions.length > 0;
  sessions.forEach((session) => list.appendChild(buildSessionRow(session, 'session-row')));
}

function openSessions() {
  renderSessions();
  openModal('modal-sessions');
}

function closeAllModals() {
  ['modal-settings', 'modal-sessions', 'modal-confirm'].forEach((id) => closeModal(id));
  ui.confirmResolve = null;
  document.body.classList.remove('is-modal-open');
}

/* ============================================================
 * 会话行操作
 * ============================================================ */

async function handleSessionAction(action, sessionId, className) {
  if (action === 'open') {
    openSession(sessionId);
    return;
  }
  if (action !== 'delete') return;
  const confirmText =
    className === 'session-row' ? t('sessions.deleteConfirm') : t('home.sessionDeleteConfirm');
  const ok = await confirmDialog(confirmText, { danger: true });
  if (!ok) return;
  store.deleteSession(sessionId);
  if (ui.session && ui.session.id === sessionId) {
    ui.session = null;
    showView('home');
    renderHome();
  }
  renderRecent();
  renderSessions();
  toast(t('sessions.deletedToast'), 'ok');
}

/* ============================================================
 * 事件绑定
 * ============================================================ */

function bindEvents() {
  if (ui.booted) return;
  ui.booted = true;

  // 顶栏
  const homeBtn = $('#btn-home');
  if (homeBtn) homeBtn.addEventListener('click', () => goHome());
  const sessionsBtn = $('#btn-sessions');
  if (sessionsBtn) sessionsBtn.addEventListener('click', () => openSessions());
  const settingsBtn = $('#btn-settings');
  if (settingsBtn) settingsBtn.addEventListener('click', () => openSettings('api'));

  const langSwitch = $('#lang-switch');
  if (langSwitch) {
    langSwitch.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-lang]');
      if (!btn) return;
      setLang(btn.dataset.lang);
    });
  }

  // 引导页
  const protocolSwitch = $('#protocol-switch');
  if (protocolSwitch) {
    protocolSwitch.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-protocol]');
      if (!btn) return;
      setProtocolSwitch('#protocol-switch', btn.dataset.protocol);
      updateProtocolPlaceholders();
    });
  }
  const presetChips = $('#preset-chips');
  if (presetChips) {
    presetChips.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-preset]');
      if (!chip) return;
      applyPreset(chip.dataset.preset);
    });
  }
  const toggleKey = $('#btn-toggle-key');
  if (toggleKey) toggleKey.addEventListener('click', () => toggleKeyVisibility('#input-api-key'));
  const toggleSetKey = $('#btn-toggle-set-key');
  if (toggleSetKey) toggleSetKey.addEventListener('click', () => toggleKeyVisibility('#set-api-key'));
  const onboardingForm = $('#onboarding-form');
  if (onboardingForm) onboardingForm.addEventListener('submit', handleOnboardingSubmit);
  const testBtn = $('#btn-test-connection');
  if (testBtn) {
    testBtn.addEventListener('click', () =>
      handleTestConnection('input-', '#onboarding-status', testBtn)
    );
  }

  // 主页
  const modeGrid = $('#mode-grid');
  if (modeGrid) {
    modeGrid.addEventListener('click', (event) => {
      const card = event.target.closest('[data-mode]');
      if (!card) return;
      startMode(card.dataset.mode);
    });
  }
  const configureBtn = $('#btn-configure-api');
  if (configureBtn) configureBtn.addEventListener('click', () => openSettings('api'));
  const guideBtn = $('#btn-open-guide');
  if (guideBtn) {
    guideBtn.addEventListener('click', () => {
      ui.guideTarget = 'onboarding';
      renderGuide();
      openModal('modal-guide');
    });
  }
  const guideSettingsBtn = $('#btn-open-guide-settings');
  if (guideSettingsBtn) {
    guideSettingsBtn.addEventListener('click', () => {
      ui.guideTarget = 'settings';
      renderGuide();
      openModal('modal-guide');
    });
  }
  const gotoFormBtn = $('#btn-goto-form');
  if (gotoFormBtn) {
    gotoFormBtn.addEventListener('click', () => {
      const form = $('#onboarding-form');
      if (form && typeof form.scrollIntoView === 'function') {
        try {
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (err) {
          /* ignore */
        }
      }
      const baseInput = $('#input-base-url');
      if (baseInput) {
        try {
          baseInput.focus({ preventScroll: true });
        } catch (err) {
          /* ignore */
        }
      }
    });
  }
  document.addEventListener('click', (event) => {
    const fill = event.target.closest('[data-guide-fill]');
    if (!fill) return;
    event.preventDefault();
    applyGuideProvider(fill.dataset.guideFill);
  });
  const recentList = $('#recent-list');
  if (recentList) {
    recentList.addEventListener('click', (event) => {
      const row = event.target.closest('[data-session-id]');
      if (!row) return;
      const actionEl = event.target.closest('[data-action]');
      const action = actionEl ? actionEl.dataset.action : 'open';
      handleSessionAction(action, row.dataset.sessionId, 'recent-row');
    });
  }

  // 游戏
  const skipBtn = $('#btn-skip-typing');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      if (ui.typewriter) ui.typewriter.skip();
      showSkip(false);
    });
  }
  const retryBtn = $('#btn-retry-turn');
  if (retryBtn) retryBtn.addEventListener('click', () => retryTurn());
  const newGameBtn = $('#btn-game-new');
  if (newGameBtn) {
    newGameBtn.addEventListener('click', () => {
      if (ui.streaming) abortStream(true);
      showView('home');
      renderHome();
    });
  }
  const freeForm = $('#free-form');
  if (freeForm) {
    freeForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = $('#input-free-action');
      const value = input ? input.value : '';
      if (!String(value || '').trim()) return;
      if (input) input.value = '';
      await sendAction(value);
    });
  }
  const storyLog = $('#story-log');
  if (storyLog) {
    storyLog.addEventListener('click', () => {
      if (ui.streaming && ui.typewriter) ui.typewriter.skip();
    });
  }

  // 设置弹窗
  const settingsTabs = $('[data-settings-tab]');
  if (settingsTabs) {
    $$('[data-settings-tab]').forEach((btn) =>
      btn.addEventListener('click', () => switchSettingsTab(btn.dataset.settingsTab))
    );
  }
  const settingsProtocol = $('#settings-protocol-switch');
  if (settingsProtocol) {
    settingsProtocol.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-protocol]');
      if (!btn) return;
      setProtocolSwitch('#settings-protocol-switch', btn.dataset.protocol);
      updateProtocolPlaceholders();
    });
  }
  const saveSettingsBtn = $('#btn-save-settings-api');
  if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettingsApi);
  const testSettingsBtn = $('#btn-test-settings');
  if (testSettingsBtn) {
    testSettingsBtn.addEventListener('click', () =>
      handleTestConnection('set-', '#settings-api-status', testSettingsBtn)
    );
  }
  const layoutSelect = $('#select-layout');
  if (layoutSelect) {
    layoutSelect.addEventListener('change', () => {
      saveSetting({ layout: layoutSelect.value });
      applyLayout();
    });
  }
  const speedSelect = $('#select-speed');
  if (speedSelect) {
    speedSelect.addEventListener('change', () => saveSetting({ speed: speedSelect.value }));
  }
  const soundToggle = $('#toggle-sound');
  if (soundToggle) {
    soundToggle.addEventListener('change', () => {
      saveSetting({ sound: soundToggle.checked });
      if (soundToggle.checked) playTypingSound(1);
    });
  }
  const exportBtn = $('#btn-export-data');
  if (exportBtn) exportBtn.addEventListener('click', () => exportData());
  const importInput = $('#input-import-data');
  if (importInput) {
    importInput.addEventListener('change', async () => {
      const file = importInput.files && importInput.files[0];
      importInput.value = '';
      await importDataFile(file);
    });
  }
  const clearBtn = $('#btn-clear-data');
  if (clearBtn) clearBtn.addEventListener('click', () => clearAllData());

  // 档案室
  const sessionList = $('#session-list');
  if (sessionList) {
    sessionList.addEventListener('click', (event) => {
      const row = event.target.closest('[data-session-id]');
      if (!row) return;
      const actionEl = event.target.closest('[data-action]');
      const action = actionEl ? actionEl.dataset.action : 'open';
      handleSessionAction(action, row.dataset.sessionId, 'session-row');
    });
  }

  // 弹窗关闭 / 确认
  document.addEventListener('click', (event) => {
    const closeTrigger = event.target.closest('[data-close-modal]');
    if (closeTrigger) {
      const id = `modal-${closeTrigger.dataset.closeModal}`;
      if (id === 'modal-confirm') resolveConfirm(false);
      else closeModal(id);
    }
  });
  const confirmOk = $('#btn-confirm-ok');
  if (confirmOk) confirmOk.addEventListener('click', () => resolveConfirm(true));
  const confirmCancel = $('#btn-confirm-cancel');
  if (confirmCancel) confirmCancel.addEventListener('click', () => resolveConfirm(false));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeTopModal();
    }
  });

  window.addEventListener('beforeunload', () => {
    abortStream(true);
  });

  let viewportTimer = 0;
  const onViewportChange = () => {
    if (viewportTimer) window.clearTimeout(viewportTimer);
    viewportTimer = window.setTimeout(() => {
      viewportTimer = 0;
      handleViewportChange();
    }, 140);
  };
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);
}

/* ============================================================
 * 语言切换
 * ============================================================ */

function setLang(lang) {
  if (!LANGS.includes(lang) || lang === ui.lang) return;
  ui.lang = lang;
  store.updateSettings({ lang });
  if (ui.session) {
    store.updateSession(ui.session.id, { lang });
    ui.session = store.getSession(ui.session.id);
  }
  applyI18n();
  if (ui.view === 'home') renderHome();
  if (ui.view === 'game') {
    updateGameHeader();
    if (!ui.streaming) {
      renderStoryHistory();
      rerenderChoices();
      scrollStoryToBottom(true);
    }
  }
  updateProtocolPlaceholders();
  updatePresetActive();
  toast(t('toast.langSwitched', { lang: langLabel(lang) }), 'ok');
}

/* ============================================================
 * 启动
 * ============================================================ */

export function boot() {
  if (ui.booted) return;
  cacheStaticDom();
  detectDevice();
  ui.lang = store.getSettings().lang;
  applyI18n();
  applyLayout();
  window.__APPEALING_APP_READY__ = true;
  bindEvents();
  initOnboarding();
  fillConfigFields('set-', store.getConfig());
  fillSettingsControls();
  // 首次进入 / 继续
  const activeId = store.getActiveSessionId();
  if (store.isConfigured()) {
    showView('home');
    renderHome();
    if (activeId && store.getSession(activeId)) {
      // 不自动进入游戏，主页展示「最近的旅程」即可
    }
  } else {
    showView('onboarding');
  }
  updateStatusbar();
  setStatus('ready');
}

function cacheStaticDom() {
  const main = $('#main');
  if (main && !main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
}
