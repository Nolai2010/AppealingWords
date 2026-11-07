/**
 * dev/static-checks.mjs — v1.1 静态检查（不需要浏览器）
 *
 * 覆盖 dev/contracts-v1.1.md：
 *   §1.1 服务商事实 → i18n.js PROVIDER_PRESETS / guide.js GUIDE_PROVIDERS 一致性
 *   §3   guide.js 导出结构（GUIDE_STEPS / GUIDE_CONCEPTS / GUIDE_PROVIDERS / GUIDE_FAQ）
 *   §4   i18n.js 新 key 成对 + 占位符一致 + PROVIDER_PRESETS 顺序与取值
 *   §5   README.md / README.en.md 存在、顶部互链、引用 4 张既有截图
 *   §6   index.html 新钩子（#guide-steps/#guide-concepts/#guide-providers/#guide-faq/#modal-guide 等）
 *   §8   store.js APP_VERSION = '1.1.2'
 *   v1.1.1 hotfix：layout-boot.js / legacy-notice.js 存在且 index.html 中 layout-boot 早于 CSS、legacy-notice 为 nomodule；
 *          app.js 含触屏/coarse + 窄视口识别与 resize 接管
 *   v1.1.2 布局策略：layout-boot.js 与 app.js 都使用「9:16 vs 2:1 可用面积比较 + 1.08 竖屏偏置」算法
 *
 * 用法：
 *   import { runStaticChecks } from './static-checks.mjs';
 *   const result = await runStaticChecks({ root: REPO_ROOT });
 *   // result = { ok, checks: [{name, ok, detail}], failures: [string] }
 *
 * 独立运行（对当前仓库做静态检查，跳过浏览器）：
 *   node dev/static-checks.mjs
 */

import path from 'node:path';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const REPO_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// 契约 §1.1 唯一事实来源（v1.1）
// ---------------------------------------------------------------------------

/** §4.1：保持 9 条与顺序 */
export const PROVIDER_ORDER = ['openai', 'anthropic', 'deepseek', 'glm', 'qwen', 'kimi', 'doubao', 'openrouter', 'custom'];

/** 每个服务商在 PROVIDER_PRESETS 中必须出现的取值（契约 §1.1 / §4.1） */
export const EXPECTED_PRESETS = {
  openai: { protocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-6.1-terra', labelHint: /openai/i },
  anthropic: { protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5', labelHint: /anthropic|claude/i },
  deepseek: { protocol: 'openai', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', labelHint: /deepseek/i },
  glm: { protocol: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.3', labelHint: /glm|智谱/i },
  qwen: { protocol: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.8-max', labelHint: /qwen|通义/i },
  kimi: { protocol: 'openai', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3.1-pro', labelHint: /kimi|月之暗面/i },
  doubao: { protocol: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-2-0-code', labelHint: /doubao|豆包/i },
  openrouter: { protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', labelHint: /openrouter/i },
  custom: { protocol: null, baseUrl: '', model: '', labelHint: /custom|自定义/i },
};

/** guide.js GUIDE_PROVIDERS 必须与 §1.1 完全一致的字段 */
export const EXPECTED_GUIDE_PROVIDERS = {
  deepseek: { protocol: 'openai', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', keyUrl: 'https://platform.deepseek.com/api_keys' },
  kimi: { protocol: 'openai', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3.1-pro', keyUrl: 'https://platform.kimi.com/console/api-keys' },
  qwen: { protocol: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.8-max', keyUrl: 'https://bailian.console.aliyun.com/' },
  glm: { protocol: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.3', keyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys' },
  doubao: { protocol: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-2-0-code', keyUrl: 'https://console.volcengine.com/ark' },
  openai: { protocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-6.1-terra', keyUrl: 'https://platform.openai.com/api-keys' },
  anthropic: { protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5', keyUrl: 'https://console.anthropic.com/settings/keys' },
  openrouter: { protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', keyUrl: 'https://openrouter.ai/keys' },
};

/** 契约 §4.2 新增的 i18n key（zh/en 必须成对存在） */
export const REQUIRED_GUIDE_KEYS = [
  'guide.kicker',
  'guide.title',
  'guide.desc',
  'guide.stepsLabel',
  'guide.step1Title',
  'guide.step1Body',
  'guide.step1Tip',
  'guide.step2Title',
  'guide.step2Body',
  'guide.step2Tip',
  'guide.step3Title',
  'guide.step3Body',
  'guide.step3Tip',
  'guide.conceptsLabel',
  'guide.conceptBaseUrl',
  'guide.conceptBaseUrlDesc',
  'guide.conceptApiKey',
  'guide.conceptApiKeyDesc',
  'guide.conceptModel',
  'guide.conceptModelDesc',
  'guide.providersLabel',
  'guide.providersHint',
  'guide.recommendedTag',
  'guide.corsOkTag',
  'guide.corsRelayTag',
  'guide.corsUnknownTag',
  'guide.getKeyAction',
  'guide.useConfigAction',
  'guide.docsAction',
  'guide.costNote',
  'guide.securityNote',
  'guide.faqLabel',
  'guide.helpButton',
  'guide.modalTitle',
  'guide.modalIntro',
  'guide.modalClose',
  'guide.moreAction',
  'settings.guideLink',
  'settings.aboutReadme',
  'guide.currencyCny',
  'guide.currencyUsd',
  'guide.currencyBoth',
  'guide.providerNote',
];

/** 契约 §6：index.html 必须存在的静态钩子 */
export const REQUIRED_INDEX_IDS = [
  'guide-steps',
  'guide-concepts',
  'guide-providers',
  'guide-faq',
  'btn-open-guide',
  'modal-guide',
  'guide-modal-body',
  'btn-open-guide-settings',
];

const README_SCREENSHOTS = [
  'docs/screenshots/onboarding-landscape.png',
  'docs/screenshots/home-landscape.png',
  'docs/screenshots/game-landscape.png',
  'docs/screenshots/game-portrait.png',
];

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readTextSafe(filePath) {
  try {
    return await fsp.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function importFresh(filePath) {
  const url = `${pathToFileURL(filePath).href}?qa_static=${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return import(url);
}

function firstLine(err) {
  return String(err?.message || err).split('\n')[0];
}

function placeholdersOf(text) {
  const set = new Set();
  for (const match of String(text || '').matchAll(/\{([A-Za-z0-9_]+)\}/g)) set.add(match[1]);
  return [...set].sort();
}

function isHttpsUrl(value) {
  return typeof value === 'string' && /^https:\/\/[^\s]+$/.test(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function localized(value) {
  return value && typeof value === 'object' && isNonEmptyString(value.zh) && isNonEmptyString(value.en);
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/**
 * 执行全部 v1.1 静态检查。
 * @param {{root?: string}} [options]
 * @returns {Promise<{ok: boolean, checks: Array<{name: string, ok: boolean, detail: string}>, failures: string[]}>}
 */
export async function runStaticChecks({ root = REPO_ROOT } = {}) {
  const checks = [];
  const add = (name, ok, detail = '') => {
    const entry = { name, ok: Boolean(ok), detail: ok ? '' : String(detail || '') };
    checks.push(entry);
    return entry.ok;
  };
  const rel = (filePath) => path.relative(root, filePath).split(path.sep).join('/');

  const files = {
    index: path.join(root, 'index.html'),
    app: path.join(root, 'assets', 'js', 'app.js'),
    i18n: path.join(root, 'assets', 'js', 'i18n.js'),
    guide: path.join(root, 'assets', 'js', 'guide.js'),
    store: path.join(root, 'assets', 'js', 'store.js'),
    layoutBoot: path.join(root, 'assets', 'js', 'layout-boot.js'),
    legacyNotice: path.join(root, 'assets', 'js', 'legacy-notice.js'),
    readmeZh: path.join(root, 'README.md'),
    readmeEn: path.join(root, 'README.en.md'),
  };

  // ---- 0. 文件存在性 ----
  const existence = {};
  for (const [key, filePath] of Object.entries(files)) {
    existence[key] = fs.existsSync(filePath);
    add(`文件存在：${rel(filePath)}`, existence[key], `${rel(filePath)} 不存在`);
  }

  // ---- 1. store.js APP_VERSION = 1.1.2（契约 §8 / v1.1.2）----
  if (existence.store) {
    const source = (await readTextSafe(files.store)) || '';
    const match = /APP_VERSION\s*=\s*['"]([^'"]+)['"]/.exec(source);
    add(
      "store.js APP_VERSION = '1.1.2'（契约 §8）",
      match?.[1] === '1.1.2',
      match ? `实际为 ${JSON.stringify(match[1])}` : '未找到 APP_VERSION 常量',
    );
  }

  // ---- 1b. v1.1.1 移动端布局 hotfix 静态保障 ----
  if (existence.layoutBoot) {
    const source = (await readTextSafe(files.layoutBoot)) || '';
    add(
      'layout-boot.js 为经典 ES5 脚本（无 => / const / let / import / export）',
      !/=>|\bconst\b|\blet\b|\bimport\b|\bexport\b/.test(source),
      '发现 ES6+ 语法标记（该脚本必须在 CSS 前同步执行，需 ES5）',
    );
    add(
      'layout-boot.js 写 data-device / data-layout 并兼容 localStorage 手动布局',
      /data-device/.test(source) && /data-layout/.test(source) && /settings/.test(source) && /layout/.test(source),
    );
    add(
      'layout-boot.js 含触屏/coarse + 窄视口(≤820)兜底判端逻辑',
      /maxTouchPoints/.test(source) && /pointer:\s*coarse/.test(source) && /820/.test(source),
    );
    add(
      'layout-boot.js 使用「9:16 vs 2:1 可用面积 + 1.08 竖屏偏置」布局算法（v1.1.2）',
      /9\s*\/\s*16/.test(source) &&
        /(stageArea|area|Area|面积)/.test(source) &&
        /1\.08/.test(source) &&
        /1\.08\s*\*|\*\s*1\.08/.test(source),
      '未找到 9:16 / 2:1 面积比较或 1.08 偏置关键词',
    );
  }

  // ---- 2. i18n.js：PROVIDER_PRESETS + STRINGS 成对/占位符/新增 key ----
  let i18n = null;
  if (existence.i18n) {
    try {
      i18n = await importFresh(files.i18n);
      add('i18n.js 可导入（纯 ES module）', true);
    } catch (err) {
      add('i18n.js 可导入（纯 ES module）', false, firstLine(err));
    }
  }

  if (i18n) {
    const presets = i18n.PROVIDER_PRESETS;
    if (!Array.isArray(presets)) {
      add('i18n.PROVIDER_PRESETS 是数组', false, `实际类型 ${typeof presets}`);
    } else {
      add('PROVIDER_PRESETS 保持 9 条（契约 §4.1）', presets.length === 9, `实际 ${presets.length} 条`);
      const ids = presets.map((preset) => preset?.id);
      add(
        'PROVIDER_PRESETS 顺序为 openai, anthropic, deepseek, glm, qwen, kimi, doubao, openrouter, custom（契约 §4.1）',
        JSON.stringify(ids) === JSON.stringify(PROVIDER_ORDER),
        `实际顺序 ${JSON.stringify(ids)}`,
      );
      for (const id of PROVIDER_ORDER) {
        const expected = EXPECTED_PRESETS[id];
        const preset = presets.find((item) => item?.id === id);
        if (!preset) {
          add(`PROVIDER_PRESETS.${id} 存在`, false, `缺少 id=${id}`);
          continue;
        }
        if (expected.protocol) {
          add(
            `PROVIDER_PRESETS.${id}.protocol = ${expected.protocol}`,
            preset.protocol === expected.protocol,
            `实际 ${JSON.stringify(preset.protocol)}`,
          );
        }
        add(
          `PROVIDER_PRESETS.${id}.baseUrl = ${expected.baseUrl}`,
          preset.baseUrl === expected.baseUrl,
          `实际 ${JSON.stringify(preset.baseUrl)}`,
        );
        add(
          `PROVIDER_PRESETS.${id}.model = ${expected.model}`,
          preset.model === expected.model,
          `实际 ${JSON.stringify(preset.model)}`,
        );
        add(
          `PROVIDER_PRESETS.${id}.label 非空且可识别`,
          isNonEmptyString(preset.label) && expected.labelHint.test(preset.label),
          `实际 ${JSON.stringify(preset.label)}`,
        );
      }
    }

    const zh = i18n.STRINGS?.zh;
    const en = i18n.STRINGS?.en;
    const haveStrings = zh && typeof zh === 'object' && en && typeof en === 'object';
    add('i18n.STRINGS.zh / en 存在', haveStrings);
    if (haveStrings) {
      const zhKeys = Object.keys(zh).sort();
      const enKeys = Object.keys(en).sort();
      const missingInEn = zhKeys.filter((key) => !(key in en));
      const missingInZh = enKeys.filter((key) => !(key in zh));
      add(
        'i18n key 集合 zh 与 en 完全一致（契约 §5）',
        missingInEn.length === 0 && missingInZh.length === 0,
        `仅 zh 有 ${JSON.stringify(missingInEn.slice(0, 12))}；仅 en 有 ${JSON.stringify(missingInZh.slice(0, 12))}`,
      );
      const placeholderMismatch = [];
      for (const key of zhKeys) {
        if (!(key in en)) continue;
        const a = JSON.stringify(placeholdersOf(zh[key]));
        const b = JSON.stringify(placeholdersOf(en[key]));
        if (a !== b) placeholderMismatch.push(`${key} zh=${a} en=${b}`);
      }
      add(
        'i18n 占位符 {name} zh/en 一致（契约 §5）',
        placeholderMismatch.length === 0,
        placeholderMismatch.slice(0, 12).join('；'),
      );
      const missingRequired = REQUIRED_GUIDE_KEYS.filter((key) => !(key in zh) || !(key in en));
      add(
        `i18n 含 §4.2 全部 ${REQUIRED_GUIDE_KEYS.length} 个 guide 新 key`,
        missingRequired.length === 0,
        `缺少 ${JSON.stringify(missingRequired.slice(0, 20))}`,
      );
    }
  }

  // ---- 3. guide.js 契约（§3）----
  let guide = null;
  if (existence.guide) {
    try {
      guide = await importFresh(files.guide);
      add('guide.js 可导入（纯 ES module）', true);
    } catch (err) {
      add('guide.js 可导入（纯 ES module）', false, firstLine(err));
    }
  }

  if (guide) {
    const steps = guide.GUIDE_STEPS;
    add('GUIDE_STEPS 为数组且 ≥3 步（§3/§7）', Array.isArray(steps) && steps.length >= 3, `实际 ${Array.isArray(steps) ? steps.length : typeof steps}`);
    if (Array.isArray(steps)) {
      const badSteps = steps.filter((step) => !step || !isNonEmptyString(step.id) || !localized(step.title) || !localized(step.body) || (step.tip !== undefined && !localized(step.tip)));
      add('GUIDE_STEPS 每项含 id/title{zh,en}/body{zh,en}（tip 可选）', badSteps.length === 0, `异常项 ${JSON.stringify(badSteps.map((s) => s?.id))}`);
      add('GUIDE_STEPS id 唯一', new Set(steps.map((s) => s?.id)).size === steps.length);
    }

    const concepts = guide.GUIDE_CONCEPTS;
    add('GUIDE_CONCEPTS 为数组且 ≥3 项（§3/§7）', Array.isArray(concepts) && concepts.length >= 3, `实际 ${Array.isArray(concepts) ? concepts.length : typeof concepts}`);
    if (Array.isArray(concepts)) {
      const bad = concepts.filter((item) => !item || !isNonEmptyString(item.id) || !localized(item.term) || !localized(item.desc));
      add('GUIDE_CONCEPTS 每项含 id/term{zh,en}/desc{zh,en}', bad.length === 0, `异常项 ${JSON.stringify(bad.map((c) => c?.id))}`);
      const ids = new Set(concepts.map((c) => c?.id));
      add('GUIDE_CONCEPTS 覆盖 baseUrl / apiKey / model', ['baseUrl', 'apiKey', 'model'].every((id) => ids.has(id)), `实际 ids ${JSON.stringify([...ids])}`);
      add('GUIDE_CONCEPTS 每项 desc 为通俗解释（≥10 字符）', concepts.every((c) => (c?.desc?.zh || '').trim().length >= 10 && (c?.desc?.en || '').trim().length >= 10));
    }

    const providers = guide.GUIDE_PROVIDERS;
    add('GUIDE_PROVIDERS 为数组且 ≥8 个（§3/§7）', Array.isArray(providers) && providers.length >= 8, `实际 ${Array.isArray(providers) ? providers.length : typeof providers}`);
    if (Array.isArray(providers)) {
      const ids = providers.map((p) => p?.id);
      const expectedIds = PROVIDER_ORDER.filter((id) => id !== 'custom');
      add(
        'GUIDE_PROVIDERS 覆盖 8 个服务商且与 PROVIDER_PRESETS id 对应（§3）',
        expectedIds.every((id) => ids.includes(id)) && new Set(ids).size === ids.length,
        `实际 ids ${JSON.stringify(ids)}`,
      );
      const bad = providers.filter(
        (p) =>
          !p ||
          !isNonEmptyString(p.name) ||
          !['openai', 'anthropic'].includes(p.protocol) ||
          !isNonEmptyString(p.baseUrl) ||
          !isNonEmptyString(p.model) ||
          !isHttpsUrl(p.keyUrl) ||
          !['ok', 'relay', 'unknown'].includes(p.cors) ||
          !['cny', 'usd', 'both'].includes(p.currency) ||
          !localized(p.highlights) ||
          (p.docsUrl !== undefined && !isHttpsUrl(p.docsUrl)) ||
          (p.note !== undefined && !localized(p.note)),
      );
      add(
        'GUIDE_PROVIDERS 字段完整（name/protocol/baseUrl/model/keyUrl(https)/cors/currency/highlights）',
        bad.length === 0,
        `异常项 ${JSON.stringify(bad.map((p) => p?.id))}`,
      );
      for (const [id, expected] of Object.entries(EXPECTED_GUIDE_PROVIDERS)) {
        const provider = providers.find((p) => p?.id === id);
        if (!provider) {
          add(`GUIDE_PROVIDERS.${id} 存在`, false, `缺少 id=${id}`);
          continue;
        }
        add(`GUIDE_PROVIDERS.${id}.baseUrl/model/keyUrl/protocol 与 §1.1 一致`,
          provider.baseUrl === expected.baseUrl &&
            provider.model === expected.model &&
            provider.keyUrl === expected.keyUrl &&
            provider.protocol === expected.protocol,
          `实际 ${JSON.stringify({ baseUrl: provider.baseUrl, model: provider.model, keyUrl: provider.keyUrl, protocol: provider.protocol })}`);
      }
    }

    const faq = guide.GUIDE_FAQ;
    add('GUIDE_FAQ 为 4~5 条（§3）', Array.isArray(faq) && faq.length >= 4 && faq.length <= 5, `实际 ${Array.isArray(faq) ? faq.length : typeof faq}`);
    if (Array.isArray(faq)) {
      add('GUIDE_FAQ 每项 q/a 双语非空', faq.every((item) => localized(item?.q) && localized(item?.a)), `异常项 ${JSON.stringify(faq.filter((item) => !localized(item?.q) || !localized(item?.a)).length)} 条`);
    }

    if (guide.GUIDE_VERSION !== undefined) {
      add("guide.js GUIDE_VERSION = '1.1.0'（若声明）", guide.GUIDE_VERSION === '1.1.0', `实际 ${JSON.stringify(guide.GUIDE_VERSION)}`);
    }
  }

  // ---- 4. index.html 钩子 + app.js 接入 guide.js（§6）----
  const indexSource = existence.index ? (await readTextSafe(files.index)) || '' : '';
  if (existence.index) {
    for (const id of REQUIRED_INDEX_IDS) {
      add(`index.html 含 #${id}`, new RegExp(`id\\s*=\\s*["']${id}["']`).test(indexSource), `缺少 id="${id}"`);
    }
    add(
      'index.html 的 #modal-guide 提供关闭入口（data-close-modal="guide"）',
      /data-close-modal\s*=\s*["']guide["']/.test(indexSource),
      '未找到 data-close-modal="guide"',
    );
    // ---- v1.1.1 hotfix：layout-boot 必须在 CSS 之前；legacy-notice 用 nomodule ----
    const headSource = indexSource.split(/<\/head>/i)[0] || indexSource;
    const layoutBootTag = /<script[^>]*src=["']assets\/js\/layout-boot\.js["'][^>]*>/i.exec(headSource)?.[0] || '';
    const layoutBootIndex = layoutBootTag ? headSource.indexOf(layoutBootTag) : -1;
    const firstStylesheetIndex = headSource.search(/<link[^>]*rel=["']stylesheet["']/i);
    add(
      'index.html 在 CSS 之前同步加载 layout-boot.js（移动端布局兜底）',
      Boolean(layoutBootTag) && firstStylesheetIndex !== -1 && layoutBootIndex !== -1 && layoutBootIndex < firstStylesheetIndex,
      `layout-boot 位置=${layoutBootIndex}，首个 stylesheet 位置=${firstStylesheetIndex}`,
    );
    const legacyNoticeTag = /<script[^>]*src=["']assets\/js\/legacy-notice\.js["'][^>]*>/i.exec(headSource)?.[0] || '';
    add(
      'index.html 的 legacy-notice.js 带 nomodule（旧浏览器提示）',
      Boolean(legacyNoticeTag) && /nomodule/i.test(legacyNoticeTag),
      legacyNoticeTag ? `实际标签：${legacyNoticeTag}` : '未找到 legacy-notice.js 标签',
    );
    const i18nKeys = new Set();
    for (const match of indexSource.matchAll(/data-i18n(?:-aria|-placeholder|-title)?\s*=\s*["']([^"']+)["']/g)) {
      i18nKeys.add(match[1]);
    }
    if (i18n && i18n.STRINGS?.zh && i18n.STRINGS?.en) {
      const missing = [...i18nKeys].filter((key) => !(key in i18n.STRINGS.zh) || !(key in i18n.STRINGS.en));
      add(
        `index.html 引用的 ${i18nKeys.size} 个 data-i18n key 都存在于 i18n.js`,
        missing.length === 0,
        `缺少 ${JSON.stringify(missing.slice(0, 20))}`,
      );
    } else {
      add('index.html data-i18n key 校验（需要 i18n.js 可导入）', false, 'i18n.js 不可用');
    }
  }
  if (existence.app) {
    const appSource = (await readTextSafe(files.app)) || '';
    add(
      'app.js 已接入 guide.js（import ... from \'./guide.js\'）且使用 GUIDE_ 数据',
      /(?:from|import\s*\()\s*['"]\.\/guide\.js['"]/.test(appSource) && /GUIDE_(?:STEPS|CONCEPTS|PROVIDERS|FAQ)/.test(appSource),
      '未在 app.js 中找到 guide.js 的 import / GUIDE_ 使用',
    );
    add(
      'app.js 绑定教程入口 #btn-open-guide 与 #modal-guide',
      /btn-open-guide/.test(appSource) && /modal-guide/.test(appSource),
      '未在 app.js 中找到 btn-open-guide / modal-guide 处理',
    );
    add(
      'app.js 布局识别已增强并接管 resize/orientationchange（触屏+窄视口 / __APPEALING_APP_READY__）',
      /maxTouchPoints/.test(appSource) &&
        /pointer:\s*coarse/.test(appSource) &&
        /__APPEALING_APP_READY__/.test(appSource) &&
        /orientationchange/.test(appSource),
      '未在 app.js 中找到触屏/窄视口/resize 接管逻辑',
    );
    add(
      'app.js 与 layout-boot 一致使用「9:16 vs 2:1 可用面积 + 1.08 竖屏偏置」算法（v1.1.2）',
      /9\s*\/\s*16/.test(appSource) &&
        /(stageArea|availableArea|usableArea|面积)/.test(appSource) &&
        /1\.08/.test(appSource) &&
        /1\.08\s*\*|\*\s*1\.08/.test(appSource),
      '未在 app.js 中找到 9:16 / 2:1 面积比较或 1.08 偏置关键词',
    );
  }

  // ---- 5. README 双文件互链 + 截图引用 + 无占位符（§5）----
  const readmeZh = existence.readmeZh ? (await readTextSafe(files.readmeZh)) || '' : '';
  const readmeEn = existence.readmeEn ? (await readTextSafe(files.readmeEn)) || '' : '';
  if (existence.readmeZh) {
    const head = readmeZh.split(/\r?\n/).slice(0, 5).join('\n');
    add('README.md 顶部互链到 README.en.md（§5）', /\[English\]\(\.?\/?README\.en\.md\)/.test(head), `前 5 行：${JSON.stringify(head.slice(0, 160))}`);
    add('README.md 含在线游玩链接', /nolai2010\.github\.io\/AppealingWords/i.test(readmeZh));
    add('README.md 含 MIT 说明', /MIT/i.test(readmeZh));
    add('README.md 含 deepseek-flash（模型名已更新）', /deepseek-flash/.test(readmeZh));
    add('README.md 非空壳（≥3000 字符）', readmeZh.length >= 3000, `实际 ${readmeZh.length} 字符`);
  }
  if (existence.readmeEn) {
    const head = readmeEn.split(/\r?\n/).slice(0, 5).join('\n');
    add('README.en.md 顶部互链到 README.md（§5）', /\[中文\]\(\.?\/?README\.md\)/.test(head), `前 5 行：${JSON.stringify(head.slice(0, 160))}`);
    add('README.en.md 含在线游玩链接', /nolai2010\.github\.io\/AppealingWords/i.test(readmeEn));
    add('README.en.md 含 MIT 说明', /MIT/i.test(readmeEn));
    add('README.en.md 含 deepseek-flash（模型名已更新）', /deepseek-flash/.test(readmeEn));
    add('README.en.md 非空壳（≥3000 字符）', readmeEn.length >= 3000, `实际 ${readmeEn.length} 字符`);
  }
  if (existence.readmeZh && existence.readmeEn) {
    const missingImages = README_SCREENSHOTS.filter((shot) => !readmeZh.includes(shot) || !readmeEn.includes(shot));
    add('两份 README 都引用 4 张现有截图（§5）', missingImages.length === 0, `缺少 ${JSON.stringify(missingImages)}`);
    const missingFiles = README_SCREENSHOTS.filter((shot) => !fs.existsSync(path.join(root, shot)));
    add('README 引用的截图文件真实存在', missingFiles.length === 0, `磁盘缺失 ${JSON.stringify(missingFiles)}`);
    const placeholders = /(TODO|FIXME|占位符|待补充|待补写|Lorem ipsum)/i;
    add('两份 README 无 TODO/占位符', !placeholders.test(readmeZh) && !placeholders.test(readmeEn), '发现 TODO/占位符字样');
  }

  // ---- 6. 教程文案面向 C 端（避免技术黑话，§3 要求）----
  if (i18n?.STRINGS?.zh) {
    const zhGuide = Object.entries(i18n.STRINGS.zh)
      .filter(([key]) => key.startsWith('guide.'))
      .map(([, value]) => (typeof value === 'string' ? value : ''))
      .join('\n');
    const jargon = /tokenizer|SDK|endpoint|middleware|OAuth/i;
    add('guide 中文文案不含技术黑话（tokenizer/SDK/endpoint 等，§3）', !jargon.test(zhGuide), `命中 ${JSON.stringify((zhGuide.match(jargon) || [])[0])}`);
  }

  const failures = checks.filter((check) => !check.ok).map((check) => `${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
  return { ok: failures.length === 0, checks, failures };
}

// ---------------------------------------------------------------------------
// 独立运行：node dev/static-checks.mjs
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
  const result = await runStaticChecks({ root: REPO_ROOT });
  const failed = result.checks.filter((check) => !check.ok);
  console.log(`[static] ${result.checks.length} 项检查，PASS ${result.checks.length - failed.length}，FAIL ${failed.length}`);
  for (const check of result.checks) {
    if (!check.ok) console.log(`FAIL ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
  }
  if (result.ok) {
    console.log('ALL STATIC CHECKS PASSED');
    process.exit(0);
  } else {
    console.log(`STATIC CHECKS FAILED: ${failed.length} 项`);
    process.exit(1);
  }
}
