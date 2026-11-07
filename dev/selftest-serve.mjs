#!/usr/bin/env node
/**
 * dev/selftest-serve.mjs — 静态服务器自测（临时 root，不依赖 index.html）
 * 用法：node dev/selftest-serve.mjs
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './serve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP = path.join(__dirname, '.edge-profile', `selftest-serve-${process.pid}`);

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
  const same = Object.is(actual, expected);
  ok(same, name, !same ? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` : '');
}
function includes(haystack, needle, name) {
  const text = String(haystack ?? '');
  ok(text.includes(needle), name, `未找到 ${JSON.stringify(needle)}；实际：${JSON.stringify(text.slice(0, 200))}`);
}

await fsp.rm(TMP, { recursive: true, force: true });
await fsp.mkdir(path.join(TMP, 'assets'), { recursive: true });
await fsp.writeFile(path.join(TMP, 'index.html'), '<!doctype html><title>qa</title>');
await fsp.writeFile(path.join(TMP, 'assets', 'app.js'), 'export const ok = true;\n');
await fsp.writeFile(path.join(TMP, 'assets', 'style.css'), '.a{color:red}\n');
await fsp.writeFile(path.join(TMP, 'assets', 'font.woff2'), Buffer.from([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01]));

let site = null;
try {
  site = await startStaticServer({ root: TMP, port: 0 });
  const base = site.url;
  eq(site.port > 0, true, '监听随机端口成功');

  {
    const res = await fetch(`${base}/`);
    eq(res.status, 200, 'GET / 返回 200');
    includes(res.headers.get('content-type'), 'text/html', 'GET / Content-Type 为 html');
    eq(await res.text(), '<!doctype html><title>qa</title>', 'GET / 返回 index.html');
    eq(res.headers.get('cache-control'), 'no-store, no-cache, must-revalidate', '禁用缓存');
  }
  {
    const res = await fetch(`${base}/assets/app.js`);
    eq(res.status, 200, 'GET .js 返回 200');
    includes(res.headers.get('content-type'), 'text/javascript', '.js MIME 正确');
  }
  {
    const res = await fetch(`${base}/assets/style.css`);
    includes(res.headers.get('content-type'), 'text/css', '.css MIME 正确');
  }
  {
    const res = await fetch(`${base}/assets/font.woff2`);
    includes(res.headers.get('content-type'), 'font/woff2', '.woff2 MIME 正确');
  }
  {
    const res = await fetch(`${base}/assets`);
    eq(res.status, 404, '目录无 index.html 时返回 404（query 无副作用）');
  }
  {
    const res = await fetch(`${base}/nope.html`);
    eq(res.status, 404, '缺失文件返回 404');
    includes(await res.text(), '404 Not Found', '404 响应带说明');
  }
  {
    const res = await fetch(`${base}/..%2f..%2fsecret.txt`);
    eq(res.status, 403, '路径穿越返回 403');
  }
  {
    const res = await fetch(`${base}/assets/app.js`, { method: 'POST' });
    eq(res.status, 405, '非 GET/HEAD 方法返回 405');
    eq(res.headers.get('allow'), 'GET, HEAD', '405 带 Allow 头');
  }
  {
    const res = await fetch(`${base}/assets/app.js`, { method: 'HEAD' });
    eq(res.status, 200, 'HEAD 返回 200');
    eq(await res.text(), '', 'HEAD 无响应体');
  }
} catch (err) {
  failures.push(`未捕获异常: ${err?.stack || err}`);
  console.error(err);
} finally {
  await site?.close();
  await fsp.rm(TMP, { recursive: true, force: true });
}

console.log('');
if (failures.length === 0) {
  console.log(`ALL SERVE TESTS PASSED (${passed} assertions)`);
  process.exit(0);
} else {
  console.log(`SERVE TESTS FAILED: ${failures.length} failed / ${passed} passed`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
