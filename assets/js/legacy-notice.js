/* 旧浏览器提示：nomodule 脚本，只在完全不支持 ES module 的浏览器里执行 */
(function () {
  function show() {
    if (!document.body || document.querySelector('.legacy-notice')) return;
    var el = document.createElement('div');
    el.className = 'legacy-notice';
    el.setAttribute('role', 'alert');
    el.textContent = '当前浏览器版本过旧，可能无法运行本作。请升级浏览器后再试。 / Your browser is too old to run this game. Please update it.';
    el.style.cssText =
      'position:fixed;left:8px;right:8px;bottom:8px;z-index:9999;padding:10px 12px;' +
      'background:#1a0f0f;border:1px solid #a94b4b;color:#f0d9d9;' +
      'font:12px/1.7 monospace;text-align:center;';
    document.body.appendChild(el);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show);
  } else {
    show();
  }
})();
