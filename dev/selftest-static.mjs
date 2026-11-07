#!/usr/bin/env node
/**
 * dev/selftest-static.mjs — dev/static-checks.mjs 的自测（夹具目录，不依赖浏览器与应用当前状态）
 *
 * 做法：在 dev/.edge-profile/ 下生成一个符合 v1.1 契约的临时仓库，跑 runStaticChecks 应为通过；
 * 再分别破坏 PROVIDER_PRESETS / README 互链 / guide.js / 占位符，确认能精确报错。
 *
 * 用法：node dev/selftest-static.mjs
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runStaticChecks,
  EXPECTED_PRESETS,
  EXPECTED_GUIDE_PROVIDERS,
  PROVIDER_ORDER,
  REQUIRED_GUIDE_KEYS,
  REQUIRED_INDEX_IDS,
} from './static-checks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP = path.join(__dirname, '.edge-profile', `selftest-static-${process.pid}`);

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
function contains(haystack, needle, name) {
  const text = String(haystack || '');
  ok(text.includes(needle), name, `未在失败列表中找到 ${JSON.stringify(needle)}；实际：${JSON.stringify(text.slice(0, 600))}`);
}

const LABELS = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  glm: 'GLM',
  qwen: 'Qwen',
  kimi: 'Kimi',
  doubao: 'Doubao',
  openrouter: 'OpenRouter',
  custom: 'Custom',
};

const SCREENSHOT_PATHS = [
  'docs/screenshots/onboarding-landscape.png',
  'docs/screenshots/home-landscape.png',
  'docs/screenshots/game-landscape.png',
  'docs/screenshots/game-portrait.png',
];

function makeReadme({ lang }) {
  const filler = '这是一段用于撑起 README 长度的说明文字，介绍项目、玩法、隐私与部署方式。'.repeat(80);
  const fillerEn = 'This is filler text used to reach the minimum README length for the fixture. '.repeat(80);
  const shots = SCREENSHOT_PATHS.map((shot) => `![shot](${shot})`).join('\n');
  if (lang === 'zh') {
    return `**中文** · [English](README.en.md)\n\n# 无尽文游\n\n没有尽头的互动文字游戏 https://nolai2010.github.io/AppealingWords/ MIT\n\n## 新手先拿 API Key\n\nDeepSeek 的预设模型是 deepseek-flash。\n\n${filler}\n\n${shots}\n`;
  }
  return `**English** · [中文](README.md)\n\n# Appealing Words\n\nAn interactive story that never ends. https://nolai2010.github.io/AppealingWords/ MIT\n\n## Get an API key first\n\nThe DeepSeek preset uses deepseek-flash.\n\n${fillerEn}\n\n${shots}\n`;
}

async function buildFixture() {
  await fsp.rm(TMP, { recursive: true, force: true });
  const assets = path.join(TMP, 'assets', 'js');
  await fsp.mkdir(assets, { recursive: true });
  await fsp.mkdir(path.join(TMP, 'docs', 'screenshots'), { recursive: true });

  // store.js（v1.1.1）
  await fsp.writeFile(path.join(assets, 'store.js'), "export const APP_VERSION = '1.1.1';\n");

  // v1.1.1 hotfix 文件
  await fsp.writeFile(
    path.join(assets, 'layout-boot.js'),
    `(function () {\n  var root = document.documentElement;\n  var STORAGE_KEY = 'appealingwords.v1';\n  function readSettings() { try { return (JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}).settings || {}; } catch (err) { return {}; } }\n  function hasTouch() { return (navigator.maxTouchPoints || 0) > 0; }\n  function isCoarse() { try { return window.matchMedia('(pointer: coarse)').matches; } catch (err) { return false; } }\n  function detect() { var ua = navigator.userAgent || ''; var mobileUa = /Android|iPhone|Mobile/i.test(ua); var narrow = window.innerWidth > 0 && window.innerWidth <= 820; return mobileUa || ((hasTouch() || isCoarse()) && narrow) ? 'mobile' : 'desktop'; }\n  function apply() { var settings = readSettings(); var device = detect(); var layout = settings.layout === 'portrait' || settings.layout === 'landscape' ? settings.layout : device === 'mobile' ? (window.innerHeight >= window.innerWidth ? 'portrait' : 'landscape') : 'landscape'; root.setAttribute('data-device', device); root.setAttribute('data-layout', layout); window.__APPEALING_ENV__ = { device: device, layout: layout, boot: true }; }\n  apply();\n  window.addEventListener('resize', apply);\n})();\n`,
  );
  await fsp.writeFile(
    path.join(assets, 'legacy-notice.js'),
    "(function () { document.documentElement.setAttribute('data-legacy', '1'); })();\n",
  );

  // i18n.js
  const presets = PROVIDER_ORDER.map((id) => {
    const expected = EXPECTED_PRESETS[id];
    return {
      id,
      label: LABELS[id],
      protocol: expected.protocol || 'openai',
      baseUrl: expected.baseUrl,
      model: expected.model,
    };
  });
  const zh = {};
  const en = {};
  for (const key of REQUIRED_GUIDE_KEYS) {
    zh[key] = '这是中文文案。';
    en[key] = 'This is English copy.';
  }
  zh['meta.title'] = '无尽文游';
  en['meta.title'] = 'Appealing Words';
  zh['fixture.count'] = '{n} 次';
  en['fixture.count'] = '{n} times';
  await fsp.writeFile(
    path.join(assets, 'i18n.js'),
    `export const PROVIDER_PRESETS = ${JSON.stringify(presets, null, 2)};\n` +
      `export const STRINGS = ${JSON.stringify({ zh, en }, null, 2)};\n`,
  );

  // guide.js
  const steps = [
    { id: 'signup', title: { zh: '注册并充值', en: 'Sign up and top up' }, body: { zh: '去服务商官网注册账号，先充少量额度。', en: 'Create an account on the provider site and add a little credit.' }, tip: { zh: '国内推荐 DeepSeek。', en: 'Start with DeepSeek in China.' } },
    { id: 'apikey', title: { zh: '创建并复制 Key', en: 'Create and copy a key' }, body: { zh: '在控制台创建 API Key 并复制那串字符。', en: 'Create an API key in the console and copy the string.' } },
    { id: 'fill', title: { zh: '回填并测试', en: 'Paste and test' }, body: { zh: '把 Key 粘贴回本页，点测试连接再保存。', en: 'Paste the key here, test the connection, and save.' } },
  ];
  const concepts = [
    { id: 'baseUrl', term: { zh: 'Base URL（接口地址）', en: 'Base URL' }, desc: { zh: '就像收件地址，告诉应用把请求发到哪里去。', en: 'Think of it as the mailing address where requests are sent.' }, example: 'https://api.deepseek.com' },
    { id: 'apiKey', term: { zh: 'API Key', en: 'API Key' }, desc: { zh: '就像服务商发给你的密码，只给自己用。', en: 'A password from the provider that only you should use.' } },
    { id: 'model', term: { zh: '模型名', en: 'Model name' }, desc: { zh: '就像你要雇的那位写手，名字不同水平不同。', en: 'The writer you are hiring; different names, different styles.' } },
  ];
  const providers = Object.entries(EXPECTED_GUIDE_PROVIDERS).map(([id, expected]) => ({
    id,
    name: LABELS[id],
    protocol: expected.protocol,
    baseUrl: expected.baseUrl,
    model: expected.model,
    keyUrl: expected.keyUrl,
    docsUrl: 'https://example.com/docs',
    recommended: id === 'deepseek',
    cors: 'ok',
    currency: 'cny',
    highlights: { zh: '便宜、快，浏览器可直接连接。', en: 'Cheap, fast, and works right in the browser.' },
    note: { zh: '模型名以服务商文档为准。', en: 'Model names follow the provider docs.' },
  }));
  const faq = [
    { q: { zh: '要花多少钱？', en: 'How much does it cost?' }, a: { zh: '按服务商用量计费，一局几分钱到几角钱。', en: 'Billed by the provider; a session costs a few cents.' } },
    { q: { zh: '连不上怎么办？', en: 'What if it will not connect?' }, a: { zh: '换可直连的服务商，或检查网络与地址。', en: 'Try a browser-friendly provider or check the endpoint.' } },
    { q: { zh: 'Key 安全吗？', en: 'Is my key safe?' }, a: { zh: '只存在本机浏览器，不会上传。', en: 'It stays in your browser and is never uploaded.' } },
    { q: { zh: '以后怎么换模型？', en: 'How do I switch models later?' }, a: { zh: '在设置里改模型名再保存即可。', en: 'Change the model name in Settings and save.' } },
  ];
  await fsp.writeFile(
    path.join(assets, 'guide.js'),
    `export const GUIDE_STEPS = ${JSON.stringify(steps, null, 2)};\n` +
      `export const GUIDE_CONCEPTS = ${JSON.stringify(concepts, null, 2)};\n` +
      `export const GUIDE_PROVIDERS = ${JSON.stringify(providers, null, 2)};\n` +
      `export const GUIDE_FAQ = ${JSON.stringify(faq, null, 2)};\n` +
      `export const GUIDE_VERSION = '1.1.0';\n`,
  );

  // app.js
  await fsp.writeFile(
    path.join(assets, 'app.js'),
    `import { GUIDE_STEPS, GUIDE_CONCEPTS, GUIDE_PROVIDERS, GUIDE_FAQ } from './guide.js';\n` +
      `export function boot() {\n` +
      `  const guideSteps = GUIDE_STEPS;\n` +
      `  const hasTouch = (navigator.maxTouchPoints || 0) > 0;\n` +
      `  const coarse = window.matchMedia('(pointer: coarse)').matches;\n` +
      `  window.__APPEALING_APP_READY__ = true;\n` +
      `  window.addEventListener('orientationchange', function () { return [hasTouch, coarse]; });\n` +
      `  document.querySelector('#btn-open-guide')?.addEventListener('click', () => { document.querySelector('#modal-guide').hidden = false; });\n` +
      `  return [guideSteps, GUIDE_CONCEPTS, GUIDE_PROVIDERS, GUIDE_FAQ];\n` +
      `}\n`,
  );

  // index.html（v1.1.1：layout-boot 在 CSS 之前；legacy-notice nomodule）
  const ids = REQUIRED_INDEX_IDS.map((id) => `<div id="${id}"></div>`).join('\n');
  await fsp.writeFile(
    path.join(TMP, 'index.html'),
    `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>qa fixture</title>\n` +
      `<script src="assets/js/layout-boot.js"></script>\n` +
      `<script nomodule src="assets/js/legacy-notice.js"></script>\n` +
      `<link rel="stylesheet" href="assets/css/style.css">\n` +
      `</head>\n<body>\n` +
      `${ids}\n` +
      `<button type="button" data-close-modal="guide">x</button>\n` +
      `<span data-i18n="meta.title"></span>\n<span data-i18n="guide.title"></span>\n` +
      `</body>\n</html>\n`,
  );

  // README 双文件 + 截图占位文件
  await fsp.writeFile(path.join(TMP, 'README.md'), makeReadme({ lang: 'zh' }));
  await fsp.writeFile(path.join(TMP, 'README.en.md'), makeReadme({ lang: 'en' }));
  for (const shot of SCREENSHOT_PATHS) {
    await fsp.writeFile(path.join(TMP, shot), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]));
  }
  return TMP;
}

try {
  // ---- 基线：合规夹具应全部通过 ----
  await buildFixture();
  const baseline = await runStaticChecks({ root: TMP });
  ok(baseline.ok, '合规夹具：静态检查全部 PASS', JSON.stringify(baseline.failures.slice(0, 8)));
  ok(baseline.checks.length >= 60, `合规夹具：检查项数量合理（实际 ${baseline.checks.length}）`);

  // ---- 场景 1：PROVIDER_PRESETS.deepseek.model 未更新 ----
  {
    const i18nPath = path.join(TMP, 'assets', 'js', 'i18n.js');
    const source = await fsp.readFile(i18nPath, 'utf8');
    await fsp.writeFile(i18nPath, source.replace('"deepseek-flash"', '"deepseek-chat"'));
    const result = await runStaticChecks({ root: TMP });
    ok(!result.ok, '破坏 deepseek model：静态检查应失败');
    contains(result.failures.join('\n'), 'PROVIDER_PRESETS.deepseek.model', '破坏 deepseek model：定位到具体项');
    await buildFixture();
  }

  // ---- 场景 2：README.en.md 顶部互链缺失 ----
  {
    const readmeEn = path.join(TMP, 'README.en.md');
    const source = await fsp.readFile(readmeEn, 'utf8');
    await fsp.writeFile(readmeEn, source.replace('[中文](README.md)', '中文'));
    const result = await runStaticChecks({ root: TMP });
    ok(!result.ok, '破坏 README.en.md 互链：静态检查应失败');
    contains(result.failures.join('\n'), 'README.en.md 顶部互链到 README.md', '破坏 README 互链：定位到具体项');
    await buildFixture();
  }

  // ---- 场景 3：guide.js 缺失 ----
  {
    await fsp.rm(path.join(TMP, 'assets', 'js', 'guide.js'));
    const result = await runStaticChecks({ root: TMP });
    ok(!result.ok, '缺少 guide.js：静态检查应失败');
    contains(result.failures.join('\n'), '文件存在：assets/js/guide.js', '缺少 guide.js：定位到具体项');
    await buildFixture();
  }

  // ---- 场景 4：i18n 占位符 zh/en 不一致 ----
  {
    const i18nPath = path.join(TMP, 'assets', 'js', 'i18n.js');
    const source = await fsp.readFile(i18nPath, 'utf8');
    await fsp.writeFile(i18nPath, source.replace('"{n} times"', '"{m} times"'));
    const result = await runStaticChecks({ root: TMP });
    ok(!result.ok, '破坏占位符一致性：静态检查应失败');
    contains(result.failures.join('\n'), 'i18n 占位符', '破坏占位符：定位到具体项');
    await buildFixture();
  }

  // ---- 场景 5：README 引用不存在的截图 ----
  {
    await fsp.rm(path.join(TMP, 'docs', 'screenshots', 'game-portrait.png'));
    const result = await runStaticChecks({ root: TMP });
    ok(!result.ok, '缺少截图文件：静态检查应失败');
    contains(result.failures.join('\n'), 'README 引用的截图文件真实存在', '缺少截图：定位到具体项');
    await buildFixture();
  }

  // ---- 场景 6：APP_VERSION 未升到 1.1.1 ----
  {
    const storePath = path.join(TMP, 'assets', 'js', 'store.js');
    await fsp.writeFile(storePath, "export const APP_VERSION = '1.1.0';\n");
    const result = await runStaticChecks({ root: TMP });
    ok(!result.ok, '破坏 APP_VERSION：静态检查应失败');
    contains(result.failures.join('\n'), "APP_VERSION = '1.1.1'", '破坏 APP_VERSION：定位到具体项');
    await buildFixture();
  }

  // ---- 场景 7：layout-boot.js 缺失 ----
  {
    await fsp.rm(path.join(TMP, 'assets', 'js', 'layout-boot.js'));
    const result = await runStaticChecks({ root: TMP });
    ok(!result.ok, '缺少 layout-boot.js：静态检查应失败');
    contains(result.failures.join('\n'), '文件存在：assets/js/layout-boot.js', '缺少 layout-boot：定位到具体项');
    await buildFixture();
  }

  // ---- 场景 8：恢复后再次全通过（确认夹具状态可重复）----
  {
    const result = await runStaticChecks({ root: TMP });
    ok(result.ok, '恢复夹具：静态检查再次全部 PASS', JSON.stringify(result.failures.slice(0, 8)));
  }
} catch (err) {
  failures.push(`未捕获异常: ${err?.stack || err}`);
  console.error(`\n[selftest-static] 未捕获异常: ${err?.stack || err}`);
} finally {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fsp.rm(TMP, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

console.log('');
if (failures.length === 0) {
  console.log(`ALL STATIC-CHECK TESTS PASSED (${passed} assertions)`);
  process.exit(0);
} else {
  console.log(`STATIC-CHECK TESTS FAILED: ${failures.length} failed / ${passed} passed`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
