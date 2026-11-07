/* 无尽文游 / Appealing Words — entry */
import { boot } from './app.js';

function start() {
  try {
    boot();
  } catch (err) {
    console.error('[AppealingWords] 启动失败', err);
    const root = document.getElementById('toast-root');
    if (root) {
      const el = document.createElement('div');
      el.className = 'toast toast--error';
      el.textContent = '启动失败，请刷新页面重试 / Failed to start, please reload.';
      root.appendChild(el);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
