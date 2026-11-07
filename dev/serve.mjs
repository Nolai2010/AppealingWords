#!/usr/bin/env node
/**
 * dev/serve.mjs — 本地静态服务器（默认 8788，等价于契约 §1 的 python -m http.server 8788）
 * 供 dev/qa.mjs 在进程内启动；也可独立运行：node dev/serve.mjs
 */

import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 仓库根目录（本文件位于 dev/ 下）。 */
export const REPO_ROOT = path.resolve(__dirname, '..');
export const DEFAULT_PORT = 8788;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function mimeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function sendText(res, status, text) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(text));
  res.setHeader('Cache-Control', 'no-store');
  res.end(text);
}

/**
 * 启动静态服务器。
 * @param {{root?: string, port?: number, host?: string, quiet?: boolean}} [opts]
 * @returns {Promise<{port:number, root:string, url:string, close:()=>Promise<void>}>}
 */
export async function startStaticServer({ root = REPO_ROOT, port = DEFAULT_PORT, host = '127.0.0.1', quiet = true } = {}) {
  const rootDir = path.resolve(root);

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        sendText(res, 405, '405 Method Not Allowed');
        return;
      }

      const url = new URL(req.url || '/', `http://${host}`);
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        sendText(res, 400, '400 Bad Request');
        return;
      }

      // 目录请求补 index.html
      let relative = pathname;
      if (relative.endsWith('/')) relative += 'index.html';

      let filePath = path.resolve(rootDir, `.${relative}`);
      if (filePath !== rootDir && !filePath.startsWith(rootDir + path.sep)) {
        sendText(res, 403, '403 Forbidden');
        return;
      }

      let stat = null;
      try {
        stat = await fsp.stat(filePath);
      } catch {
        stat = null;
      }
      if (stat?.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        try {
          stat = await fsp.stat(filePath);
        } catch {
          stat = null;
        }
      }
      if (!stat?.isFile()) {
        if (!quiet) console.log(`[serve] 404 ${req.method} ${pathname}`);
        sendText(res, 404, `404 Not Found: ${pathname}`);
        return;
      }

      const body = await fsp.readFile(filePath);
      res.statusCode = 200;
      res.setHeader('Content-Type', mimeFor(filePath));
      res.setHeader('Content-Length', body.length);
      // 测试环境禁用缓存，保证刷新即拿到最新文件
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      if (req.method === 'HEAD') res.end();
      else res.end(body);
    } catch (err) {
      if (!res.headersSent) sendText(res, 500, `500 Internal Server Error: ${err?.message || err}`);
      else res.destroy();
    }
  });

  server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  await new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('listening', onListening);
      reject(
        err && err.code === 'EADDRINUSE'
          ? new Error(`静态服务器: 端口 ${port} 已被占用（EADDRINUSE），请先关掉占用 ${port} 的进程`)
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
    root: rootDir,
    url: `http://${host}:${actualPort}`,
    server,
    close() {
      return new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    },
  };
}

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
  const portArg = process.argv.find((a) => a.startsWith('--port='));
  const port = portArg ? Number(portArg.slice('--port='.length)) : DEFAULT_PORT;
  try {
    const site = await startStaticServer({ port, quiet: false });
    console.log(`[serve] serving ${site.root} at ${site.url}/`);
    const shutdown = async () => {
      await site.close();
      await sleep(10);
      process.exit(0);
    };
    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
  } catch (err) {
    console.error(`[serve] 启动失败: ${err?.message || err}`);
    process.exit(1);
  }
}
