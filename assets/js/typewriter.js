/* ============================================================
 * 无尽文游 / Appealing Words — typewriter.js
 * 复古打字机：按字推进、标点停顿、空格/换行加权、可跳过。
 * 只管把纯文本逐字写进一个元素；富文本渲染由调用方在 onDone 里完成。
 * ============================================================ */

const CHAR_RATES = {
  slow: 26,
  normal: 58,
  fast: 120,
  instant: Infinity,
};

const PUNCTUATION = new Set('。！？…—－，、；：,.!?;:'.split(''));
const BREAKS = new Set(['\n', '\r']);

export class Typewriter {
  /**
   * @param {HTMLElement} el 文本容器
   * @param {{speed?: string, onDone?: Function, onUpdate?: Function, onType?: Function}} options
   */
  constructor(el, options = {}) {
    this.el = el;
    this.speed = CHAR_RATES[options.speed] != null ? options.speed : 'normal';
    this.onDone = options.onDone || null;
    this.onUpdate = options.onUpdate || null;
    this.onType = options.onType || null;
    this.reduced = false;
    try {
      this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (err) {
      this.reduced = false;
    }
    this.reset();
    this._frame = this._frame.bind(this);
  }

  reset() {
    this.target = '';
    this.revealed = 0;
    this.ended = false;
    this.active = false;
    this.forcedFast = false;
    this.finished = false;
    this.budget = 0;
    this.lastTime = 0;
    this._lastText = null;
    this._lastRevealed = 0;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.el) this.el.textContent = '';
  }

  setSpeed(speed) {
    if (CHAR_RATES[speed] != null) this.speed = speed;
  }

  get instant() {
    return this.speed === 'instant' || this.reduced || this.forcedFast;
  }

  get isTyping() {
    return this.active || (this.target.length > 0 && !this.finished);
  }

  /** 追加/更新目标文本（流式逐块调用） */
  feed(text) {
    this.target = String(text == null ? '' : text);
    if (this.instant) {
      this.revealed = this.target.length;
      this._paint(true);
      if (this.ended && this.revealed >= this.target.length) this._finish();
      return;
    }
    if (!this.finished && !this.active) this._start();
  }

  /** 流结束：等待已缓冲内容打完再收尾 */
  end() {
    this.ended = true;
    if (this.instant) {
      this.revealed = this.target.length;
      this._paint(true);
      this._finish();
      return;
    }
    if (this.finished) return;
    if (!this.active) {
      if (this.revealed >= this.target.length) this._finish();
      else this._start();
    }
  }

  /** 用户点击「跳过动画」：立即显示全部并把后续流式内容也直接显示 */
  skip() {
    this.forcedFast = true;
    this.revealed = this.target.length;
    this._paint(true);
    if (this.ended) this._finish();
  }

  stop() {
    this.active = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  _start() {
    if (this.active || this.finished) return;
    this.active = true;
    this.lastTime = 0;
    this.raf = requestAnimationFrame(this._frame);
  }

  _frame(now) {
    if (!this.active) return;
    if (!this.lastTime) this.lastTime = now;
    const dt = Math.min(140, Math.max(0, now - this.lastTime));
    this.lastTime = now;

    const rate = CHAR_RATES[this.speed] || CHAR_RATES.normal;
    this.budget += (rate * dt) / 1000;

    while (this.budget >= 1 && this.revealed < this.target.length) {
      const ch = this.target[this.revealed];
      const cost = BREAKS.has(ch) ? 4 : PUNCTUATION.has(ch) ? 2.6 : 1;
      if (this.budget < cost) break;
      this.budget -= cost;
      this.revealed += 1;
    }

    this._paint(false);

    if (this.revealed >= this.target.length) {
      this.active = false;
      if (this.ended) {
        this._finish();
        return;
      }
      return;
    }
    this.raf = requestAnimationFrame(this._frame);
  }

  _paint(force) {
    if (!this.el) return;
    const next = this.target.slice(0, this.revealed);
    if (!force && next === this._lastText) return;
    this.el.textContent = next;
    if (this.onType && this.revealed > this._lastRevealed) {
      this.onType(this.revealed - this._lastRevealed);
    }
    this._lastRevealed = this.revealed;
    this._lastText = next;
    if (this.onUpdate) this.onUpdate(this.revealed, this.target.length);
  }

  _finish() {
    if (this.finished) return;
    this.finished = true;
    this.active = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.onDone) this.onDone();
  }
}

export { CHAR_RATES };
