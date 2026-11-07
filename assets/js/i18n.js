/**
 * 无尽文游 / Appealing Words — 界面文案与本地化
 *
 * 约定：
 * - 所有界面文案只从本文件取；HTML 用 data-i18n="key"，JS 用 t(key, vars)。
 * - 占位符一律写成单花括号 {name}，由调用方的 t() 替换；中文/英文两侧占位符必须一致。
 * - 风格：古朴、克制、有文气；按钮短；错误提示要能指导下一步。
 * - 不写死任何网络流行语、翻译腔。英文为简洁 literary UI 语气。
 *
 * 导出的五个符号即对外契约，勿增删：
 *   LANGS / LANG_LABELS / STRINGS / NUMERALS / PROVIDER_PRESETS
 */

/** 可用界面语言，顺序即切换顺序 */
export const LANGS = ['zh', 'en'];

/** 语言在切换器上的显示名（各语言按自身文字书写） */
export const LANG_LABELS = {
  zh: '中文',
  en: 'English',
};

/**
 * 全量文案。zh 与 en 的 key 集合必须完全一致，且不得有空字符串。
 * key 组织：命名空间.字段，例如 game.errorAuth。
 */
export const STRINGS = {
  zh: {
    /* ────────── meta ────────── */
    'meta.title': '无尽文游 · 没有尽头的互动文字游戏',
    'meta.description': '纯前端互动文字游戏：四种题材、无限续写，自备模型接口；密钥与故事只留在你的浏览器。',

    /* ────────── common ────────── */
    'common.cancel': '取消',
    'common.confirm': '确认',
    'common.delete': '删除',
    'common.close': '关闭',
    'common.back': '返回',
    'common.loading': '载入中…',
    'common.retry': '重试',
    'common.unknown': '未知',
    'common.justNow': '方才',
    'common.minutesAgo': '{n} 分钟前',
    'common.hoursAgo': '{n} 小时前',
    'common.daysAgo': '{n} 天前',
    'common.unnamedSession': '无名残卷',
    'common.export': '导出',
    'common.import': '导入',
    'common.yes': '是',
    'common.no': '否',
    'common.copy': '复制',
    'common.copied': '已复制',

    /* ────────── brand ────────── */
    'brand.name': '无尽文游',
    'brand.nameEn': 'APPEALING WORDS',
    'brand.slogan': '没有尽头的互动文字游戏',
    'brand.footerNote': '字体 Fusion Pixel（OFL-1.1）· 渲染 KaTeX / Marked / DOMPurify · 无后端 · 密钥与残卷只存本机',

    /* ────────── nav：顶栏导航（按钮文案须短） ────────── */
    'nav.home': '主页',
    'nav.sessions': '档案',
    'nav.settings': '设置',

    /* ────────── a11y（供 aria-label / 屏幕阅读器） ────────── */
    'a11y.home': '回到首页',
    'a11y.sessions': '打开残卷',
    'a11y.settings': '打开设置',
    'a11y.langSwitch': '切换界面语言',
    'a11y.skipTyping': '跳过打字动画，立即显示全文',
    'a11y.send': '发送行动',
    'a11y.closeModal': '关闭对话框',
    'a11y.skipToContent': '跳到正文',

    /* ────────── onboarding：首次配置模型接口 ────────── */
    'onboarding.kicker': '序章',
    'onboarding.title': '落笔之前',
    'onboarding.desc': '无尽文游没有后端，也不代管密钥。接上你自己的模型，故事方可开始。',
    'onboarding.protocolLabel': '接口格式',
    'onboarding.protocolOpenai': 'OpenAI 格式',
    'onboarding.protocolAnthropic': 'Anthropic 格式',
    'onboarding.presetsLabel': '服务商',
    'onboarding.providerNote': '预置只作示例；地址与模型名以服务商文档为准。',
    'onboarding.baseUrlLabel': '接口地址',
    'onboarding.baseUrlPlaceholderOpenai': 'https://api.openai.com/v1',
    'onboarding.baseUrlPlaceholderAnthropic': 'https://api.anthropic.com/v1',
    'onboarding.baseUrlHint': '写到版本号为止，如 https://api.openai.com/v1；其余路径由程序补全。',
    'onboarding.apiKeyLabel': 'API Key',
    'onboarding.apiKeyHint': '只存本机浏览器，除服务商外不传他处。',
    'onboarding.showKey': '显示',
    'onboarding.hideKey': '隐藏',
    'onboarding.modelLabel': '模型',
    'onboarding.modelHint': '填服务商文档里的模型名，或推理接入点 ID，须与接口地址相符。',
    'onboarding.modelPlaceholder': 'gpt-4o',
    'onboarding.advancedSummary': '进阶设置',
    'onboarding.temperatureLabel': '温度',
    'onboarding.temperatureHint': '0 至 2，越高越放得开；叙事建议 0.8～1.0。',
    'onboarding.maxTokensLabel': '单回合上限',
    'onboarding.maxTokensHint': '每回合最多生成的 token 数；留空则用默认 2048。',
    'onboarding.extraHeadersLabel': '附加请求头',
    'onboarding.extraHeadersHint': 'JSON 对象格式；仅少数自建网关需要额外鉴权头。',
    'onboarding.extraHeadersPlaceholder': '{"HTTP-Referer": "https://your.site"}',
    'onboarding.testButton': '测试连接',
    'onboarding.testingButton': '测试中…',
    'onboarding.testSuccess': '连接成功，笔墨可通。',
    'onboarding.testFailed': '连接失败，请核对地址、密钥与模型名。',
    'onboarding.needBaseUrl': '请填写 Base URL',
    'onboarding.needModel': '请填写模型名',
    'onboarding.invalidUrl': 'Base URL 格式不正确，请检查',
    'onboarding.invalidHeaders': '额外请求头必须是合法的 JSON 对象',
    'onboarding.saveButton': '保存',
    'onboarding.saveButtonBusy': '保存中…',
    'onboarding.privacyNote': '密钥只存本机；清空站点数据即彻底抹去。',
    'onboarding.savedToast': '配置已保存',

    /* ────────── home：题目选择与近卷 ────────── */
    'home.kicker': '灯下开卷',
    'home.modesLabel': '择一卷',
    'home.modesHint': '每卷各有因果，模型会记得你在其中的每一步。',
    'home.recentLabel': '最近残卷',
    'home.recentEmpty': '尚无残卷。开一卷，故事便会留在这里。',
    'home.resumeButton': '续读',
    'home.apiConfigured': '已接入 {model}',
    'home.apiMissing': '未接模型',
    'home.configureButton': '配置接口',
    'home.sessionMeta': '{mode} · {turns} 回合 · {date}',
    'home.deleteSession': '删除',
    'home.sessionDeleteConfirm': '删除这卷？此卷将自本机抹去，不可复得。',
    'home.playMode': '开卷',
    'home.footerNote': '没有尽头的互动文字游戏 · 一切数据只留本机',
    'home.newSessionButton': '另开一卷',

    /* ────────── game：对局界面 ────────── */
    'game.turnLabel': '第 {n} 回合',
    'game.streaming': '续写中…',
    'game.thinking': '凝思中…',
    'game.choicesTitle': '此刻，你如何抉择？',
    'game.freePlaceholder': '自行落笔，写下你的行动',
    'game.freeSend': '送出',
    'game.skip': '跳过',
    'game.retry': '重试',
    'game.errorTitle': '续写中断',
    'game.errorCors': '浏览器拦下了这次请求，多半是接口未开放跨域。可换用支持 CORS 的地址，或经本地代理转发。',
    'game.errorAuth': '密钥未获认可。请到设置里核对 API Key 与接口地址。',
    'game.errorRate': '请求过密或额度已尽。请稍候再试，或换一个模型。',
    'game.errorGeneric': '未能续写：{message}',
    'game.errorEmpty': '模型未发一言。可重试一次，或换一个模型。',
    'game.errorTimeout': '请求超时，请稍后重试',
    'game.playerChoiceLabel': '你',
    'game.languageSwitched': '语言已切至 {lang}。',
    'game.savedToast': '此回合已存。',
    'game.contextInfo': '往来 {n} 则',
    'game.quitConfirm': '离开这卷？尚未写完的这一回合会失去。',
    'game.newSessionButton': '另开一卷',
    'game.fallbackBranch': '未能辨明抉择，暂拟三途。',
    'game.connecting': '接通中…',

    /* ────────── sessions：残卷档案 ────────── */
    'sessions.title': '残卷',
    'sessions.count': '{count} 卷',
    'sessions.empty': '尚无残卷。待你开卷，旧事自会留痕。',
    'sessions.continue': '续读',
    'sessions.delete': '删除',
    'sessions.deleteConfirm': '删除这卷后不可恢复，确定？',
    'sessions.close': '关闭',
    'sessions.deletedToast': '残卷已删除。',
    'sessions.corruptToast': '这卷已损，读不出内容。',

    /* ────────── settings：设置面板 ────────── */
    'settings.title': '设置',
    'settings.tabApi': '接口',
    'settings.tabAppearance': '外观',
    'settings.tabData': '数据',
    'settings.tabAbout': '关于',
    'settings.apiSectionTitle': '模型接口',
    'settings.apiSectionHint': '换一处接口，下一页故事便换一种声音。',
    'settings.saveButton': '保存',
    'settings.savedToast': '设置已存。',
    'settings.testButton': '测试连接',
    'settings.testingButton': '测试中…',
    'settings.testSuccess': '连接成功。',
    'settings.testFailed': '连接失败，请核对地址、密钥与模型名。',
    'settings.layoutLabel': '版式',
    'settings.layoutAuto': '自动',
    'settings.layoutLandscape': '横屏',
    'settings.layoutPortrait': '竖屏',
    'settings.speedLabel': '打字速度',
    'settings.speedSlow': '慢',
    'settings.speedNormal': '适中',
    'settings.speedFast': '快',
    'settings.speedInstant': '立现',
    'settings.soundLabel': '音效',
    'settings.soundOn': '开',
    'settings.soundOff': '关',
    'settings.dataSectionTitle': '本机数据',
    'settings.dataHint': '一切都只在此处：导出可备份，导入可迁移，清空则如初。',
    'settings.exportButton': '导出',
    'settings.importButton': '导入',
    'settings.clearButton': '清空',
    'settings.clearConfirm': '清空全部配置与残卷？此操作不可撤销。',
    'settings.clearedToast': '已清空，如初。',
    'settings.exportedToast': '已导出。',
    'settings.importedToast': '已导入。',
    'settings.importFailedToast': '导入失败：文件格式不符。',
    'settings.aboutTitle': '关于无尽文游',
    'settings.aboutDesc': '没有尽头的互动文字游戏。你写下行动，模型续写世界；一卷接一卷，故事不会先于你停笔。',
    'settings.aboutRepo': '源码仓库',
    'settings.aboutIssues': '问题反馈',
    'settings.aboutStack': '原生 HTML / CSS / JS，零后端；Marked / KaTeX / DOMPurify 负责渲染，Fusion Pixel（OFL-1.1）为字。',
    'settings.aboutPrivacy': '无后端、无账号、无追踪；API Key 与残卷只存于本机浏览器。',
    'settings.aboutDevice': '当前设备：{device}',
    'settings.deviceMobile': '手机',
    'settings.deviceDesktop': '桌面',
    'settings.version': '版本 {version}',
    'settings.closeButton': '关闭',

    /* ────────── confirm：通用确认框 ────────── */
    'confirm.title': '请确认',
    'confirm.ok': '确认',
    'confirm.cancel': '取消',

    /* ────────── status：状态条 ────────── */
    'status.ready': '静候',
    'status.streaming': '续写中',
    'status.error': '出错',
    'status.saved': '已存',
    'status.provider': '模型：{model}',
    'status.context': '上下文 {n}',

    /* ────────── toast：轻提示 ────────── */
    'toast.langSwitched': '语言已切至 {lang}',
    'toast.configSaved': '配置已保存',
    'toast.sessionSaved': '残卷已存',
    'toast.storageError': '本地存储写入失败，请检查浏览器存储空间',

    /* ────────── api：测试连接用 ────────── */
    'api.testMessage': '请只回复两个字：可用',
  },

  en: {
    /* ────────── meta ────────── */
    'meta.title': 'Appealing Words · An Interactive Story That Never Ends',
    'meta.description': 'A pure front-end interactive story: four worlds, endless continuation, your own model endpoint. Keys and tales stay in your browser.',

    /* ────────── common ────────── */
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.delete': 'Delete',
    'common.close': 'Close',
    'common.back': 'Back',
    'common.loading': 'Loading…',
    'common.retry': 'Retry',
    'common.unknown': 'Unknown',
    'common.justNow': 'Just now',
    'common.minutesAgo': '{n} minutes ago',
    'common.hoursAgo': '{n} hours ago',
    'common.daysAgo': '{n} days ago',
    'common.unnamedSession': 'Untitled story',
    'common.export': 'Export',
    'common.import': 'Import',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.copy': 'Copy',
    'common.copied': 'Copied',

    /* ────────── brand ────────── */
    'brand.name': 'Appealing Words',
    'brand.nameEn': 'APPEALING WORDS',
    'brand.slogan': 'An interactive story that never ends.',
    'brand.footerNote': 'Type: Fusion Pixel (OFL-1.1) · Rendering: KaTeX / Marked / DOMPurify · No backend · Keys and tales stay on this device',

    /* ────────── nav ────────── */
    'nav.home': 'Home',
    'nav.sessions': 'Archive',
    'nav.settings': 'Settings',

    /* ────────── a11y ────────── */
    'a11y.home': 'Back to home',
    'a11y.sessions': 'Open saved stories',
    'a11y.settings': 'Open settings',
    'a11y.langSwitch': 'Switch interface language',
    'a11y.skipTyping': 'Skip the typing animation and show the full text',
    'a11y.send': 'Send action',
    'a11y.closeModal': 'Close dialog',
    'a11y.skipToContent': 'Skip to the story',

    /* ────────── onboarding ────────── */
    'onboarding.kicker': 'Prologue',
    'onboarding.title': 'Before the First Word',
    'onboarding.desc': 'Appealing Words has no backend and keeps no keys. Connect your own model, and the story can begin.',
    'onboarding.protocolLabel': 'API format',
    'onboarding.protocolOpenai': 'OpenAI format',
    'onboarding.protocolAnthropic': 'Anthropic format',
    'onboarding.presetsLabel': 'Provider',
    'onboarding.providerNote': "Presets are examples only — confirm the endpoint and model name in your provider's docs.",
    'onboarding.baseUrlLabel': 'Base URL',
    'onboarding.baseUrlPlaceholderOpenai': 'https://api.openai.com/v1',
    'onboarding.baseUrlPlaceholderAnthropic': 'https://api.anthropic.com/v1',
    'onboarding.baseUrlHint': 'Stop at the version path, e.g. https://api.openai.com/v1 — the rest is appended for you.',
    'onboarding.apiKeyLabel': 'API key',
    'onboarding.apiKeyHint': 'Stored only in this browser; it goes nowhere but your provider.',
    'onboarding.showKey': 'Show',
    'onboarding.hideKey': 'Hide',
    'onboarding.modelLabel': 'Model',
    'onboarding.modelHint': "Use the exact model name or inference endpoint ID from your provider's docs, matching this URL.",
    'onboarding.modelPlaceholder': 'gpt-4o',
    'onboarding.advancedSummary': 'Advanced settings',
    'onboarding.temperatureLabel': 'Temperature',
    'onboarding.temperatureHint': '0 to 2; higher runs freer. 0.8–1.0 suits storytelling.',
    'onboarding.maxTokensLabel': 'Max tokens',
    'onboarding.maxTokensHint': 'Most tokens per turn; leave empty to use the default of 2048.',
    'onboarding.extraHeadersLabel': 'Extra headers',
    'onboarding.extraHeadersHint': 'A JSON object; only some self-hosted gateways need extra auth headers.',
    'onboarding.extraHeadersPlaceholder': '{"HTTP-Referer": "https://your.site"}',
    'onboarding.testButton': 'Test connection',
    'onboarding.testingButton': 'Testing…',
    'onboarding.testSuccess': 'Connected. The ink is ready.',
    'onboarding.testFailed': 'Connection failed. Check the endpoint, key, and model name.',
    'onboarding.needBaseUrl': 'Please enter a Base URL',
    'onboarding.needModel': 'Please enter a model name',
    'onboarding.invalidUrl': "That Base URL doesn't look right",
    'onboarding.invalidHeaders': 'Extra headers must be a valid JSON object',
    'onboarding.saveButton': 'Save',
    'onboarding.saveButtonBusy': 'Saving…',
    'onboarding.privacyNote': 'Your key stays in this browser. Clearing site data erases it.',
    'onboarding.savedToast': 'Configuration saved',

    /* ────────── home ────────── */
    'home.kicker': 'Open a tale',
    'home.modesLabel': 'Choose a tale',
    'home.modesHint': 'Each tale has its own logic. The model remembers every step you take.',
    'home.recentLabel': 'Recent stories',
    'home.recentEmpty': 'No stories yet. Begin one, and it will be kept here.',
    'home.resumeButton': 'Resume',
    'home.apiConfigured': 'Connected to {model}',
    'home.apiMissing': 'No model connected',
    'home.configureButton': 'Configure',
    'home.sessionMeta': '{mode} · {turns} turns · {date}',
    'home.deleteSession': 'Delete',
    'home.sessionDeleteConfirm': 'Delete this story? It leaves this device for good.',
    'home.playMode': 'Begin',
    'home.footerNote': 'An interactive story that never ends · Everything stays on this device',
    'home.newSessionButton': 'New story',

    /* ────────── game ────────── */
    'game.turnLabel': 'Turn {n}',
    'game.streaming': 'Writing…',
    'game.thinking': 'Thinking…',
    'game.choicesTitle': 'What will you do?',
    'game.freePlaceholder': 'Write your own action',
    'game.freeSend': 'Send',
    'game.skip': 'Skip',
    'game.retry': 'Retry',
    'game.errorTitle': 'The writing stopped',
    'game.errorCors': 'The browser blocked the request — most likely CORS. Use an endpoint that allows cross-origin calls, or route it through a local proxy.',
    'game.errorAuth': 'The key was rejected. Check your API key and endpoint in Settings.',
    'game.errorRate': 'Too many requests, or the quota is spent. Wait a moment, or switch models.',
    'game.errorGeneric': 'The story could not continue: {message}',
    'game.errorEmpty': 'The model returned nothing. Try again, or switch models.',
    'game.errorTimeout': 'The request timed out. Please try again',
    'game.playerChoiceLabel': 'You',
    'game.languageSwitched': 'Language switched to {lang}.',
    'game.savedToast': 'Turn saved.',
    'game.contextInfo': '{n} messages remembered',
    'game.quitConfirm': 'Leave this story? The turn still being written will be lost.',
    'game.newSessionButton': 'New story',
    'game.fallbackBranch': 'The choices were unclear — three paths, for now.',
    'game.connecting': 'Connecting…',

    /* ────────── sessions ────────── */
    'sessions.title': 'Archive',
    'sessions.count': '{count} stories',
    'sessions.empty': 'No stories yet. Begin one, and old journeys will gather here.',
    'sessions.continue': 'Continue',
    'sessions.delete': 'Delete',
    'sessions.deleteConfirm': 'This story cannot be recovered once deleted. Continue?',
    'sessions.close': 'Close',
    'sessions.deletedToast': 'Story deleted.',
    'sessions.corruptToast': 'This story is damaged and cannot be read.',

    /* ────────── settings ────────── */
    'settings.title': 'Settings',
    'settings.tabApi': 'API',
    'settings.tabAppearance': 'Display',
    'settings.tabData': 'Data',
    'settings.tabAbout': 'About',
    'settings.apiSectionTitle': 'Model endpoint',
    'settings.apiSectionHint': 'Change the endpoint, and the next page speaks in another voice.',
    'settings.saveButton': 'Save',
    'settings.savedToast': 'Settings saved.',
    'settings.testButton': 'Test connection',
    'settings.testingButton': 'Testing…',
    'settings.testSuccess': 'Connected.',
    'settings.testFailed': 'Connection failed. Check the endpoint, key, and model name.',
    'settings.layoutLabel': 'Layout',
    'settings.layoutAuto': 'Auto',
    'settings.layoutLandscape': 'Landscape',
    'settings.layoutPortrait': 'Portrait',
    'settings.speedLabel': 'Typing speed',
    'settings.speedSlow': 'Slow',
    'settings.speedNormal': 'Normal',
    'settings.speedFast': 'Fast',
    'settings.speedInstant': 'Instant',
    'settings.soundLabel': 'Sound',
    'settings.soundOn': 'On',
    'settings.soundOff': 'Off',
    'settings.dataSectionTitle': 'Your data',
    'settings.dataHint': 'Everything lives here: export to back up, import to move, clear for a clean slate.',
    'settings.exportButton': 'Export',
    'settings.importButton': 'Import',
    'settings.clearButton': 'Clear',
    'settings.clearConfirm': 'Erase all settings and stories? This cannot be undone.',
    'settings.clearedToast': 'Cleared. A clean slate.',
    'settings.exportedToast': 'Exported.',
    'settings.importedToast': 'Imported.',
    'settings.importFailedToast': 'Import failed: the file is not a valid backup.',
    'settings.aboutTitle': 'About Appealing Words',
    'settings.aboutDesc': 'An interactive story that never ends. You act; the model writes the world onward. Scroll after scroll, the story ends only when you do.',
    'settings.aboutRepo': 'Repository',
    'settings.aboutIssues': 'Report an issue',
    'settings.aboutStack': 'Vanilla HTML / CSS / JS with no backend. Rendering by Marked / KaTeX / DOMPurify; type by Fusion Pixel (OFL-1.1).',
    'settings.aboutPrivacy': 'No backend, no accounts, no tracking. Your API key and your stories live only in this browser.',
    'settings.aboutDevice': 'Current device: {device}',
    'settings.deviceMobile': 'Mobile',
    'settings.deviceDesktop': 'Desktop',
    'settings.version': 'Version {version}',
    'settings.closeButton': 'Close',

    /* ────────── confirm ────────── */
    'confirm.title': 'Please confirm',
    'confirm.ok': 'Confirm',
    'confirm.cancel': 'Cancel',

    /* ────────── status ────────── */
    'status.ready': 'Ready',
    'status.streaming': 'Writing',
    'status.error': 'Error',
    'status.saved': 'Saved',
    'status.provider': 'Model: {model}',
    'status.context': 'Context {n}',

    /* ────────── toast ────────── */
    'toast.langSwitched': 'Language switched to {lang}',
    'toast.configSaved': 'Configuration saved',
    'toast.sessionSaved': 'Story saved',
    'toast.storageError': 'Could not save locally. Check your browser storage',

    /* ────────── api ────────── */
    'api.testMessage': 'Reply with a single word: ready.',
  },
};

/**
 * 选项序号。中文用汉字数字，英文用两位数补零。
 * 选项数量为 3~4，预留至五。
 */
export const NUMERALS = {
  zh: ['一', '二', '三', '四', '五'],
  en: ['01', '02', '03', '04', '05'],
};

/**
 * 服务商预置。顺序即界面展示顺序，不要调整。
 * - protocol 只能是 'openai' 或 'anthropic'；
 * - baseUrl 填到版本号为止（调用时程序补全 /chat/completions 或 /messages）；
 * - model 仅为示例，模型名以服务商文档为准；
 * - custom 的 baseUrl / model 留空，交给玩家自填。
 * label 用各服务商的通用英文写法，避免随界面语言变化。
 */
export const PROVIDER_PRESETS = [
  { id: 'openai', label: 'OpenAI', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  { id: 'anthropic', label: 'Anthropic', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5' },
  { id: 'deepseek', label: 'DeepSeek', protocol: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'glm', label: 'GLM', protocol: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus' },
  { id: 'qwen', label: 'Qwen', protocol: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'kimi', label: 'Kimi', protocol: 'openai', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { id: 'doubao', label: 'Doubao', protocol: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-1-6-250615' },
  { id: 'openrouter', label: 'OpenRouter', protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o' },
  { id: 'custom', label: 'Custom', protocol: 'openai', baseUrl: '', model: '' },
];
