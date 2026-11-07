/**
 * 无尽文游 — 布局引导脚本（经典脚本，ES5，必须尽早执行）
 *
 * 目的：在样式生效前先给 <html> 设好 data-device / data-layout，
 * 避免「移动端 + 桌面 UA / 应用内浏览器」被误判成桌面 2:1 舞台而挤成一条。
 * 主应用 app.js 加载后会再次校准并接管 resize；本脚本只做兜底。
 */
(function () {
  var root = document.documentElement;
  var STORAGE_KEY = 'appealingwords.v1';

  function readSettings() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return (parsed && parsed.settings) || {};
    } catch (err) {
      return {};
    }
  }

  function hasTouch() {
    return (navigator.maxTouchPoints || 0) > 0;
  }

  function isCoarse() {
    try {
      if (window.matchMedia) return window.matchMedia('(pointer: coarse)').matches;
    } catch (err) { /* ignore */ }
    return false;
  }

  function detectDevice() {
    var ua = navigator.userAgent || '';
    var mobileUa = /Android|iPhone|iPod|iPad|Windows Phone|Mobile|HarmonyOS|OpenHarmony|MiuiBrowser|HuaweiBrowser|Silk|Kindle|BlackBerry|Opera Mini|IEMobile|ArkWeb/i.test(ua);
    var ipadOs = /Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1;
    var vw = window.innerWidth || 0;
    var sw = (window.screen && window.screen.width) || 0;
    var narrow = (vw > 0 && vw <= 820) || (sw > 0 && sw <= 820);
    var touchOrCoarse = hasTouch() || isCoarse();
    return mobileUa || ipadOs || (touchOrCoarse && narrow) ? 'mobile' : 'desktop';
  }

  function computeLayout(device, settings) {
    if (settings.layout === 'landscape' || settings.layout === 'portrait') {
      return settings.layout;
    }
    if (device === 'mobile') {
      return window.innerHeight >= window.innerWidth ? 'portrait' : 'landscape';
    }
    var vw = window.innerWidth || 0;
    if (vw > 0 && vw < 520 && window.innerHeight > window.innerWidth) return 'portrait';
    return 'landscape';
  }

  function apply() {
    var settings = readSettings();
    var device = detectDevice();
    var layout = computeLayout(device, settings);
    root.setAttribute('data-device', device);
    root.setAttribute('data-layout', layout);
    window.__APPEALING_ENV__ = { device: device, layout: layout, boot: true };
  }

  apply();

  // 主应用尚未接管时（例如模块加载失败 / 旧浏览器），resize 也保持布局正确。
  var timer = 0;
  function onResize() {
    if (window.__APPEALING_APP_READY__) return;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(function () {
      timer = 0;
      if (window.__APPEALING_APP_READY__) return;
      apply();
    }, 120);
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
})();
