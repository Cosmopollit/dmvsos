// Group helper logic for @dmvsos_support_bot.
//
// Detects DMV-related questions in group chats and replies once per hour
// per chat. State-aware: if the user mentions a US state by name (EN/RU/UA/ES)
// or its 2-letter code, the reply links straight to dmvsos.com/<state>.
//
// Used by app/api/telegram/route.js for non-command group messages.

import { STATE_OPTIONS, stateToSlug } from './states.js';

// ── Triggers: 3-tier matching ────────────────────────────────────────────
// 1. STRONG: phrase implies "looking for prep" by itself (e.g. "practice questions").
//    Fires alone, no intent needed.
// 2. CONTEXT + INTENT: a DMV word + a "where/how/recommend/?" signal.
// 3. CONTEXT × 2: two distinct DMV-related words in one message (e.g.
//    "DMV permit California tomorrow") — strong-enough signal of intent.
//
// Bias: in silent mode a false positive costs ~2 seconds (delete DM). A false
// negative costs a lead. So we lean broad.

// ── STRONG: these alone fire ─────────────────────────────────────────────
const STRONG_PATTERNS = [
  // English
  /\bpractice\s+(?:test|questions?|exam)\b/i,
  /\bstudy\s+(?:guide|materials?|app|site)\b/i,
  /\bcheat\s+sheet\b/i,
  /\bDMV\s+(?:prep|practice|study|app|site|questions?|test\s+prep)\b/i,
  /\bCDL\s+(?:prep|practice|study|app|site|questions?|test\s+prep|school)\b/i,
  /\bsample\s+questions?\b/i,
  // Russian
  /вопросы\s+(?:к|для|на|по)\s*(?:dmv|правам|cdl|сдаче|экзамен|тест)/iu,
  /ответы\s+(?:к|для|на|по)\s*(?:dmv|правам|cdl|тест)/iu,
  /тест(?:ы|ик|ики)?\s+(?:к|для|на|по)\s*(?:dmv|правам|cdl)/iu,
  /шпаргалк[аи]\s+(?:к|для|на|по)?\s*(?:dmv|правам|cdl|сдач)/iu,
  /подготовка\s+(?:к|для|на|по)\s*(?:dmv|сдач|правам|cdl|тест|экзамен)/iu,
  // Ukrainian
  /питання\s+(?:до|для|на|по)\s*(?:dmv|прав|cdl|тест|іспит)/iu,
  /відповіді\s+(?:до|для|на|по)\s*(?:dmv|прав|cdl|тест)/iu,
  /підготовка\s+(?:до|для|на|по)\s*(?:dmv|здач|прав|cdl|тест|іспит)/iu,
  // Spanish
  /\bpreguntas?\s+(?:de|para|del)\s+(?:dmv|examen|manejo|conducir|cdl|teor[ií]a)/i,
  /\brespuestas?\s+(?:de|para|del)\s+(?:dmv|examen|manejo|cdl)/i,
  /\bestudiar\s+(?:para|el|la)\s+(?:dmv|examen|licencia|cdl|conducir)/i,
  /\bgu[ií]a\s+de\s+estudio\b/i,
  /\bapp\s+(?:de|para)\s+(?:dmv|examen|conducir|manejo)/i,
];

// ── INTENT signals — broadened with slang, typos, prep verbs ─────────────
const INTENT_PATTERNS = [
  // English
  /\b(where|how|which|what|who|when|why|recommends?|suggests?|best|good|any(?:one|body)\s+(?:know|knows|got|has|have|tried|recommend|used)|y'?all\s+know|looking\s+for|need(?:s|ed)?|want\s+to|wanna|gonna|trying\s+to|help\s*me|advise|advice|tips?|hints?|study(?:ing)?|prepare|preparing|prep|practice|practicing|review|share|got\s+(?:any|some)|first\s+time|scared|nervous|hard|difficult|easy|tomorrow|next\s+week|soon)\b/i,
  // Russian
  /(?:^|[^\p{L}])(где|как|чем|какой|какие|какую|когда|почему|посоветуй\w*|подскажи\w*|помоги\w*|нужен|нужно|нужна|нужны|совет\w*|готов\w*|подготов\w*|учить|изучать|учу|учим|сдаю|сдаём|собираюсь|хочу\s+сдать|первый\s+раз|поделит\w*|поделись|расскажи\w*|кто\s+сдавал|кто\s+знает|трудно|сложно|боюсь|боялся|боялась|страшно|завтра|на\s+днях)/iu,
  // Ukrainian
  /(?:^|[^\p{L}])(де|як|чим|який|які|яку|коли|чому|порадь\w*|підкаж\w*|допоможіть|допоможи|потрібен|потрібно|потрібна|треба|поради|порадь|готую\w*|підготов\w*|вчити|вивчати|вчу|вчимо|складаю|здаю|збираюсь|хочу\s+скласти|перший\s+раз|поділ\w*|розкажи\w*|хто\s+склав|хто\s+знає|важко|складно|боюс\w*|страшно|завтра|днями)/iu,
  // Spanish
  /\b(d[oó]nde|c[oó]mo|cu[aá]l|cu[aá]les|qu[eé]|qui[eé]n|cu[aá]ndo|por\s*qu[eé]|recomiend\w*|sugier\w*|alguien\s+(?:sabe|conoce|tiene|ha\s+probado|ha\s+usado|me\s+ayuda)|busc\w*|necesit\w*|quiero|voy\s+a|ayuda|ayude\w*|consejo|consejos|tip|tips|estudi\w*|prepar\w*|practic\w*|repas\w*|comparte\w*|primera\s+vez|miedo|nervios\w*|dif[ií]cil|f[aá]cil|ma[nñ]ana|pr[oó]ximo|pronto)\b/i,
  // Chinese
  /哪里|哪儿|怎么|怎样|推荐|建议|有人知道|准备|学习|考试|帮助|怎么办|有谁|分享/,
];

// ── CONTEXT — DMV/license vocabulary (broader, includes slang/abbrev) ────
const CONTEXT_PATTERNS = [
  // English
  /\b(dmv|cdl|dol|driver(?:'?s)?\s+(?:license|licence|permit|test|manual|handbook|ed|education)|driving\s+(?:test|license|licence|permit|manual|school|exam)|learner(?:'?s)?\s+permit|road\s+test|written\s+test|knowledge\s+test|written\s+exam|theory\s+test|DL\s+test|\bDL\b|class\s+[abc]\b|trucker\s+(?:license|test|exam)|commercial\s+(?:license|driver))\b/i,
  // Russian — extended slang; allow "прав" standalone form before non-letter.
  // NOTE: only forward-looking verb forms (infinitive/future/present-imperfective)
  // are in CONTEXT. Past perfective (сдал, сдала) excluded — those are people
  // already celebrating, not asking for prep.
  /(?:^|[^\p{L}])(дмв|dmv|cdl|cdl[а-я]*|права|правах|правам|правами|прав(?=[^\p{L}]|$)|правишк[аи]|водительск[а-я]+|вождени[ея]|вожу|пермит[а-я]*|сдавать|сдавая|сдаваю|сдаваем|сдавая|сдаём|сдать|сдам(?:[еи]те)?|сдашь|сдаст|сдают|сдаю|сдай(?:те)?|сдаваль[а-я]+|корочк[аи]|вод\.?\s*удосто|пдд|тест[а-я]*\s+на\s+прав)/iu,
  // Ukrainian — same logic, only forward-looking forms
  /(?:^|[^\p{L}])(дмв|dmv|cdl|cdl[а-я]*|прав[аи]|правах|правам|правами|прав(?=[^\p{L}]|$)|водійськ[а-я]+|водіння|пермит|здавати|здавая|здаваємо|здаємо|здати|здам|здаю|здаси|здасть|здають|здайте|корочк[аи]|посвідчення\s+водія|пдр)/iu,
  // Spanish — extended
  /\b(dmv|cdl|dol|licencia\s+(?:de\s+)?(?:conducir|manejar|conductor)|examen\s+(?:de\s+)?(?:manejo|conducir|teor[ií]a|escrito|conduct\w+)|permiso\s+(?:de\s+aprendiz|provisional)|prueba\s+(?:de\s+manejo|escrita|de\s+conducir)|carnet\s+de\s+(?:conducir|manejar)|manejar|conducir(?:\s+un\s+(?:auto|carro|coche))?)\b/i,
  // Chinese
  /驾照|驾驶证|驾驶执照|路考|笔试|cdl|考驾照/i,
];

// CDL — highest-value lead flag ($49.99 product)
const CDL_PATTERN = /\bcdl\b|cdl[а-я]+|trucker\s+(?:license|test)|commercial\s+driver|class\s+a\s+(?:license|cdl)|права\s+на\s+(?:грузови[кч]|трак)|водительск\w+\s+на\s+грузови/i;

// ── State detection ──────────────────────────────────────────────────────
// Build name + 2-letter code + Cyrillic alias map → slug.
const STATE_ALIASES = {
  // Cyrillic (most common only — exhaustive list is overkill at this scale)
  'калифорни': 'california', 'техас': 'texas', 'флорид': 'florida',
  'нью-йорк': 'new-york', 'нью йорк': 'new-york', 'ньюйорк': 'new-york',
  'вашингтон': 'washington', 'иллинойс': 'illinois', 'джорджи': 'georgia',
  'вирджини': 'virginia', 'аризон': 'arizona', 'пенсильвани': 'pennsylvania',
  'нью-джерси': 'new-jersey', 'нью джерси': 'new-jersey',
  'северн.*каролин': 'north-carolina', 'южн.*каролин': 'south-carolina',
  'массачусетс': 'massachusetts', 'огайо': 'ohio', 'мичиган': 'michigan',
  'орегон': 'oregon', 'невад': 'nevada', 'мэрилэнд': 'maryland', 'мэриленд': 'maryland',
  'колорадо': 'colorado', 'аляска': 'alaska', 'гавайи': 'hawaii',
};

// State names: case-insensitive (longest first to avoid prefix collisions).
// State codes: UPPERCASE-only — otherwise "de", "or", "in" etc. blow up in any sentence.
const STATE_PATTERNS = [
  // RU/UA Cyrillic aliases first (no overlap with EN words)
  ...Object.entries(STATE_ALIASES).map(([alias, slug]) => ({
    slug,
    re: new RegExp(alias, 'iu'),
  })),
  // EN full names, longest first so "New York" beats "York"
  ...STATE_OPTIONS
    .map(opt => ({
      slug: stateToSlug(opt),
      name: opt.replace(/\s*\([A-Z]{2}\)\s*$/, '').trim(),
    }))
    .sort((a, b) => b.name.length - a.name.length)
    .map(({ slug, name }) => ({ slug, re: new RegExp(`\\b${escape(name)}\\b`, 'i') })),
  // 2-letter codes, case-SENSITIVE (must be uppercase)
  ...STATE_OPTIONS.map(opt => ({
    slug: stateToSlug(opt),
    code: opt.match(/\(([A-Z]{2})\)/)?.[1],
  })).filter(x => x.code).map(({ slug, code }) => ({ slug, re: new RegExp(`\\b${code}\\b`) })),
];

function escape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function detectState(text) {
  for (const { slug, re } of STATE_PATTERNS) {
    if (re.test(text)) return slug;
  }
  return null;
}

export function matchTrigger(text) {
  // Tier 1: STRONG patterns fire alone
  for (const re of STRONG_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0].trim();
  }

  // Find CONTEXT matches — collect ALL distinct hits across languages
  const contextHits = [];
  for (const re of CONTEXT_PATTERNS) {
    const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
    const reGlobal = new RegExp(re.source, flags);
    let m;
    while ((m = reGlobal.exec(text)) !== null) {
      const hit = m[0].trim().toLowerCase();
      if (!contextHits.includes(hit)) contextHits.push(hit);
      if (reGlobal.lastIndex === m.index) reGlobal.lastIndex++; // avoid zero-width loop
    }
  }
  if (contextHits.length === 0) return null;

  // Tier 2: CONTEXT + INTENT/question
  const hasIntent = INTENT_PATTERNS.some(re => re.test(text));
  const hasQuestion = /[?？¿]/.test(text);
  if (hasIntent || hasQuestion) return contextHits[0];

  // Tier 3: TWO distinct context words = strong enough signal
  if (contextHits.length >= 2) return contextHits.join(' + ');

  return null;
}

export function detectCdl(text) {
  return CDL_PATTERN.test(text);
}

// ── Reply composition ────────────────────────────────────────────────────
export function composeReply(lang, stateSlug, userName) {
  const stateName = stateSlug
    ? STATE_OPTIONS.find(o => stateToSlug(o) === stateSlug)?.replace(/\s*\([A-Z]{2}\)\s*$/, '') || stateSlug
    : null;

  const link = stateSlug
    ? `https://dmvsos.com/category?state=${stateSlug}&lang=${lang}`
    : `https://dmvsos.com/?lang=${lang}`;

  const M = {
    en: stateName
      ? `👋 Hi ${userName}! For ${stateName} — practice questions from the official handbook (5 languages, free start): ${link}`
      : `👋 Hi ${userName}! Free DMV practice for all 50 states (5 languages): ${link}`,
    ru: stateName
      ? `👋 Привет, ${userName}! По ${stateName} — вопросы из официального handbook (5 языков, бесплатный старт): ${link}`
      : `👋 Привет, ${userName}! Бесплатная подготовка к DMV для всех 50 штатов (5 языков): ${link}`,
    ua: stateName
      ? `👋 Привіт, ${userName}! По ${stateName} — питання з офіційного handbook (5 мов, безкоштовний старт): ${link}`
      : `👋 Привіт, ${userName}! Безкоштовна підготовка до DMV для всіх 50 штатів: ${link}`,
    es: stateName
      ? `👋 ¡Hola ${userName}! Para ${stateName} — preguntas del manual oficial (5 idiomas, gratis): ${link}`
      : `👋 ¡Hola ${userName}! Práctica DMV gratis para los 50 estados (5 idiomas): ${link}`,
    zh: stateName
      ? `👋 你好 ${userName}！${stateName} 官方手册练习题（5种语言，免费开始）：${link}`
      : `👋 你好 ${userName}！全美50州DMV免费练习（5种语言）：${link}`,
  };

  return M[lang] || M.en;
}

// ── Category detection (for DM free-form) ────────────────────────────────
export function detectCategory(text) {
  if (/\b(cdl|trucker|commercial(?:\s+driver)?|class\s+a)\b/i.test(text)) return 'cdl';
  if (/\b(motorcycle|motorbike|moto(?!r)|\bbike)\b/i.test(text) || /(?:^|[^\p{L}])(мото|мотоцикл)/iu.test(text)) return 'moto';
  if (/\b(car|auto(?!matic)|driving|dmv)\b/i.test(text) || /(?:^|[^\p{L}])(машин|авто(?!мат))/iu.test(text)) return 'car';
  return null;
}

// ── Inline keyboards ─────────────────────────────────────────────────────
const MENU_LABELS = {
  en: {
    pricing: '💰 Pricing', manuals: '📚 Manuals', site: '🌐 Site', partnership: '🤝 Partnership',
    docs: '📋 Notary / Translations', contact: '💬 Message me', bugs: '🐛 Report bug',
    back: '← Back to menu', states_all: '🇺🇸 All 50 states →',
    car: '🚗 Car / DMV', cdl: '🚛 CDL Pro', moto: '🏍️ Motorcycle', back_states: '← States',
    open_site: '🌐 Open dmvsos.com',
  },
  ru: {
    pricing: '💰 Цены', manuals: '📚 Мануалы', site: '🌐 Сайт', partnership: '🤝 Сотрудничество',
    docs: '📋 Нотариус / Переводы', contact: '💬 Написать', bugs: '🐛 Сообщить о баге',
    back: '← В меню', states_all: '🇺🇸 Все 50 штатов →',
    car: '🚗 Авто / DMV', cdl: '🚛 CDL Pro', moto: '🏍️ Мото', back_states: '← Штаты',
    open_site: '🌐 Открыть dmvsos.com',
  },
  ua: {
    pricing: '💰 Ціни', manuals: '📚 Мануали', site: '🌐 Сайт', partnership: '🤝 Співпраця',
    docs: '📋 Нотаріус / Переклади', contact: '💬 Написати', bugs: '🐛 Повідомити про баг',
    back: '← В меню', states_all: '🇺🇸 Усі 50 штатів →',
    car: '🚗 Авто / DMV', cdl: '🚛 CDL Pro', moto: '🏍️ Мото', back_states: '← Штати',
    open_site: '🌐 Відкрити dmvsos.com',
  },
  es: {
    pricing: '💰 Precios', manuals: '📚 Manuales', site: '🌐 Sitio', partnership: '🤝 Colaboración',
    docs: '📋 Notario / Traducciones', contact: '💬 Escríbeme', bugs: '🐛 Reportar bug',
    back: '← Volver', states_all: '🇺🇸 Los 50 estados →',
    car: '🚗 Auto / DMV', cdl: '🚛 CDL Pro', moto: '🏍️ Moto', back_states: '← Estados',
    open_site: '🌐 Abrir dmvsos.com',
  },
  zh: {
    pricing: '💰 价格', manuals: '📚 手册', site: '🌐 网站', partnership: '🤝 合作',
    docs: '📋 公证 / 翻译', contact: '💬 联系我', bugs: '🐛 报告bug',
    back: '← 返回', states_all: '🇺🇸 全部50个州 →',
    car: '🚗 汽车 / DMV', cdl: '🚛 CDL Pro', moto: '🏍️ 摩托', back_states: '← 州',
    open_site: '🌐 打开 dmvsos.com',
  },
};

// Per-language menu structure. EN is simple; others get the full service set.
const MENU_STRUCTURE = {
  en: { full: false },
  ru: { full: true },
  ua: { full: true },
  es: { full: true },
  zh: { full: true },
};

// Top-6 states by DMV exam search volume — covers ~60% of traffic
const TOP_STATES = [
  { slug: 'california', icon: '🌅', name: 'California' },
  { slug: 'texas', icon: '🤠', name: 'Texas' },
  { slug: 'florida', icon: '🏖️', name: 'Florida' },
  { slug: 'new-york', icon: '🏙️', name: 'New York' },
  { slug: 'new-jersey', icon: '🌉', name: 'New Jersey' },
  { slug: 'illinois', icon: '🌽', name: 'Illinois' },
];

function L(lang, key) { return (MENU_LABELS[lang] || MENU_LABELS.en)[key]; }

// Universal multilingual prompt — first message users see, before they've picked a lang.
export const LANG_PICKER_TEXT = '🌐 <b>Choose your language</b>\n🇷🇺 Выберите язык\n🇺🇦 Оберіть мову\n🇪🇸 Elige idioma\n🇨🇳 选择您的语言';

export function languagePickerKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🇺🇸 English', callback_data: 'lang:en' }],
      [{ text: '🇷🇺 Русский', callback_data: 'lang:ru' }, { text: '🇺🇦 Українська', callback_data: 'lang:ua' }],
      [{ text: '🇪🇸 Español', callback_data: 'lang:es' }, { text: '🇨🇳 中文', callback_data: 'lang:zh' }],
    ],
  };
}

export function mainMenuKeyboard(lang) {
  const siteUrl = `https://dmvsos.com?lang=${lang}`;
  const manualsUrl = `https://dmvsos.com/manuals?lang=${lang}`;
  const full = MENU_STRUCTURE[lang]?.full;

  if (!full) {
    // EN — simple: Pricing, Manuals, Site, Partnership
    return {
      inline_keyboard: [
        [{ text: L(lang, 'pricing'), callback_data: 'menu:pricing' },
         { text: L(lang, 'manuals'), url: manualsUrl }],
        [{ text: L(lang, 'site'), url: siteUrl },
         { text: L(lang, 'partnership'), callback_data: 'action:partnership' }],
      ],
    };
  }

  // RU / UA / ES / ZH — Pricing, Manuals, Docs (notary+translations), Contact, Bugs + Site
  return {
    inline_keyboard: [
      [{ text: L(lang, 'pricing'), callback_data: 'menu:pricing' },
       { text: L(lang, 'manuals'), url: manualsUrl }],
      [{ text: L(lang, 'docs'), callback_data: 'action:docs' }],
      [{ text: L(lang, 'contact'), callback_data: 'action:contact' },
       { text: L(lang, 'bugs'), callback_data: 'action:bugs' }],
      [{ text: L(lang, 'open_site'), url: siteUrl }],
    ],
  };
}

export function backToMenuKeyboard(lang) {
  return { inline_keyboard: [[{ text: L(lang, 'back'), callback_data: 'menu:start' }]] };
}

// Per-language prompts shown when a service button is tapped. Free-form text
// from the user after this is routed to the appropriate destination + tagged.
export const ACTION_PROMPTS = {
  en: {
    partnership: '🤝 <b>Partnership</b>\n\nTell me about your idea — collaboration, affiliate, content swap, integration. I read everything personally. Just send your message below.',
    docs: '📋 <b>Notary &amp; Translations</b>\n\nDescribe what you need — apostille, certified copy, signature notarization, or document translation (DMV, USCIS, court). Anastasia from our team handles this.',
    contact: '💬 <b>Message me</b>\n\nType your question — I read DMs personally, usually reply within 4 hours.',
    bugs: '🐛 <b>Report a bug</b>\n\nDescribe what happened (and on which page if relevant). Screenshots help too.',
  },
  ru: {
    partnership: '🤝 <b>Сотрудничество</b>\n\nРасскажи об идее — партнёрка, аффилиат, обмен контентом, интеграция. Читаю всё лично. Просто напиши сообщение ниже.',
    docs: '📋 <b>Нотариус и переводы</b>\n\nОпиши что нужно — апостиль, заверение копии, подпись или перевод документов (DMV, USCIS, суд). Этим занимается Анастасия из нашей команды.',
    contact: '💬 <b>Написать мне</b>\n\nЗадай вопрос — читаю личку сам, обычно отвечаю в течение 4 часов.',
    bugs: '🐛 <b>Сообщить о баге</b>\n\nОпиши что случилось (и на какой странице если важно). Скриншоты тоже помогают.',
  },
  ua: {
    partnership: '🤝 <b>Співпраця</b>\n\nРозкажи про ідею — партнерка, афіліат, обмін контентом, інтеграція. Читаю все особисто. Напиши повідомлення нижче.',
    docs: '📋 <b>Нотаріус і переклади</b>\n\nОпиши що потрібно — апостиль, завірення копії, підпис або переклад документів (DMV, USCIS, суд). Цим займається Анастасія з нашої команди.',
    contact: '💬 <b>Написати мені</b>\n\nЗадай питання — читаю особисто, зазвичай відповідаю протягом 4 годин.',
    bugs: '🐛 <b>Повідомити про баг</b>\n\nОпиши що сталося (і на якій сторінці якщо важливо). Скріншоти теж допомагають.',
  },
  es: {
    partnership: '🤝 <b>Colaboración</b>\n\nCuéntame tu idea — partnership, afiliado, intercambio de contenido, integración. Leo todo personalmente. Escribe abajo.',
    docs: '📋 <b>Notario y traducciones</b>\n\nDescribe lo que necesitas — apostilla, copia certificada, firma o traducción de documentos (DMV, USCIS, corte). Anastasia de nuestro equipo se encarga.',
    contact: '💬 <b>Escríbeme</b>\n\nEscribe tu pregunta — leo DM personalmente, suelo responder en ~4h.',
    bugs: '🐛 <b>Reportar un bug</b>\n\nDescribe qué pasó (y en qué página si aplica). Las capturas ayudan.',
  },
  zh: {
    partnership: '🤝 <b>合作</b>\n\n告诉我你的想法 — 合作伙伴、推广、内容交换、集成。我都会亲自阅读。请在下方留言。',
    docs: '📋 <b>公证和翻译</b>\n\n描述你需要的服务 — 认证、副本、签名公证或文件翻译 (DMV、USCIS、法院)。我们团队的 Anastasia 负责此项。',
    contact: '💬 <b>联系我</b>\n\n请输入你的问题 — 我亲自查看，通常4小时内回复。',
    bugs: '🐛 <b>报告bug</b>\n\n描述发生了什么（如果相关请说明哪个页面）。截图也很有帮助。',
  },
};

// Per-language acknowledgement after the user submits an action message.
export const ACTION_ACKS = {
  en: 'sent ✓ — I\'ll get back to you',
  ru: 'отправлено ✓ — отвечу скоро',
  ua: 'надіслано ✓ — відповім скоро',
  es: 'enviado ✓ — te respondo pronto',
  zh: '已发送 ✓ — 我很快回复',
};

export function statePickerKeyboard(lang) {
  const rows = [];
  for (let i = 0; i < TOP_STATES.length; i += 2) {
    rows.push(TOP_STATES.slice(i, i + 2).map(s => ({
      text: `${s.icon} ${s.name}`,
      callback_data: `state:${s.slug}`,
    })));
  }
  rows.push([{ text: L(lang, 'states_all'), url: `https://dmvsos.com?lang=${lang}` }]);
  rows.push([{ text: L(lang, 'back'), callback_data: 'menu:start' }]);
  return { inline_keyboard: rows };
}

export function categoryKeyboard(lang, stateSlug) {
  const base = `https://dmvsos.com/category?state=${stateSlug}&lang=${lang}`;
  return {
    inline_keyboard: [
      [{ text: L(lang, 'car'), url: base }],
      [{ text: L(lang, 'cdl'), url: `https://dmvsos.com/test?state=${stateSlug}&category=cdl&lang=${lang}` }],
      [{ text: L(lang, 'moto'), url: `https://dmvsos.com/test?state=${stateSlug}&category=moto&lang=${lang}` }],
      [{ text: L(lang, 'back_states'), callback_data: 'menu:states' }],
    ],
  };
}

// ── Throttle ─────────────────────────────────────────────────────────────
// Bot replies at most once per chat per THROTTLE_MS, to avoid being kicked
// as spam by group admins. Silent mode forwards to admin DM and uses a
// shorter throttle so we don't miss multiple questions from different users.
export const THROTTLE_MS = 60 * 60 * 1000;          // 1h for autoreply
export const SILENT_THROTTLE_MS = 5 * 60 * 1000;    // 5min for silent forwards

export function isThrottled(lastReplyAt, mode = 'autoreply') {
  if (!lastReplyAt) return false;
  const limit = mode === 'silent' ? SILENT_THROTTLE_MS : THROTTLE_MS;
  return Date.now() - new Date(lastReplyAt).getTime() < limit;
}

// ── Forward composer (silent mode) ───────────────────────────────────────
// Builds a notification for admin/assistant DM with deep links to:
//   - the original message in the group (so you can reply in-context)
//   - a DM with the user (if their privacy allows it)
//
// Public supergroups → t.me/<username>/<msg_id>
// Private supergroups → t.me/c/<internal>/<msg_id> where internal = -100 stripped
export function composeForward({ chat, msg, userName, lang, keyword, stateSlug, isCdl }) {
  const groupTitle = chat.title || `id ${chat.id}`;
  const groupLink = chat.username
    ? `https://t.me/${chat.username}/${msg.message_id}`
    : `https://t.me/c/${String(chat.id).replace(/^-100/, '')}/${msg.message_id}`;

  const userId = msg.from?.id;
  const userHandle = msg.from?.username ? `@${msg.from.username}` : userName;
  const userLink = msg.from?.username
    ? `https://t.me/${msg.from.username}`
    : userId ? `tg://user?id=${userId}` : null;

  const textSnippet = (msg.text || '').slice(0, 400);
  const header = isCdl
    ? `🚛 <b>CDL question in ${groupTitle}</b>  ($49.99 product)`
    : `🔔 <b>DMV question in ${groupTitle}</b>`;

  const lines = [
    header,
    ``,
    `👤 From: ${userHandle}` + (userLink ? ` · <a href="${userLink}">open DM</a>` : ''),
    `🌐 Lang: ${lang.toUpperCase()}` + (stateSlug ? ` · State: <b>${stateSlug}</b>` : ''),
    `🔑 Matched: <code>${keyword}</code>`,
    ``,
    `<i>${escapeHtml(textSnippet)}</i>`,
    ``,
    `↪️ <a href="${groupLink}">Reply in group</a>`,
  ];
  return lines.join('\n');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
