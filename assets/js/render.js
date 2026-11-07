/* ============================================================
 * 无尽文游 / Appealing Words — render.js
 * 1) 解析模型的 <story>/<choices> 协议输出
 * 2) 安全渲染 Markdown（Marked + DOMPurify）
 * 3) KaTeX 渲染 LaTeX
 * 4) 流式过程中的纯文本视图
 * ============================================================ */

import { marked } from '../vendor/marked/marked.esm.js';

const CHOICE_LINE_RE = /^\s*(?:\d{1,2}[.、．)）]|[一二三四五六七八九十][、.．)）]|[-*•])\s+(.+?)\s*$/;
const STORY_TAG_RE = /<\s*story\s*>([\s\S]*?)<\s*\/\s*story\s*>/i;
const CHOICES_TAG_RE = /<\s*choices\s*>([\s\S]*?)<\s*\/\s*choices\s*>/i;
const CHOICES_MARKER_RE = /(?:^|\n)[ \t]*(?:【选项】|选项[:：]|Options?\s*[:：]|Choices?\s*[:：])[ \t]*\n?/i;

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'b', 'i', 'del', 's', 'code', 'pre', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'span', 'sup', 'sub',
];
const ALLOWED_ATTR = ['href', 'title', 'start'];

export function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripStoryTags(text) {
  return String(text || '')
    .replace(/<\s*\/?\s*story\s*>/gi, '')
    .replace(/<\s*\/?\s*choices\s*>/gi, '');
}

/** 从一段文本中解析出选项列表 */
export function parseChoiceBlock(block) {
  const choices = [];
  const seen = new Set();
  for (const rawLine of String(block || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(CHOICE_LINE_RE);
    if (!match) continue;
    let text = match[1]
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .trim();
    if (!text) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    choices.push(text);
    if (choices.length >= 6) break;
  }
  return choices;
}

function findChoicesStart(text) {
  const tag = text.match(/<\s*choices\s*>/i);
  if (tag && tag.index != null) return tag.index;
  const marker = text.match(CHOICES_MARKER_RE);
  if (marker && marker.index != null) return marker.index;
  return -1;
}

/** 解析完整回复 → { story, choices } */
export function parseResponse(raw) {
  const text = String(raw || '').replace(/\r\n/g, '\n').trim();
  let story = '';
  let choices = [];

  const tagMatch = text.match(CHOICES_TAG_RE);
  if (tagMatch) {
    const before = text.slice(0, tagMatch.index);
    const storyTag = before.match(STORY_TAG_RE);
    story = storyTag ? storyTag[1] : stripStoryTags(before);
    choices = parseChoiceBlock(tagMatch[1]);
  } else {
    const marker = text.match(CHOICES_MARKER_RE);
    if (marker) {
      story = stripStoryTags(text.slice(0, marker.index));
      choices = parseChoiceBlock(text.slice(marker.index + marker[0].length));
    }
  }

  if (!choices.length) {
    // 兜底：末尾连续编号行
    const lines = text.split('\n');
    let first = -1;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim();
      if (!line) continue;
      if (CHOICE_LINE_RE.test(line)) first = i;
      else break;
    }
    if (first !== -1) {
      const candidate = parseChoiceBlock(lines.slice(first).join('\n'));
      if (candidate.length >= 2) {
        story = stripStoryTags(lines.slice(0, first).join('\n'));
        choices = candidate;
      }
    }
  }

  if (!story) {
    const noChoices = tagMatch ? text.slice(0, tagMatch.index) : text;
    story = stripStoryTags(noChoices);
    if (!story.trim()) story = stripStoryTags(text);
  }

  return { story: story.trim(), choices: choices.slice(0, 5) };
}

/** 流式过程中：只取 <story> 部分，并裁掉可能尚未传完的标签 */
export function extractStreamStory(raw) {
  let text = String(raw || '').replace(/\r/g, '');
  const cut = findChoicesStart(text);
  if (cut !== -1) text = text.slice(0, cut);
  const storyTag = text.match(STORY_TAG_RE);
  const openTag = text.match(/<\s*story\s*>/i);
  if (openTag && openTag.index != null) {
    const after = text.slice(openTag.index + openTag[0].length);
    const closeTag = after.match(/<\s*\/\s*story\s*>/i);
    text = closeTag ? after.slice(0, closeTag.index) : after;
  }
  text = stripStoryTags(text);
  // 去掉结尾未闭合的标签残片，如 "<ch" / "<choice"
  text = text.replace(/<\s*\/?\s*[a-z]{0,8}$/i, '');
  return text;
}

/** 把 Markdown 粗略降级为纯文本，用于打字机流式展示 */
export function plainifyForTyping(text) {
  return String(text || '')
    .replace(/```[^\n]*\n?/g, '')
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/(^|[^A-Za-z0-9])_([^_\n]+)_([^A-Za-z0-9]|$)/g, '$1$2$3')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '· ')
    .replace(/^\s*---+\s*$/gm, '────────')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '');
}

function safeUrl(url) {
  try {
    const parsed = new URL(url, document.baseURI);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch (err) {
    return '';
  }
}

function decorateLinks(root) {
  root.querySelectorAll('a').forEach((anchor) => {
    const href = anchor.getAttribute('href') || '';
    const safe = safeUrl(href);
    if (!safe) {
      anchor.removeAttribute('href');
      return;
    }
    anchor.setAttribute('href', safe);
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
  });
}

export function renderMath(root) {
  if (!root || typeof window.renderMathInElement !== 'function') return;
  try {
    window.renderMathInElement(root, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
      errorColor: '#a94b4b',
      strict: 'ignore',
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
    });
  } catch (err) {
    console.warn('[render] LaTeX 渲染失败', err);
  }
}

/** Markdown → 安全 HTML 字符串（已消毒） */
function normalizeMathBlocks(source) {
  // 多行 $$...$$ / \[...\] 会被 Markdown 的换行拆成 <br>，KaTeX auto-render 无法跨节点匹配；
  // 先压成单行，渲染后再交给 KaTeX。
  return source
    .replace(/\$\$([\s\S]*?)\$\$/g, (match, body) => `$$${body.replace(/\s*\n\s*/g, ' ').trim()}$$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (match, body) => `\\[${body.replace(/\s*\n\s*/g, ' ').trim()}\\]`);
}

export function markdownToHtml(markdown) {
  const source = normalizeMathBlocks(String(markdown == null ? '' : markdown).replace(/\u0000/g, ''));
  if (!source.trim()) return '';
  let raw;
  try {
    raw = marked.parse(source, { gfm: true, breaks: true, async: false });
  } catch (err) {
    raw = escapeHtml(source).replace(/\n/g, '<br>');
  }
  const purify = typeof window !== 'undefined' ? window.DOMPurify : null;
  if (!purify) return escapeHtml(source).replace(/\n/g, '<br>');
  return purify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'img', 'video', 'audio', 'source'],
  });
}

/** 渲染 Markdown + LaTeX 到容器 */
export function renderRich(container, markdown) {
  if (!container) return;
  container.innerHTML = markdownToHtml(markdown);
  decorateLinks(container);
  renderMath(container);
}

/** 从故事正文生成会话标题 */
export function titleFromStory(story, lang) {
  const plain = plainifyForTyping(story).replace(/\s+/g, ' ').trim();
  const max = lang === 'zh' ? 18 : 30;
  const chars = Array.from(plain);
  if (!chars.length) return '';
  let title = chars.slice(0, max).join('').replace(/^[「『“"'（(【\s、，。]+/, '').trim();
  if (chars.length > max) title += '…';
  return title;
}

export { STORY_TAG_RE, CHOICES_TAG_RE, CHOICES_MARKER_RE };
