# 无尽文游 · 开发契约（内部文档，勿删）

本文件是团队协作的单一事实来源。各成员动手前先完整读一遍；你负责的文件只写自己的写作用域，**不要改别人作用域内的文件**。

## 0. 项目事实

- 仓库根目录：`D:\DeepSeek-Agent\Workfile\AppealingWords`（下文路径都相对它）
- 站点：纯静态，无构建步骤，直接部署 GitHub Pages（仓库根目录 + `.nojekyll`）
- 公开仓库：`Nolai2010/AppealingWords`，MIT，中文名「无尽文游」，英文名 `Appealing Words`
- 口号（中文）：没有尽头的互动文字游戏
- Slogan (EN): An interactive story that never ends.
- 目标用户：打开仓库/网址、什么都不知道的普通玩家；README 主要讲玩法，不讲实现
- 界面语言：中文 / English，右上角切换；AI 续写语言跟随当前界面语言
- 视觉：古朴典雅、近黑背景 + 墨绿/青玉 + 暗金、像素字体、流式输出、复古打字机
- 布局：桌面端 2:1 横屏舞台；手机端 9:16 竖屏；通过 User-Agent 判断设备
- 所有玩家数据（API Key、会话、设置）只保存在浏览器 `localStorage`，无后端

## 1. 环境须知（重要）

- Windows + **PowerShell 5.1**（不是 pwsh 7）：生成中文文件一律用 `write` 工具；shell 里生成 UTF-8 文件要用 .NET（`[System.IO.File]::WriteAllText(path, text, New-Object System.Text.UTF8Encoding($false))`），否则带 BOM。
- Node v24（`node`）、npm 11（registry 已指向 npmmirror）。npm 必须带本地缓存参数：`npm --cache "$env:WORKSPACE\dl\npm-cache" ...`，否则 EPERM。
- GitHub CLI 已登录账号 `Nolai2010`，`gh` 命令可正常访问网络；git push 必须用：
  `git -c http.sslBackend=openssl -c http.sslVerify=false ...`
- 普通 HTTPS 工具（curl/git 默认/git schannel）在本机沙箱里可能失败；不要在这上面浪费时间，用 `gh` 或 node 的 `fetch`（node 访问 npmmirror 可用）。
- 本地静态服务器：`python -m http.server 8788 --bind 127.0.0.1`，工作目录设为仓库根目录，用后台任务运行。
- 无头浏览器截图需要**完全权限**（danger-full-access）的 pwsh 命令，命令模板：
  `msedge.exe --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --no-first-run --no-default-browser-check --user-data-dir="<仓库外临时目录>" --virtual-time-budget=4000 --screenshot="<png>" --window-size=1440,720 "http://127.0.0.1:8788/"`
  在普通沙箱里 Edge 会崩溃（0x80000003），这是环境限制，不是页面问题。
- 不要提交 `dl/`、`probe/`、`node_modules/`、`dev/.edge-profile/`、`*.log`。仓库根目录之外的东西不要动。

## 2. 文件所有权（写作用域）

| 负责人 | 文件 |
|---|---|
| lead | `index.html`、`assets/js/app.js`、`assets/js/api.js`、`assets/js/store.js`、`assets/js/render.js`、`assets/js/typewriter.js`、`assets/js/main.js`、`assets/vendor/**`、`assets/fonts/**`、`README.md`、`LICENSE`、`.nojekyll`、`.gitignore`、`dev/contracts.md` |
| lore-scribe | `assets/js/prompt.js` |
| lexicon | `assets/js/i18n.js` |
| ui-artisan | `assets/css/style.css` |
| qa-harness | `dev/**`（除本文件；可新增 `dev/*.mjs`、`dev/*.ps1`）、`docs/screenshots/**` |

README 由 lead 在最后写；qa-harness 只需保证截图文件名固定（见 §7）。

## 3. 游戏输出协议（前端解析用的硬约定）

发给模型的 System Prompt 必须要求模型**只输出**以下两块，顺序固定，不得有其它内容：

```
<story>
（本回合的故事正文，Markdown，可含 LaTeX；中文建议 200~450 字，英文 90~180 词）
</story>
<choices>
1. 选项一
2. 选项二
3. 选项三
4. 选项四
</choices>
```

- `<story>` 内不要出现 `<choices>`、不要用代码块包裹整段。
- `<choices>` 内用 `1.` `2.` `3.` 编号，3~4 个，每条中文 ≤ 40 字 / 英文 ≤ 18 词；选项之间必须互斥、可执行、有后果差异。
- 模型偶尔跑偏时前端有兜底（取全文作故事 + 3 个保底选项），但 prompt 必须尽全力保证格式。
- 玩家每回合的消息是「选项原文」或玩家自由输入的 action 文本；模型据此续写。
- 历史消息以 assistant 原文（含标签）保存并回传，保证格式连续。

## 4. `assets/js/prompt.js` 契约（lore-scribe）

ES module，严格导出以下符号：

```js
export const MODES = [
  {
    id: 'rules',        // 固定 id：rules / duel / court / jianghu
    sigil: '规',         // 单个汉字，卡片徽记
    accent: '#63e6b0',  // 该模式强调色（16 进制字符串，供 CSS 变量使用）
    names:  { zh: '规则怪谈', en: 'Rulebound Horror' },
    blurbs: { zh: '8~16 字', en: '6~12 words' },
    systemPrompts: { zh: '……', en: '……' }   // 该模式的完整人设+世界观+叙事要求（不含输出协议）
  },
  // duel = 警匪智斗；court = 宫闱疑云；jianghu = 江湖夜雨
];

export const PROTOCOL_RULES = { zh: '……', en: '……' };   // §3 输出格式的详细说明（给模型看）
export const UNIVERSAL_RULES = { zh: '……', en: '……' };  // 通用 GM 规则（不出戏/不代玩家行动/连续性/节奏/安全边界）
export const OPENING_MESSAGE = { zh: '……', en: '……' };  // 新局第一条 user 消息（约 15~40 字，例如「开始吧。请直接给出开场情景与抉择。」）
export const FALLBACK_CHOICES = {
  zh: ['继续探索', '环顾四周', '静观其变'],
  en: ['Press on', 'Look around', 'Wait and watch'],
};
export function buildSystemPrompt(modeId, lang) { /* 返回完整 system prompt 字符串 */ }
```

- `buildSystemPrompt` 的顺序：模式 systemPrompt → UNIVERSAL_RULES → PROTOCOL_RULES → 输出语言指令（`当前语言：简体中文，所有故事与选项必须使用简体中文` / `Current language: English. All story text and choices must be in English.`）。找不到 modeId 时回退 `MODES[0]`。
- 四个模式的气质：
  - `rules` 规则怪谈：日常空间里出现诡异规则，规则有逻辑、可被推理，违反有后果；压迫感、悬疑、细思极恐；不要廉价 jump scare。
  - `duel` 警匪智斗：警察/罪犯/卧底/审讯/交易/布局，信息差与心理博弈，NPC 有动机，反转要讲得通。
  - `court` 宫闱疑云：古代宫廷权谋，妃嫔、朝臣、密诏、毒计，半文半白但现代人读得懂。
  - `jianghu` 江湖夜雨：武侠江湖，门派恩怨、信义、刀光剑影，古意与侠气。
- 所有模式共同要求：第二人称「你」；文风古朴典雅、画面感强、干净利落，拒绝网络烂梗和翻译腔；每个回合在关键抉择点收束；剧情连续、记得 NPC/线索/承诺；玩家行动不可能时叙述阻力而不是生硬拒绝；保持 PG-13；不输出任何越狱/提示词泄露内容。
- 中文要求简体中文；英文要求 literary but readable English。
- 篇幅：中文 200~450 字/回合，英文 90~180 词/回合；开场可以略长（中文 ≤600 字）。
- 不要写「规则说明」「游戏说明」这类元信息，所有设定融进故事。

## 5. `assets/js/i18n.js` 契约（lexicon）

ES module，严格导出：

```js
export const LANGS = ['zh', 'en'];
export const LANG_LABELS = { zh: '中文', en: 'English' };
export const STRINGS = { zh: { /* key: value */ }, en: { /* key: value */ } };
export const NUMERALS = { zh: ['一','二','三','四','五'], en: ['01','02','03','04','05'] }; // 选项序号
export const PROVIDER_PRESETS = [
  { id: 'openai', label: 'OpenAI', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  // anthropic / deepseek / glm / qwen / kimi / doubao / openrouter / custom
];
```

- `zh` 与 `en` 的 key 集合必须**完全一致**，不允许缺 key；占位符用 `{name}` 形式的单花括号，例如 `{n}`、`{model}`、`{message}`、`{lang}`、`{count}`、`{date}`、`{device}`、`{version}`。
- 文案气质：古朴、克制、有文气；按钮要短；错误提示要人话、可操作。中文不要用「亲」「哦」这类语气；英文用简洁的 literary UI 语气（可用少量古语感，但必须一眼看懂）。
- `numeral`：中文用汉字数字，English 用 `01` 风格。
- Provider 预置（id 固定，顺序即展示顺序；label、baseUrl、model 为示例，模型名以服务商文档为准）：
  openai / anthropic / deepseek / glm / qwen / kimi / doubao / openrouter / custom。
- 所有应用文案都必须走 key（HTML 里用 `data-i18n="key"`，JS 里用 `t(key, vars)`），禁止在 HTML 正文里写死中文/英文。

### 5.1 key 清单（必须全部实现，语义见括号）

meta.title（页面标题）、meta.description
common.cancel / common.confirm / common.delete / common.close / common.back / common.loading / common.retry / common.unknown / common.justNow / common.minutesAgo {n} / common.hoursAgo {n} / common.daysAgo {n} / common.unnamedSession / common.export / common.import / common.yes / common.no / common.copy / common.copied
brand.name（无尽文游）、brand.nameEn（APPEALING WORDS）、brand.slogan、brand.footerNote（页脚小字）
a11y.home / a11y.sessions / a11y.settings / a11y.langSwitch / a11y.skipTyping / a11y.send / a11y.closeModal / a11y.skipToContent
onboarding.kicker / .title / .desc / .protocolLabel / .protocolOpenai / .protocolAnthropic / .presetsLabel / .providerNote / .baseUrlLabel / .baseUrlPlaceholderOpenai / .baseUrlPlaceholderAnthropic / .baseUrlHint / .apiKeyLabel / .apiKeyHint / .modelLabel / .modelHint / .modelPlaceholder / .advancedSummary / .temperatureLabel / .temperatureHint / .maxTokensLabel / .maxTokensHint / .extraHeadersLabel / .extraHeadersHint / .extraHeadersPlaceholder / .testButton / .testingButton / .testSuccess / .testFailed / .saveButton / .saveButtonBusy / .privacyNote / .savedToast（→「配置已保存」）
home.kicker / .modesLabel / .modesHint / .recentLabel / .recentEmpty / .resumeButton / .apiConfigured {model} / .apiMissing / .configureButton / .sessionMeta（模板：`{mode} · {turns} 回合 · {date}` / 英文对应）/ .deleteSession / .sessionDeleteConfirm / .playMode / .footerNote / .newSessionButton
game.turnLabel {n} / .streaming / .thinking / .choicesTitle / .freePlaceholder / .freeSend / .skip / .retry / .errorTitle / .errorCors / .errorAuth / .errorRate / .errorGeneric {message} / .errorEmpty / .playerChoiceLabel / .languageSwitched {lang} / .savedToast / .contextInfo {n} / .quitConfirm / .newSessionButton / .fallbackBranch / .connecting
sessions.title / .count {count} / .empty / .continue / .delete / .deleteConfirm / .close / .deletedToast / .corruptToast
settings.title / .tabApi / .tabAppearance / .tabData / .tabAbout / .apiSectionTitle / .apiSectionHint / .saveButton / .savedToast / .testButton / .testingButton / .testSuccess / .testFailed / .layoutLabel / .layoutAuto / .layoutLandscape / .layoutPortrait / .speedLabel / .speedSlow / .speedNormal / .speedFast / .speedInstant / .soundLabel / .soundOn / .soundOff / .dataSectionTitle / .dataHint / .exportButton / .importButton / .clearButton / .clearConfirm / .clearedToast / .exportedToast / .importedToast / .importFailedToast / .aboutTitle / .aboutDesc / .aboutRepo / .aboutIssues / .aboutStack / .aboutPrivacy / .aboutDevice {device} / .deviceMobile / .deviceDesktop / .version {version} / .closeButton
confirm.title（默认确认框标题）、confirm.ok、confirm.cancel
status.ready / status.streaming / status.error / status.saved / status.provider {model} / status.context {n}
toast.langSwitched {lang} / toast.configSaved / toast.sessionSaved
api.testMessage（测试连接时发给模型的短指令，例如「请只回复两个字：可用」）、api.testExpected? 不需要

（`{...}` 内是占位符；没有占位符的 key 不要编造变量。）

## 6. 本地存储 schema（store.js 实现，qa-harness 断言）

`localStorage` key：`appealingwords.v1`

```json
{
  "version": 1,
  "config": {
    "protocol": "openai",
    "baseUrl": "http://127.0.0.1:8787/openai/v1",
    "apiKey": "...",
    "model": "...",
    "temperature": 0.85,
    "maxTokens": 2048,
    "extraHeaders": ""
  },
  "settings": { "lang": "zh", "layout": "auto", "speed": "normal", "sound": false },
  "activeSessionId": "s_xxx",
  "sessions": [
    {
      "id": "s_xxx",
      "modeId": "rules",
      "lang": "zh",
      "title": "（自动取首段故事前 18 字）",
      "createdAt": 1760000000000,
      "updatedAt": 1760000000000,
      "turns": 0,
      "messages": [ { "role": "user", "content": "..." }, { "role": "assistant", "content": "<story>...</story><choices>...</choices>" } ]
    }
  ]
}
```

- `config.protocol` 只用 `openai` / `anthropic`；`settings.layout` 只用 `auto` / `landscape` / `portrait`；`speed` 只用 `slow` / `normal` / `fast` / `instant`。
- 会话按 `updatedAt` 倒序展示；最多保留 40 个会话、每会话最多 200 条消息（超出丢最早）。
- 网络请求期间不写半成品 assistant 消息；只有完整回合才落盘（错误时保留玩家已选的那条 user 消息，重试复用）。

## 7. QA / 截图契约（qa-harness）

产出文件：

- `dev/mock-api-server.mjs`：Node 原生 `http`，端口 `8787`。必须支持：
  - CORS：所有响应带 `Access-Control-Allow-Origin: *`、`Access-Control-Allow-Headers: *`、`Access-Control-Allow-Methods: POST, OPTIONS`；OPTIONS 返回 204。
  - `POST /openai/v1/chat/completions`：`stream:true` 返回 OpenAI SSE（`data: {"choices":[{"delta":{"content":"..."}}]}`，结束 `data: [DONE]`）；`stream:false` 返回 `{"choices":[{"message":{"content":"..."}}]}`。
  - `POST /anthropic/v1/messages`：`stream:true` 返回 Anthropic SSE（`message_start` / `content_block_start` / 多条 `content_block_delta`（`delta.type=text_delta`）/ `content_block_stop` / `message_delta` / `message_stop`）；`stream:false` 返回 `{"content":[{"type":"text","text":"..."}]}`。
  - 特殊路径：`/badopenai/v1/chat/completions`（无 choices 标签、含 Markdown 与 LaTeX 的正文，用于兜底与渲染测试）；`/error401openai/...`（401 JSON）；`/slowopenai/v1/chat/completions`（每 chunk 200ms，用于测试跳过动画与流式）；`/emptyopenai/...`（返回空内容）。
  - `GET /logs`：返回最近 50 条请求记录（path、headers、body、time），供断言 system prompt、模型名、协议头；`POST /reset` 清空。
  - 回合数：按请求 `messages` 里 assistant 消息数量 +1 生成不同正文，且正文里带回合序号；中文请求返回中文内容，否则英文。首个回合的正文包含 `**加粗**`、`` `行内代码` ``、`> 引用`、`$x^2+y^2=1$`、`$$\\sum_{i=1}^n i$$` 以覆盖 Markdown/LaTeX 渲染测试。
- `dev/cdp.mjs`：极简 CDP 客户端（Node 24 自带全局 WebSocket），支持启动/连接 Edge、开标签页、导航、`Runtime.evaluate`、`Page.captureScreenshot`、`Emulation.setDeviceMetricsOverride`、`Network.setUserAgentOverride`、等待条件函数。
- `dev/qa.mjs`：一键端到端检查（见 §8 验收项），失败时打印 `FAIL <步骤> <原因>` 并以非 0 退出，全过打印 `ALL TESTS PASSED`。截图输出到：
  - `docs/screenshots/onboarding-landscape.png`（1440×720）
  - `docs/screenshots/home-landscape.png`（1440×720）
  - `docs/screenshots/game-landscape.png`（1440×720，含 Markdown/LaTeX 渲染与选项）
  - `docs/screenshots/game-portrait.png`（390×844，模拟 iPhone UA）
- `dev/serve.mjs`（可选）：本地静态服务器封装（默认 8788）。

运行方式（需要完全权限的 pwsh 命令执行浏览器部分）：
`node dev/qa.mjs`（脚本内部自行启动 mock server、静态服务器、Edge，结束后全部清理）

应用端需要配合的测试钩子（lead 实现，qa 直接用）：

- `localStorage` 键 `appealingwords.v1` 可直接写入配置与设置（含 `speed:"instant"` 加速测试）。
- 设备判断结果写在 `document.documentElement.dataset.device`（`desktop`/`mobile`）和 `dataset.layout`（`landscape`/`portrait`）。
- 主要元素 id：`#view-onboarding`、`#view-home`、`#view-game`、`#onboarding-form`、`#input-base-url`、`#input-api-key`、`#input-model`、`#btn-test-connection`、`#btn-save-config`、`#onboarding-status`、`#preset-chips`、`#protocol-switch`、`#mode-grid`、`#recent-list`、`#story-log`、`#choices-list`、`#btn-skip-typing`、`#btn-retry-turn`、`#input-free-action`、`#btn-send-action`、`#btn-settings`、`#btn-sessions`、`#btn-home`、`#lang-switch`、`#modal-settings`、`#modal-sessions`、`#modal-confirm`、`#toast-root`、`#live-region`。
- 关键 CSS class：`.view`（隐藏用 `[hidden]`）、`.story-turn`、`.story-turn--player`、`.choice-btn`、`.mode-card`、`.typing-cursor`。

## 8. 端到端验收项（qa-harness 必须全部覆盖）

1. 首次访问（清空 localStorage）：`#view-onboarding` 可见，`#view-home` / `#view-game` 隐藏；协议默认 openai；预置服务商 chips 渲染。
2. 配置 OpenAI 协议指向 mock 服务，点「测试连接」成功；保存后进入 `#view-home`，配置写入 localStorage。
3. 点一个模式卡 → `#view-game`；mock 流式返回开场；打字动画结束后 `#choices-list` 出现 3~4 个 `.choice-btn`；`#story-log` 里有 `.story-turn`。
4. 点选项 → 第二回合；服务端收到 `messages` 长度正确的历史，且 system prompt 含输出协议 `<story>` 与模式设定；localStorage 会话 `messages` 长度 = 4、`turns` = 2。
5. 「跳过打字」按钮在流式/打字中可用，点击后立即完整显示。
6. Markdown/LaTeX：mock 第一回合正文含加粗、行内代码、引用、`$x^2+y^2=1$`、`$$...$$`；断言 `.story-turn strong`、`.story-turn code`、`.story-turn blockquote`、`.story-turn .katex` 存在。
7. 语言切换：右上角切到 English，界面文案变英文（断言一个已知 key 文案），后续请求 system prompt 含 `English`。
8. 刷新页面：配置与会话仍在；主页出现最近会话；继续后可看到历史回合。
9. Anthropic 协议：切换配置后开新局，断言 mock 收到 `x-api-key`、`anthropic-version: 2023-06-01`、`anthropic-dangerous-direct-browser-access: true` 头，且流式正确解析出正文与选项。
10. 错误兜底：401 → 出现错误提示与重试按钮；`/badopenai` → 正常显示正文 + 3 个保底选项，不崩溃。
11. 设备布局：桌面 1440×720 下 `#app`/`.app-frame` 宽高比 ≈ 2:1（±0.03）；模拟 iPhone UA + 390×844 下为 9:16（±0.03）且 `dataset.device === 'mobile'`。
12. 字体：`document.fonts.check('24px "Fusion Pixel"') === true`，`.story-turn` 计算字体包含 `Fusion Pixel`。
13. 会话管理：主页/档案里删除一个会话后 localStorage 与 UI 同步；导出数据触发下载（可只断言函数被调用或生成 blob URL，不弹真下载可跳过）。
14. 无 console error（除 mock 故意错误请求导致的网络错误外，记录过滤后断言为空）。

## 9. 视觉方向（ui-artisan 必读，细节以 index.html 结构为准）

- 近黑青绿：底色 `#040807` / 面板 `#0a1210`；墨玉绿 `#2fbf8f`、亮青 `#8ff0c8`；暗金 `#c9a86a`；警示暗红 `#a94b4b`；文字米白 `#d9e6dc`，次要文字 `#7d968a`。
- 像素风：Fusion Pixel 12px 字体（`assets/fonts/fusion-pixel-12-latin.woff2` + `fusion-pixel-12-zh_hans.woff2`，@font-face 名称 `"Fusion Pixel"`），字号只用 12 的整数倍（12/24/36/48/60），UI 小字 12，正文 24，标题 36/48。
- 氛围：扫描线（scanlines）、轻微噪点/暗角、边框双线 + 四角描角（纯 CSS，不用图片）、墨绿微光、金色细线；不要花哨渐变大面积发光。
- 交互：按钮像素硬边 + 悬停反色/微光；选项按钮逐条淡入；打字光标为方块闪烁；流式中有细微指示；`prefers-reduced-motion` 下关闭动画。
- 布局：`html[data-layout="landscape"]` → 舞台 2:1（`aspect-ratio: 2 / 1`），内部左右两栏（故事 62% / 抉择 38%）；`html[data-layout="portrait"]` → 舞台 9:16，单列上下结构（故事滚动、抉择贴底）。外框在视口内居中，外部留黑 + 装饰。
- 字体已内嵌自托管（不依赖用户本地字体）；页脚/关于里需要给 Fusion Pixel Font (OFL-1.1) 与 KaTeX/Marked/DOMPurify 留 credit 位置（文案由 i18n 提供）。
- 必须支持 375~430px 宽度手机、1440/1920 桌面、100vh 小屏、安全区 `env(safe-area-inset-*)`。
- 不允许改 HTML/JS 文件；需要新钩子时先与 lead 说。

## 10. 消息总线

- 认领任务：`team_task_list` → `team_task_get` → `team_task_update action=claim`。
- 完成前跑一遍自己的自测；完成后 `team_task_update action=complete`，并给 lead 发简报（改了哪些文件、怎么验证、遗留问题）。
- 有阻塞立刻发消息给 lead，不要空转。
