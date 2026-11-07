**中文** · [English](README.en.md)

# 无尽文游 · Appealing Words

**没有尽头的互动文字游戏。**

一个由你自己的 AI 模型驱动、中英双语的互动文字冒险。不用注册、不用登录、没有服务器：填上自己的 API Key，选一卷故事，然后一直玩下去。

**▶ 在线游玩：[nolai2010.github.io/AppealingWords](https://nolai2010.github.io/AppealingWords/)**

[![MIT License](https://img.shields.io/badge/license-MIT-2fbf8f)](LICENSE)
[![GitHub Pages](https://img.shields.io/badge/deploy-GitHub%20Pages-c9a86a)](https://nolai2010.github.io/AppealingWords/)

<img src="docs/screenshots/game-landscape.png" width="820" alt="游戏界面：规则怪谈，正文、选项与自由行动输入框">

---

## 这是什么

「无尽文游」是一台**文字冒险生成器**。它把你自己接的 AI 模型变成一位说书人：模型按照题材的世界观即兴推演剧情，给出三到四个抉择，你选一个——它接着往下写。

- 每一局都是即兴生成，不会重复。
- 没有固定的通关条件，故事可以一直写下去。
- 你的 API Key、存档、设置都只保存在**你自己的浏览器**里，不经过任何服务器。
- 纯前端项目，部署在 GitHub Pages 上，开放源代码。

四卷题材：规则怪谈、警匪智斗、宫闱疑云、江湖夜雨——见下文「四卷」。

## 第一次玩：先拿到 API Key

> 这一节写给完全没接触过 API 的人。照着做，大约五分钟。

「无尽文游」自己**不带模型，也不收任何费用**。故事的每一句，都是由你自己的 AI 账号在服务商那边生成，按用量计费。所以第一次打开网页，要先给游戏配一把「钥匙」。

### 先弄懂三个词

| 名词 | 大白话 | 长什么样 |
| --- | --- | --- |
| **API Key** | 服务商发给你的「专属密码」。它证明这次请求是你发的，也用来按用量扣费。像银行卡密码一样，只能自己看。 | 一串字符，常见以 `sk-` 开头，各家格式不同 |
| **Base URL** | 服务商接口的「收件地址」。游戏把故事请求寄到这个地址。一般写到 `/v1` 这类版本路径为止，后面的具体路径程序会自己补。 | `https://api.deepseek.com` |
| **模型名** | 你要雇的「写手」的名字。不同模型能力、速度、价格不同；名字写错，就找不到这位写手。 | `deepseek-flash` |

> 三个词记不住也没关系：在引导页点服务商卡片上的「填入本页」，地址和模型名会自动填好，你只需要自己粘贴 API Key。

### 三步拿到钥匙

**第一步：注册账号，充点钱（或领免费额度）**
打开一家服务商的官网，用手机号或邮箱注册并完成验证。登录后进「控制台 / 费用中心」，先充少量余额，或领新用户赠送的额度。多数国内服务商支持常用国内支付方式（以各家官网为准）。

**第二步：在控制台创建并复制 Key**
找到「API Keys」「密钥管理」这类入口，点「创建」，把生成的那串长字符复制下来。有的服务商只显示一次，请先存到只有你能看到的地方。**不要把 Key 发到群里、截图里，或提交到公开仓库。**

**第三步：回到本页填好，点「测试连接」**
在引导页右侧（手机上在下方）选好接口格式，填 Base URL、粘贴 API Key、填模型名，点「测试连接」；看到「连接成功」后点「保存并开始」。以后打开网页不用再填，随时可以在右上角「设置 → 接口」里修改。也可以直接点服务商卡片的「填入本页」，一步带出地址和模型名。

<img src="docs/screenshots/onboarding-landscape.png" width="820" alt="引导页：左侧三步教程与八家服务商卡片，右侧填写 Base URL、API Key 与模型名">

### 选哪家服务商？

新手优先选带「推荐」标签、且浏览器能直连（ok）的：**DeepSeek、Kimi、通义千问**。想用一个 Key 换多家模型，可以试试 **OpenRouter**。下表按 2026 年 11 月的情况整理；模型名与接口地址可能随服务商更新，**以服务商官方文档为准**。

| 服务商 | 新手推荐 | 浏览器直连 | 计价 | 获取 Key | 官方文档 |
| --- | --- | --- | --- | --- | --- |
| DeepSeek | ✅ 推荐 | ✅ 可直连（ok） | 人民币计价 | [去获取 Key](https://platform.deepseek.com/api_keys) | [官方文档](https://api-docs.deepseek.com/) |
| Kimi（月之暗面） | ✅ 推荐 | ✅ 可直连（ok） | 人民币计价 | [去获取 Key](https://platform.kimi.com/console/api-keys) | [官方文档](https://platform.kimi.com/docs/api/overview) |
| 通义千问（阿里云百炼） | ✅ 推荐 | ✅ 可直连（ok） | 人民币计价 | [去获取 Key](https://bailian.console.aliyun.com/) | [官方文档](https://help.aliyun.com/zh/model-studio/) |
| OpenRouter | ◯ 可用：一个 Key 用多家模型 | ✅ 可直连（ok） | 视模型而定 | [去获取 Key](https://openrouter.ai/keys) | [官方文档](https://openrouter.ai/docs) |
| 智谱 GLM | ◯ 可用 | ⚠️ 需转发（relay，实测被 CORS 拦截） | 人民币计价 | [去获取 Key](https://bigmodel.cn/usercenter/proj-mgmt/apikeys) | [官方文档](https://docs.bigmodel.cn/) |
| 豆包（火山方舟） | △ 需要动手配置 | ⚠️ 需转发（relay，实测被 CORS 拦截） | 人民币计价 | [去获取 Key](https://console.volcengine.com/ark) | [官方文档](https://www.volcengine.com/docs/82379) |
| OpenAI | △ 需要海外网络 | ❔ 视网络（unknown，官方允许 CORS） | 美元计价 | [去获取 Key](https://platform.openai.com/api-keys) | [官方文档](https://platform.openai.com/docs) |
| Anthropic Claude | △ 需要海外网络 | ❔ 视网络（unknown，程序已自动加浏览器直连请求头） | 美元计价 | [去获取 Key](https://console.anthropic.com/settings/keys) | [官方文档](https://docs.anthropic.com/) |

**图例**：✅ 推荐＝新手直接选（和页面上的「推荐」标签一致）；◯ 可用＝能用，但可能要多试几步；△＝建议熟悉后再用。`ok`＝浏览器可直连，对应页面上的「可直连」；`relay`＝可能需要自建 CORS 转发，对应「需转发」；`unknown`＝取决于你的网络环境，对应「视网络」。计价一栏只说明账单大致币种，具体以服务商控制台为准。

### 大概要花多少钱？

本作**不收费**。费用由服务商按生成的字数（技术上讲叫 token）结算，直接记在你的服务商账户上。

- 新手玩一局，通常只要**几分钱到几角钱**。
- 用 OpenAI、Anthropic 这类海外模型，一局通常也在**几美元以内**；旗舰模型会明显更贵。
- 建议先充少量试玩：玩几局、看看账单，再决定要不要多充。
- 余额和账单以服务商控制台为准；本作看不到、也碰不到你的账户。

### 我的 Key 安全吗？

- Key 只保存在**你自己的浏览器**里，不会上传到本项目的任何服务器；本作没有后端。
- 它只会在请求你填的那家服务商时使用，不会发给第三方。
- 怀疑泄露时，去服务商控制台**吊销（删除）**这个 Key，再新建一个填回来即可。
- 不要把 Key 写进截图、聊天记录、公开仓库，或填进来路不明的「中转站」。
- 换设备、换浏览器或清除站点数据后，Key 需要重新填写。

### 连不上 / 提示 CORS 怎么办？

本作是纯前端网页，请求由浏览器直接发给你填写的接口。如果服务商不允许浏览器跨域（CORS），「测试连接」就会失败，常见提示是 `Failed to fetch`、`CORS policy` 或网络错误。可以按顺序试：

1. **换一家能直连的**：DeepSeek、Kimi、通义千问、OpenRouter 实测可以直连（见上表），最快。
2. **核对三样东西**：Base URL 要写到 `/v1` 这类版本路径；OpenAI 兼容与 Anthropic 格式别选错；模型名要和服务商对得上。
3. **自建转发**：如果你有自己的服务器，可以搭一个允许 CORS 的转发（例如 Cloudflare Worker、自己的 Nginx），把转发地址填进 Base URL。注意不要使用陌生人的公共转发——那等于把 Key 交出去。
4. GLM、豆包当前实测会被 CORS 拦截，可能需要第 3 步；以后服务商也可能放开，以实测为准。

### 没有海外信用卡怎么办？

不影响开玩。DeepSeek、Kimi、通义千问都是国内服务商，注册和充值支持国内常用支付方式（以各家官网为准），不需要海外卡。OpenRouter 是聚合接口，支付方式以官网为准。想用 OpenAI / Anthropic 但暂时没有海外卡，可以先从国内可直连的模型玩起；故事好不好，主要看模型能力和题材。**不建议**把 Key 或账号交给来路不明的代充、共享账号或公共中转。

## 怎么玩

### 第一步：选一卷故事

打开首页，在「择一卷」里挑一个题材，点「开卷」，故事立刻开始。想换个题材随时可以回首页，或者另开一卷。

<img src="docs/screenshots/home-landscape.png" width="820" alt="主页：择一卷，四卷题材与最近残卷">

### 第二步：读故事，做选择

- 故事以打字机效果逐字流出，可以随时点「跳过动画」。
- 读完给出三到四个选项，点一个，说书人接着往下写。
- 也可以**不选选项**，在输入框里写下自己的行动——说书人会顺着你的写法继续。

### 第三步：一直选下去

- 每一回合都会把前文作为上下文交给模型，它会记得你遇见的人、说过的谎、欠下的债。
- 每个回合自动存档。右上角「档案」里可以随时续读旧档，或另起一局。
- 设置 → 数据里可以导出全部数据（JSON）做备份，也可以导入恢复、清空重来。

## 四卷

| 卷目 | 英文名 | 内容 |
| --- | --- | --- |
| **规则怪谈** | Rulebound Horror | 日常空间里出现诡异规则。规则有逻辑、可被推理，但「正确的事」未必安全。细思极恐，不靠廉价惊吓。 |
| **警匪智斗** | Badge and Bluff | 审讯、卧底、交易、布局。每一次交锋都有筹码，反转必须提前埋线。 |
| **宫闱疑云** | Silk and Poison | 架空王朝的宫廷权谋。礼数是攻防，毒计要讲得通，权势具体到「谁掌采买、谁夜里能进内殿」。 |
| **江湖夜雨** | Rain on Old Blades | 武侠江湖，门派恩怨与信义之债。比武必须写清「为什么赢」，代价要真。 |

## 特性

- **新手教程**（v1.1 新增）：引导页用大白话讲清 API Key / Base URL / 模型名，三步上手，八家服务商卡片可一键填入；「设置 → 接口」里也能随时打开完整教程。
- **服务商预设更新**（v1.1）：内置 DeepSeek、Kimi、通义千问、智谱 GLM、豆包、OpenAI、Anthropic、OpenRouter 八家预设，模型名按各家最新文档更新；也可以完全手填。
- **流式输出 + 复古打字机**：逐字落笔，可随时「跳过动画」。
- **Markdown 与 LaTeX 渲染**：粗体、引用、代码、表格、公式都支持。
- **多存档与上下文记忆**：本地保存全部会话，随时续读；上下文窗口自动裁剪，长局也不容易崩。
- **桌面 2:1 / 手机 9:16**：按设备自动切换横屏与竖屏舞台，也可以手动指定。
- **中英双语**：右上角一键切换；故事会用当前语言续写。
- **像素字体自托管**：页面字体随站点一起加载，不依赖你电脑里装了什么字体。
- **零后端、零追踪**：没有账号系统，没有统计脚本，没有数据上传。

<img src="docs/screenshots/game-portrait.png" width="260" alt="手机竖屏界面：正文、选项与自由行动输入框">

## 支持的接口与示例配置

只要服务商提供 **OpenAI 兼容**或 **Anthropic 兼容**接口，基本都能用。程序不内置任何服务商适配，也不需要——填对接口格式、地址和模型名即可。

一些示例配置（**仅供参考，模型名以服务商官方文档为准**）：

| 服务商 | 接口格式 | Base URL 示例 | 模型名示例 |
| --- | --- | --- | --- |
| DeepSeek | OpenAI 兼容 | `https://api.deepseek.com` | `deepseek-flash` |
| DeepSeek（Anthropic 兼容端点） | Anthropic 兼容 | `https://api.deepseek.com/anthropic` | `deepseek-flash` |
| Kimi（月之暗面） | OpenAI 兼容 | `https://api.moonshot.cn/v1` | `kimi-k3.1-pro` |
| Kimi（Anthropic 兼容端点） | Anthropic 兼容 | `https://api.moonshot.cn/anthropic` | `kimi-k3.1-pro` |
| 通义千问（阿里云百炼） | OpenAI 兼容 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.8-max` |
| 智谱 GLM | OpenAI 兼容 | `https://open.bigmodel.cn/api/paas/v4` | `glm-5.3` |
| 豆包（火山方舟） | OpenAI 兼容 | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-2-0-code`（以控制台模型 ID / 推理接入点为准） |
| OpenAI | OpenAI 兼容 | `https://api.openai.com/v1` | `gpt-6.1-terra` |
| Anthropic Claude | Anthropic 兼容 | `https://api.anthropic.com/v1` | `claude-sonnet-5-5` |
| OpenRouter | OpenAI 兼容 | `https://openrouter.ai/api/v1` | `openrouter/auto` |

选模型的一些参考（截至 2026 年 11 月）：

- **DeepSeek**：`deepseek-flash` 便宜、快，适合日常玩；`deepseek-v4-pro` 更强也更贵。另有 Anthropic 兼容格式，Base URL 填 `https://api.deepseek.com/anthropic`，接口格式选「Anthropic 格式」。
- **Kimi**：`kimi-k3.1-pro` 是当前主力；还有 `kimi-k3.1-pro-highspeed`、`kimi-k3` 等可选。Anthropic 兼容端点：`https://api.moonshot.cn/anthropic`。
- **通义千问**：`qwen3.8-max` 效果最好，`qwen3.8-flash` 更快更省。阿里云百炼新版也会为每个工作空间分配专属域名，具体地址以控制台显示的完整地址为准；上表保留更通用的旧域名写法。
- **智谱 GLM**：`glm-5.3` 是当前旗舰，另有 `glm-5.3-flash`、`glm-5.2`。
- **豆包（火山方舟）**：模型 ID 以控制台为准；老账号常用 `ep-` 开头的推理接入点 ID，新模型也可直接用模型名，如 `doubao-seed-2-0-code`。
- **OpenAI**：想省钱选 `gpt-6.1-terra`；追求效果选旗舰 `gpt-6-astra`（更贵、上下文更大）；另有 `gpt-6.1-sol`。
- **Anthropic**：`claude-sonnet-5-5` 均衡；`claude-opus-5-5` 更强更贵；`claude-haiku-5-5` 更快更省。
- **OpenRouter**：`openrouter/auto` 会自动挑模型；也可以填 OpenRouter 上任意模型 ID。

> **关于 CORS**：本项目是纯前端页面，浏览器需要能直接请求你填的接口。Anthropic 官方接口需要特殊请求头，程序已自动附加；如果你的服务商不允许跨域，可以自建一个允许 CORS 的转发网关，再把网关地址填进来。

## 隐私与数据

- **API Key 只存在本机浏览器**（`localStorage`，键名 `appealingwords.v1`）。页面不发往任何自建服务器，请求直接发给你填写的接口地址。
- **没有任何账号、统计、广告或后端**。
- 换设备、换浏览器或清除站点数据后，配置和存档不会自动同步。重要存档可在「设置 → 数据 → 导出」里备份成 JSON，再导入恢复。
- 想彻底清空：设置 → 数据 → 清空所有数据。

## 常见问题

**连不上 / 一直报错？**
按顺序检查：接口格式是否选对、Base URL 是否写到正确的版本路径、模型名是否拼错、Key 是否有权限、账号是否欠费或限流、服务商是否允许浏览器直连（CORS）。点「测试连接」会返回具体错误信息；也可以对照上文「连不上 / 提示 CORS 怎么办」。

**故事格式坏了 / 没有选项？**
小模型偶尔不按格式输出，页面会自动兜底成「正文 + 三个保底选项」，不会卡死。换一个能力更强、指令遵循更好的模型，体验会稳定很多。

**为什么同一个选择，两次玩到的不一样？**
AI 是即时生成的，加上默认温度较高，同一开局的不同推演本来就会分叉。这正是它的好玩之处。

**以后怎么换模型或服务商？**
右上角「设置 → 接口」里随时可以改；也可以回去点服务商卡片的「填入本页」。换完之后点「测试连接」确认一下。

**换设备 / 换浏览器后，配置和存档还在吗？**
不在。Key、设置和存档都只存在当前浏览器里。换设备前可以在「设置 → 数据 → 导出」备份成 JSON，在新设备上导入恢复；Key 需要重新填写。

**手机键盘挡住输入框？**
竖屏布局按 `dvh` 做了适配，收起键盘即可。如果仍然异常，请在 issue 里附上机型和浏览器版本。

**费用怎么算？**
本项目不收费。模型费用由你的服务商按 token 结算，一局通常几分钱到几角钱，取决于模型与故事长度。详见上文「大概要花多少钱」。

## 本地运行 / 自己部署

不需要安装依赖，也没有构建步骤：

```bash
git clone https://github.com/Nolai2010/AppealingWords.git
cd AppealingWords
python -m http.server 8788
# 打开 http://127.0.0.1:8788
```

任何静态文件服务器都可以，Python 只是最省事的一种。

部署到自己的 GitHub Pages：Fork 本仓库，在仓库 Settings → Pages 里选择 `main` 分支根目录发布即可。项目只有一个静态站点，没有秘密、没有后端。

## 项目结构（给好奇的人）

```
index.html              页面骨架（引导页 / 主页 / 游戏页 / 弹窗）
README.md               中文完整说明（本文件）
README.en.md            英文完整说明
assets/css/style.css    全部视觉：像素风、双布局、动效
assets/js/              ES modules，无打包
  main.js               入口
  app.js                视图、事件、游戏循环
  guide.js              新手教程数据（步骤 / 名词 / 服务商 / FAQ，v1.1 新增）
  api.js                OpenAI 兼容 / Anthropic 两种流式客户端
  store.js              localStorage 存档、配置、上下文窗口
  render.js             Markdown 消毒渲染 + KaTeX
  typewriter.js         打字机引擎
  prompt.js             四种题材的 System Prompt（中英双语）
  i18n.js               全部界面文案（中英双语）
assets/vendor/          KaTeX / Marked / DOMPurify（自托管）
assets/fonts/           Fusion Pixel Font（OFL-1.1，自托管）
docs/screenshots/       README 截图
dev/                    假 API 服务器 + 无头浏览器端到端测试（开发用，不参与上线）
```

## v1.1 更新说明

- 新增「第一次用 API」新手教程：引导页三步上手、三个概念大白话、八家服务商卡片一键填入，设置里也能随时打开完整教程。
- 更新模型预设与示例：DeepSeek `deepseek-flash`、Kimi `kimi-k3.1-pro`、通义千问 `qwen3.8-max`、智谱 `glm-5.3`、豆包 `doubao-seed-2-0-code`、OpenAI `gpt-6.1-terra` / `gpt-6-astra`、Anthropic `claude-sonnet-5-5` / `claude-opus-5-5`、OpenRouter `openrouter/auto`。
- README 拆成中文（`README.md`）与英文（`README.en.md`）两册，顶部可互相切换。
- 引导页排版、教程弹窗、设置入口等页面细节优化；版本号更新为 1.1 系列（当前 1.1.1）。
- **移动端布局兜底**：应用内浏览器/手机「桌面模式」即使上报桌面 UA，也会按窄屏与触屏自动进入 9:16 竖屏；手机横握时自动切换 2:1。
- 保持 v1.0 全部功能不回归：四卷题材、流式打字机、多存档、导入导出、中英切换。

## 致谢与许可

- 字体：[Fusion Pixel Font / 缝合像素字体](https://github.com/TakWolf/fusion-pixel-font)（SIL Open Font License 1.1，字体文件许可证见 `assets/fonts/OFL-fusion-pixel.txt`）
- 公式渲染：[KaTeX](https://katex.org/)（MIT）
- Markdown：[Marked](https://marked.js.org/)（MIT）
- HTML 消毒：[DOMPurify](https://github.com/cure53/DOMPurify)（MPL-2.0 / Apache-2.0）

本项目代码以 **MIT License** 开源，详见 [LICENSE](LICENSE)。字体等第三方资源遵循各自许可证。
