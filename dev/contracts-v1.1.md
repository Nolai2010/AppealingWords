# 无尽文游 v1.1 契约（中文，内部文档）

v1.1 目标（来自用户）：
1. README 拆成中文、英文两个文件，顶部用超链接互相切换阅读。
2. index.html 一开始先教用户「怎么配置一个大模型的 API」——面向完全不懂 API 的 C 端用户（登录/充值/建 Key/填 Base URL 与模型名/测试）。
3. 模型名联网调研后更新（DeepSeek 已是 `deepseek-flash` 等）。
4. 提交信息简短，只写「改了什么」；正式发布 **1.1** 版本（tag + GitHub Release）。
5. 保持 v1.0 全部功能不回归。

## 0. 运行环境（v1.1 不变）

- 仓库根：`D:\DeepSeek-Agent\Workfile\AppealingWords`，当前分支 `main`，远端已存在（v1.0 已上线 <https://nolai2010.github.io/AppealingWords/>）。
- Lead 会话为 danger-full-access；**teammate 子进程仍被沙箱限制**（Edge 起不来），所以浏览器 E2E/截图由 Lead 代跑，teammate 只写脚本与静态自测。
- Node 24 / PowerShell 5.1；文件统一 UTF-8 无 BOM（用 write 工具或 .NET 写文件）。
- 不要动 git 历史、不要 push、不要改别人写作用域。

## 1. 联网调研结论（2026-11 本次实测，作为唯一事实来源）

### 1.1 各服务商现状（更新到 i18n.js 的 PROVIDER_PRESETS 与 guide.js）

| id | 名称 | 协议 | Base URL | 示例模型 | 获取 Key 页面 | 浏览器直连实测 |
|---|---|---|---|---|---|---|
| deepseek | DeepSeek | openai | `https://api.deepseek.com` | `deepseek-flash` | `https://platform.deepseek.com/api_keys` | ✅ 通过 |
| kimi | Kimi（月之暗面） | openai | `https://api.moonshot.cn/v1` | `kimi-k3.1-pro` | `https://platform.kimi.com/console/api-keys` | ✅ 通过 |
| qwen | 通义千问（阿里云百炼） | openai | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.8-max` | `https://bailian.console.aliyun.com/` | ✅ 通过 |
| glm | 智谱 GLM | openai | `https://open.bigmodel.cn/api/paas/v4` | `glm-5.3` | `https://bigmodel.cn/usercenter/proj-mgmt/apikeys` | ⚠️ 实测被 CORS 拦截 |
| doubao | 豆包（火山方舟） | openai | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-2-0-code`（以控制台模型 ID / 推理接入点为准） | `https://console.volcengine.com/ark` | ⚠️ 实测被 CORS 拦截 |
| openai | OpenAI | openai | `https://api.openai.com/v1` | `gpt-6.1-terra`（旗舰 `gpt-6-astra`；另有 `gpt-6.1-sol`） | `https://platform.openai.com/api-keys` | ❔ 国内网络不可达，海外可用（官方允许 CORS） |
| anthropic | Anthropic Claude | anthropic | `https://api.anthropic.com/v1` | `claude-sonnet-5-5`（另有 `claude-opus-5-5`、`claude-haiku-5-5`） | `https://console.anthropic.com/settings/keys` | ❔ 程序已自动加 `anthropic-dangerous-direct-browser-access` 头；国内网络不可达 |
| openrouter | OpenRouter | openai | `https://openrouter.ai/api/v1` | `openrouter/auto` | `https://openrouter.ai/keys` | ✅ 通过 |

补充事实：
- DeepSeek 当前公开模型 `deepseek-flash`（V4.1 Flash，便宜、快）与 `deepseek-v4-pro`（更强、更贵）；旧名 `deepseek-v4-flash` 等已 legacy/retired。另有 Anthropic 兼容格式：Base URL `https://api.deepseek.com/anthropic`。
- Kimi 另有 Anthropic 兼容端点 `https://api.moonshot.cn/anthropic`；模型 ID 还可用 `kimi-k3.1-pro-highspeed`、`kimi-k3`、`kimi-k2.7-code`、`kimi-k2.6`。
- 阿里云百炼新推荐域名形态：`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`（旧 `dashscope.aliyuncs.com/compatible-mode/v1` 仍可用，示例保留旧域名更通用）。当前模型如 `qwen3.8-max`、`qwen3.8-flash`。
- 智谱当前旗舰 `glm-5.3`（另有 `glm-5.3-flash`、`glm-5.2`）；Base URL 仍是 `open.bigmodel.cn/api/paas/v4`。
- 火山方舟：模型 ID 以控制台为准；老用户常用「推理接入点 ID」（`ep-` 开头），新模型可直接用模型名，如 `doubao-seed-2-0-code`。
- OpenAI 当前模型（2026-11）：GPT-6 Astra（2026-09-08 发布，旗舰，1.05M 上下文，贵）→ API 名 `gpt-6-astra`；GPT-6.1 Terra（2026-10-26，较便宜，$1/M 输入、$5/M 输出）→ API 名 `gpt-6.1-terra`；另有 `gpt-6.1-sol`、`gpt-6.1-sol-pro` 等。写故事建议 Terra（性价比）或 Astra（效果最好）。
- Anthropic 当前模型（2026-11）：Claude 5.5 系列——Opus 5.5（2026-09-22）、Sonnet 5.5（2026-09-28）、Haiku 5.5（2026-10-07）；API 名按惯例 `claude-opus-5-5` / `claude-sonnet-5-5` / `claude-haiku-5-5`。另有 Fable 5.1 / Mythos 5.1（偏代码与知识工作，可选）。
- 以上模型名为 2026-11 调研时的示例，界面与 README 统一注明「模型名以服务商文档为准」。

### 1.2 面向 C 端用户的解释口径（guide.js 用）

- API Key ≈「服务商发给你的密码」；Base URL ≈「服务商接口的收件地址」；模型名 ≈「你要雇的写手」。
- 流程：进官网 → 手机号/邮箱注册 → 充值或用免费额度 → 控制台「API Keys」新建并复制 → 回到本页粘贴 → 测试连接 → 保存。
- 国内用户优先推荐：DeepSeek（便宜、浏览器可直连）、Kimi（国内、可直连）、通义千问（阿里云账号即用、可直连）。
- GLM/豆包若浏览器直连失败（CORS），可改用上述可直连服务商，或自建 CORS 转发；OpenAI/Anthropic 需海外网络环境。
- 费用：本作不收费；按服务商 token 计费，新手一局通常几分钱到几角钱；建议先充少量试玩。
- 安全：Key 只存在本机浏览器，只在请求你填的服务商时使用，不会上传到本项目服务器；可在服务商控制台随时吊销。
- 本页所有内容（API Key/存档）都只存本机；换设备需重新填写。

## 2. 文件与写作用域（v1.1 增量）

| 负责人 | 文件 |
|---|---|
| lead | `index.html`、`assets/js/app.js`、`assets/js/guide.js`（若交由 guide-scribe 则 lead 只接）……见各任务；版本号、README 最终合并、部署 |
| guide-scribe | `assets/js/guide.js` |
| doc-scribe | `README.md`、`README.en.md` |
| lexicon | `assets/js/i18n.js`（新增 key + 更新 PROVIDER_PRESETS） |
| ui-artisan | `assets/css/style.css`（仅追加 v1.1 样式） |
| qa-harness | `dev/qa.mjs` 及自测脚本（只改 dev/），截图由 lead 跑 |

README 的英文文件由 doc-scribe 全权写；lead 不改内容（只做链接/事实检查）。
`assets/js/prompt.js`、`store.js`、`api.js`、`render.js`、`typewriter.js` 原则上不动（版本号在 store.js，由 lead 改）。

## 3. `assets/js/guide.js` 契约（guide-scribe）

纯 ES module，无副作用。导出：

```js
export const GUIDE_STEPS = [
  {
    id: 'signup',                       // signup / apikey / fill
    title: { zh: '…', en: '…' },
    body:  { zh: '…', en: '…' },        // 1~3 句，讲清楚做什么
    tip:   { zh: '…', en: '…' },        // 可选一句小提示
  },
  // 共 3 步
];

export const GUIDE_CONCEPTS = [
  {
    id: 'baseUrl',                      // baseUrl / apiKey / model
    term: { zh: 'Base URL（接口地址）', en: 'Base URL' },
    desc: { zh: '…通俗解释，配一个生活比喻…', en: '…' },
    example: 'https://api.deepseek.com',  // 可选
  },
  // 共 3 个
];

export const GUIDE_PROVIDERS = [
  {
    id: 'deepseek',                     // 必须与 i18n.js 的 PROVIDER_PRESETS id 对应
    name: 'DeepSeek',
    protocol: 'openai',                 // openai | anthropic
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/',
    recommended: true,                  // 新手推荐
    cors: 'ok',                         // ok（浏览器可直连）/ relay（可能需转发）/ unknown（视网络）
    currency: 'cny',                    // cny | usd | both
    highlights: { zh: '…', en: '…' },   // 12~24 字，卖点
    note: { zh: '…', en: '…' },         // 可选，注意事项（如模型 ID 以控制台为准）
  },
  // deepseek / kimi / qwen / glm / doubao / openai / anthropic / openrouter 共 8 个
];

export const GUIDE_FAQ = [
  { q: { zh: '…', en: '…' }, a: { zh: '…', en: '…' } },
  // 4~5 条：费用/额度、CORS 连不上、Key 安全、没有海外卡、以后怎么换模型
];
```

要求：中文面向完全不懂技术的用户（避免「tokenizer/SDK/endpoint」等词），英文自然口语化；`baseUrl/model/keyUrl` 必须与 §1.1 完全一致；所有对象不要出现多余字段以外的东西；文件末尾可加 `export const GUIDE_VERSION = '1.1.0';`（可选）。

## 4. `assets/js/i18n.js` 增量（lexicon）

### 4.1 更新 `PROVIDER_PRESETS`（保持 9 条与顺序：openai, anthropic, deepseek, glm, qwen, kimi, doubao, openrouter, custom）

按 §1.1 表更新每条的 `label / protocol / baseUrl / model`；custom 仍为空 baseUrl/model。DeepSeek 的预设 model 必须是 `deepseek-flash`。

### 4.2 新增 key（zh/en 必须成对，占位符一致）

guide.kicker
guide.title（例如「第一次用 API？照这三步来」）
guide.desc
guide.stepsLabel
guide.step1Title / guide.step1Body / guide.step1Tip
guide.step2Title / guide.step2Body / guide.step2Tip
guide.step3Title / guide.step3Body / guide.step3Tip
guide.conceptsLabel
guide.conceptBaseUrl / guide.conceptBaseUrlDesc
guide.conceptApiKey / guide.conceptApiKeyDesc
guide.conceptModel / guide.conceptModelDesc
guide.providersLabel
guide.providersHint
guide.recommendedTag（推荐/Recommended）
guide.corsOkTag（可直连）
guide.corsRelayTag（需转发）
guide.corsUnknownTag（视网络）
guide.getKeyAction（去获取 Key）
guide.useConfigAction（填入本页）
guide.docsAction（官方文档）
guide.costNote
guide.securityNote
guide.faqLabel
guide.helpButton（配置教程）
guide.modalTitle（API 配置教程）
guide.modalIntro
guide.modalClose
guide.moreAction（完整教程）
settings.guideLink（不会获取 API Key？查看教程）
settings.aboutReadme（阅读完整说明 / Read the full guide）
guide.currencyCny（人民币计价）
guide.currencyUsd（美元计价）
guide.currencyBoth（视模型而定）
guide.providerNote（模型名与服务以服务商文档为准）

（共约 45 个新 key；其余沿用旧 key。`settings.version` 的 `{version}` 由 app 传入 `1.1.0`。）

## 5. README 契约（doc-scribe）

两个文件：
- `README.md`（中文，GitHub 默认展示）顶部第一行语言切换：`**中文** · [English](README.en.md)`
- `README.en.md`（英文）顶部：`**English** · [中文](README.md)`

中文 README 内容要求（面向完全不懂的玩家）：
1. 标题 + 口号「没有尽头的互动文字游戏」+ 在线游玩链接 <https://nolai2010.github.io/AppealingWords/> + MIT badge。
2. 这是什么（纯前端、自备 API、无后端、四卷题材）。
3. **第一次玩：先拿到 API Key**（最重要，放很前）：
   - 用大白话解释 API Key / Base URL / 模型名。
   - 三步流程：注册并充值 → 控制台创建 API Key → 回页面填三样东西并测试。
   - 服务商推荐表格（按 §1.1，标注新手推荐/浏览器可直连/需转发/海外网络），每个给「获取 Key」超链接。
   - 费用预期、安全说明、CORS 连不上怎么办、没有海外卡怎么办。
4. 怎么玩（选卷→读故事→选选项/自由行动→自动存档；档案室、导出导入）。
5. 四卷介绍。
6. 特性列表（v1.1 更新：新手教程、模型名）。
7. 支持接口与示例配置表（§1.1 的完整表格，含 DeepSeek/Kimi 的 Anthropic 兼容端点）。
8. 隐私与数据（localStorage）。
9. FAQ（连不上、格式跑偏、费用、换设备、手机键盘等）。
10. 本地运行/部署到自己的 Pages。
11. 项目结构（新增 `assets/js/guide.js`、`README.en.md`）。
12. v1.1 更新说明（简短 3~5 条：新手教程、模型名更新、README 中英分册、页面细节）。
13. 致谢与许可（字体 OFL、KaTeX/Marked/DOMPurify、MIT）。
14. 截图引用现有 4 张：`docs/screenshots/onboarding-landscape.png`、`home-landscape.png`、`game-landscape.png`、`game-portrait.png`（不要新增图片文件；v1.1 上线后 lead 会重拍 onboarding 截图覆盖同名文件）。

英文 README 是对应的完整英文版（不是摘要），结构一一对应，语言自然、面向海外用户，强调 CORS/浏览器直连与海外网络差异。

不允许：写实现细节占主体、写「TODO/占位符」、引用不存在的图片、出现未经验证的具体价格数字（只写「几分钱到几角钱/几美元以内」这种模糊量级）。

## 6. index.html 新结构（lead 写，ui-artisan 看）

onboarding 左侧由原来单薄 intro 扩展为「新手引导 + 表单」布局（桌面横屏左右两栏，手机单列顺序：标题→三步→概念→服务商→表单）：

- `#view-onboarding .onboarding`
  - `.onboarding__guide`（左栏，桌面可滚动）
    - `.kicker` / `h1.display-title` / `.lede` / `.privacy-note`（沿用旧 key）
    - `#guide-steps`、`#guide-concepts`、`#guide-providers`、`#guide-faq`（app.js 用 guide.js 渲染；静态 HTML 留空容器 + i18n 标题）
    - `#btn-open-guide`（打开完整教程弹窗，可选）
  - `.onboarding__form`（右栏）：协议/服务商 chips/Base URL/Key/模型/高级/测试/保存（沿用 v1.0 结构，仅微调间距）
- `#modal-guide`：弹窗，静态壳 + `#guide-modal-body`（渲染同一份 guide 内容），可从 onboarding 与设置 tab 打开。
- 设置 → 接口 tab 底部加 `#btn-open-guide-settings`（文案 settings.guideLink）。

新增 class（ui-artisan 样式）：`.guide-steps`、`.guide-step`、`.guide-step__num/__title/__body/__tip`、`.guide-concepts`、`.guide-concept`、`.guide-concept__term/__desc/__example`、`.guide-providers`、`.provider-card`、`.provider-card__head/__name/__tags/__tag/__highlight/__url/__actions`、`.guide-faq`（details/summary）、`.guide-cta`、`.guide-note`，以及 `#modal-guide .modal__body` 内部排版。

## 7. QA 增量（qa-harness，只改 dev/）

在 v1.0 的 T1~T14 基础上新增/调整：
- T-新1 引导页教程：`#guide-steps .guide-step` ≥3、`#guide-concepts .guide-concept` ≥3、`#guide-providers .provider-card` ≥8，且每张卡有 `a[href^="https://"]`（获取 Key / 文档）与新窗口属性。
- T-新2 「填入本页」：点 DeepSeek 卡的填入按钮后，`#input-base-url` / `#input-model` / 协议开关值变成 `https://api.deepseek.com` / `deepseek-flash` / openai。
- T-新3 预设模型：打开引导页 chips 里 DeepSeek 后，模型值为 `deepseek-flash`；i18n PROVIDER_PRESETS 中对应值同步（静态检查）。
- T-新4 教程弹窗：点击 `#btn-open-guide` 或设置里的入口能打开 `#modal-guide` 且内容非空、可关闭。
- T-新5 版本：设置→关于显示 `1.1.0`；README 两文件存在且互相链接（静态文件检查，可在 node 阶段做）。
- 其余 T1~T14 全部保持 PASS；截图仍为四张固定文件名（onboarding 会因新版变化，尺寸不变）。
- 仍然：qa 写脚本，由 lead 跑（Edge 在 Lead 会话可用）。

## 8. 版本与发布（lead）

- `store.js` `APP_VERSION = '1.1.0'`。
- 提交信息简短，只写改动内容（示例：`发布 1.1：新增新手 API 配置教程，README 拆分中英文，更新模型列表`），不要长标题/诗歌。
- 打 tag `v1.1.0`，`gh release create` 正式发布（Release 标题 `v1.1`，notes 列 3~5 条改动）。
- 推送到 `main` 后等 GitHub Pages 构建成功，再用无头 Edge 验证线上站点（教程区、模型预置、版本号）。

## 9. 协作流程

- 认领任务：team_task_list → team_task_get → team_task_update(claim)。
- 完成后 team_task_update(complete) + 给 lead 发简报（改了哪些文件、自测命令与结果、遗留风险）。
- 遇到阻塞发消息给 lead；浏览器相关验收由 lead 代跑。
- 不要 git commit/push/tag，统一由 lead 做最终提交与发布。
