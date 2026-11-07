/**
 * 无尽文游 / Appealing Words — 新手 API 配置教程（数据模块）
 *
 * 纯 ES module、无副作用：只导出静态数据，由 app.js 渲染。
 * 中文面向完全不懂 API 的普通玩家（大白话 + 生活比喻），英文为自然口语。
 *
 * 事实来源：dev/contracts-v1.1.md §1.1（2026-11 调研）。
 * 模型名与服务商政策可能变化，界面统一提示「以服务商文档为准」。
 */

/** 配置模型接口的三步：注册 → 建 Key → 填回本页测试 */
export const GUIDE_STEPS = [
  {
    id: 'signup',
    title: { zh: '注册账号，备一点额度', en: 'Sign up and add a little credit' },
    body: {
      zh: '先挑一家服务商（新手优先看下面标着「推荐」的），打开它的官网，用手机号或邮箱注册。新用户通常有免费额度；如果没有，就充最小的一笔，够你玩上一阵了。',
      en: 'Pick a provider below — start with one tagged as recommended — then open its website and sign up with a phone number or email. New users usually get some free credit; if not, add the smallest top-up, which is plenty to get going.',
    },
    tip: {
      zh: '国内服务商一般支持国内手机号；OpenAI 和 Anthropic 需要海外网络环境和海外支付方式。',
      en: 'Mainland providers accept a mainland phone number; OpenAI and Anthropic need a non-mainland network and payment method.',
    },
  },
  {
    id: 'apikey',
    title: { zh: '在控制台创建一把钥匙', en: 'Create your key in the console' },
    body: {
      zh: '登录服务商的控制台，找到「API Keys」或「API 密钥」，点「新建 / 创建」，然后把生成的那串字符完整复制下来。它就像服务商发给你的门禁卡：每次请求带上它，服务商才知道是你、该从你的余额里扣钱。',
      en: 'Sign in to the provider’s console, find “API Keys”, and click create. Copy the whole string it gives you — it works like a key card issued to you: every request carries it, so the provider knows it’s you and bills your credit.',
    },
    tip: {
      zh: '这串字符通常只完整显示一次，创建后马上粘贴到本页或存进密码管理器；不要发给任何人。',
      en: 'The full key is usually shown only once — paste it into this page right away or save it in a password manager, and never share it.',
    },
  },
  {
    id: 'fill',
    title: { zh: '填回本页，测一下', en: 'Bring it back here and test it' },
    body: {
      zh: '在配置表单里（桌面在右侧、手机在下方）选好刚才那家服务商，把 Key 粘贴进去；Base URL 和模型名一般会自动带出来，不用改。点「测试连接」，看到成功的提示后点「保存并开始」，就能进场读故事了。',
      en: 'In the setup form (on the right on desktop, below on phones), choose the provider you just set up and paste in your key; the Base URL and model name are usually filled in for you. Hit “Test connection”, and once it succeeds, press “Save and start” — your story can begin.',
    },
    tip: {
      zh: '测试失败先检查两件事：Key 有没有复制全（前后别多空格），以及这家服务商能不能在浏览器里直连。',
      en: 'If the test fails, check two things first: that the key was copied in full with no stray spaces, and that this provider allows direct browser access.',
    },
  },
];

/** 三个必懂概念：地址、密钥、写手 */
export const GUIDE_CONCEPTS = [
  {
    id: 'baseUrl',
    term: { zh: 'Base URL（接口地址）', en: 'Base URL' },
    desc: {
      zh: '可以把 Base URL 想成服务商的「收件地址」：你把故事和问题寄到这个地址，服务商处理完再寄回来。选好服务商后它一般会自动填好，通常不用手动改。',
      en: 'Think of the Base URL as the provider’s mailing address: you send your story and questions there, and the reply comes back. It’s usually filled in for you once you choose a provider, so you rarely need to touch it.',
    },
    example: 'https://api.deepseek.com',
  },
  {
    id: 'apiKey',
    term: { zh: 'API Key（密钥）', en: 'API Key' },
    desc: {
      zh: 'API Key 就是服务商发给你的专用密码，好比游乐园的门票加通行证：每次请求都要带上它，服务商才知道这次是你、该花你的额度。别把它给别人，也别发在公开的地方。',
      en: 'An API Key is the private password the provider issues to you, like a season pass: every request carries it, so the provider knows it’s you and charges your credit. Keep it to yourself and never post it in public.',
    },
  },
  {
    id: 'model',
    term: { zh: '模型名', en: 'Model name' },
    desc: {
      zh: '模型名就是你要雇来写故事的那位写手。名字不同，文笔、速度、收费也不同：有的又快又便宜，有的更会写但更贵。新手挑便宜好用的就行，以后随时可以换。',
      en: 'The model name is the writer you’re hiring to tell the story. Different names mean different prose, speed, and price — some are fast and cheap, others write richer text for more. Start with an affordable one; you can switch anytime.',
    },
    example: 'deepseek-flash',
  },
];

/** 八家服务商（id 与 i18n.js 的 PROVIDER_PRESETS 对应，顺序不要改） */
export const GUIDE_PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/',
    recommended: true,
    cors: 'ok',
    currency: 'cny',
    highlights: {
      zh: '便宜、快、国内可直连，新手首选',
      en: 'Cheap, fast, and works in mainland China — the easiest first pick',
    },
    note: {
      zh: '模型名以官网文档为准；想要更强的文笔，可以换 deepseek-v4-pro（更贵）。',
      en: 'Model names follow the official docs; switch to deepseek-v4-pro (pricier) for stronger prose.',
    },
  },
  {
    id: 'kimi',
    name: 'Kimi（月之暗面）',
    protocol: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k3.1-pro',
    keyUrl: 'https://platform.kimi.com/console/api-keys',
    docsUrl: 'https://platform.moonshot.cn/docs/',
    recommended: true,
    cors: 'ok',
    currency: 'cny',
    highlights: {
      zh: '中文长文顺手，国内可直连，新手友好',
      en: 'Handles long Chinese text well, works in mainland China, beginner-friendly',
    },
    note: {
      zh: '模型名以控制台为准；另有 kimi-k3.1-pro-highspeed、kimi-k3、kimi-k2.7-code、kimi-k2.6 等可选。',
      en: 'Model names follow the console; options also include kimi-k3.1-pro-highspeed, kimi-k3, kimi-k2.7-code, and kimi-k2.6.',
    },
  },
  {
    id: 'qwen',
    name: '通义千问（阿里云百炼）',
    protocol: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3.8-max',
    keyUrl: 'https://bailian.console.aliyun.com/',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/',
    recommended: true,
    cors: 'ok',
    currency: 'cny',
    highlights: {
      zh: '有阿里云账号就能用，国内直连稳定',
      en: 'Works with an Alibaba Cloud account and connects reliably from China',
    },
    note: {
      zh: '百炼控制台里能看到可用模型；模型名以文档为准，也可选 qwen3.8-flash。',
      en: 'Your available models are listed in the Bailian console; names follow the docs. qwen3.8-flash is another option.',
    },
  },
  {
    id: 'glm',
    name: '智谱 GLM',
    protocol: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-5.3',
    keyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
    docsUrl: 'https://docs.bigmodel.cn/',
    recommended: false,
    cors: 'relay',
    currency: 'cny',
    highlights: {
      zh: '中文表达自然，适合细腻对白',
      en: 'Natural Chinese phrasing, good for subtle dialogue',
    },
    note: {
      zh: '实测浏览器直连会被安全策略拦下（CORS）；连不上就换上面可直连的服务商，或自建一个转发。',
      en: 'Direct browser access was blocked by CORS in our tests; if it fails, switch to a directly connectable provider or set up a small relay.',
    },
  },
  {
    id: 'doubao',
    name: '豆包（火山方舟）',
    protocol: 'openai',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seed-2-0-code',
    keyUrl: 'https://console.volcengine.com/ark',
    docsUrl: 'https://www.volcengine.com/docs/82379',
    recommended: false,
    cors: 'relay',
    currency: 'cny',
    highlights: {
      zh: '字节出品，中文场景顺手，但可能要转发',
      en: 'From ByteDance, solid for Chinese scenes, though the browser may need a relay',
    },
    note: {
      zh: '模型 ID 以火山方舟控制台为准：新模型可直接填模型名，老账号常填 ep- 开头的推理接入点 ID。',
      en: 'Model IDs follow the Ark console: newer models accept the model name directly, while older accounts use an ep-… endpoint ID.',
    },
  },
  {
    id: 'openai',
    name: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-6.1-terra',
    keyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs',
    recommended: false,
    cors: 'unknown',
    currency: 'usd',
    highlights: {
      zh: '文笔出众，需海外网络与美元支付',
      en: 'Standout prose; needs a non-mainland network and USD payment',
    },
    note: {
      zh: '模型名以官方文档为准；性价比选 gpt-6.1-terra，追求效果选 gpt-6-astra（更贵）。',
      en: 'Model names follow the official docs; gpt-6.1-terra is the value pick, gpt-6-astra the top-end choice (pricier).',
    },
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-5-5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    docsUrl: 'https://docs.anthropic.com/',
    recommended: false,
    cors: 'unknown',
    currency: 'usd',
    highlights: {
      zh: '文笔细腻，擅长长篇，需海外网络',
      en: 'Beautiful prose and long-form storytelling; needs a non-mainland network',
    },
    note: {
      zh: '本页会自动补上浏览器直连所需的请求头；模型名以官方文档为准，另有 claude-opus-5-5、claude-haiku-5-5 可选。',
      en: 'This page automatically sends the header browsers need for direct access; model names follow the docs. claude-opus-5-5 and claude-haiku-5-5 are also available.',
    },
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/auto',
    keyUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/docs',
    recommended: false,
    cors: 'ok',
    currency: 'both',
    highlights: {
      zh: '一个 Key 用多家模型，自动挑选，适合爱尝鲜的人',
      en: 'One key, many models, picked automatically — great for tinkerers',
    },
    note: {
      zh: '费用以美元额度结算，不同模型价格差别大；模型名以官网文档为准。',
      en: 'Billed against USD credit, and prices vary a lot by model; model names follow the official docs.',
    },
  },
];

/** 常见问题：费用、连不上、安全、没有海外卡、以后换模型 */
export const GUIDE_FAQ = [
  {
    q: { zh: '玩这个游戏要花多少钱？', en: 'How much does it cost to play?' },
    a: {
      zh: '游戏本身完全免费。花钱的只有服务商：按你实际用掉的篇幅计费（他们叫「用量」），新手玩一局通常只要几分钱到几角钱。建议先充最小额度，觉得好玩再加。',
      en: 'The game itself is completely free. You only pay the provider for what you actually use — for a beginner, one session usually costs a few cents to well under a dollar. Start with the smallest top-up and add more only if you enjoy it.',
    },
  },
  {
    q: { zh: '点「测试连接」提示连不上，或者浏览器报错，怎么办？', en: 'What if “Test connection” fails or the browser shows an error?' },
    a: {
      zh: '多半是浏览器安全规则（CORS）挡住了，不是你的 Key 写错了。GLM、豆包这类服务商可能不允许网页直接访问；最省事的办法是换用 DeepSeek、Kimi、通义千问或 OpenRouter，它们允许网页直连。OpenAI、Anthropic 还需要海外网络。',
      en: 'It’s usually the browser’s security rules (CORS) blocking the request, not a wrong key. Some providers, such as GLM and Doubao, don’t allow direct access from web pages; the easiest fix is to switch to DeepSeek, Kimi, Qwen, or OpenRouter, which do. OpenAI and Anthropic additionally need a non-mainland network.',
    },
  },
  {
    q: { zh: '把 API Key 填在这个网页里安全吗？', en: 'Is it safe to paste my API key into this page?' },
    a: {
      zh: '安全。Key 只保存在你自己的浏览器里，只用来向你自己选的服务商发请求，不会上传到本项目的服务器；换一台设备要重新填。如果哪天不放心，去服务商控制台把它吊销、再建一个新的就行。',
      en: 'Yes. The key stays in your own browser and is only sent to the provider you chose — never to this project’s servers. On another device you’ll need to enter it again. If you ever feel unsure, revoke it in the provider’s console and create a new one.',
    },
  },
  {
    q: { zh: '没有海外信用卡、付不了美元，怎么办？', en: 'What if I don’t have an overseas card or can’t pay in USD?' },
    a: {
      zh: '不用折腾。DeepSeek、Kimi、通义千问都支持国内手机号注册，用人民币充值（具体付款方式以各官网为准）。这三家还能在浏览器里直连，最适合国内网络。',
      en: 'Then skip OpenAI and Anthropic. DeepSeek, Kimi, and Qwen sign up with a mainland phone number and top up in RMB — the exact payment options are listed on each site. Those three also work directly from a mainland browser, which makes them the easiest path.',
    },
  },
  {
    q: { zh: '以后想换模型或换服务商，要重新配置吗？', en: 'How do I switch models or providers later?' },
    a: {
      zh: '换模型最简单：在设置里把「模型名」改成新的就行，同一个 Key 继续用。换服务商则要选新的服务商、填它家的 Key；Base URL 大多会自动带出来，然后重新点一次「测试连接」。',
      en: 'Changing the model is easy: just edit the model name in Settings and keep the same key. Switching providers means choosing the new one, entering its key, and (usually auto-filled) its Base URL — then run “Test connection” once again.',
    },
  },
];

/** 教程数据版本，与发布版本保持一致 */
export const GUIDE_VERSION = '1.1.0';
