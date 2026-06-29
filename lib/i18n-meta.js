// Localized title / description / og templates for state-aware SEO.
//
// Each language gets its own native phrasing — not a machine translation —
// so search-result snippets feel local to the searcher. Google ranks
// query-language → page-language matches strongly, and CTR jumps when the
// snippet is in the user's language even on Google.com results.
//
// Templates use {name} for state, {abbr} for state abbreviation, {agency}
// for the state DMV agency abbreviation (DMV/DOL/MVC/MVD), {questions} and
// {passing} for exam stats, {year} for the current year.
//
// The "Map" object below maps our app's lang codes (en/ru/es/zh/ua) to the
// ISO codes Google expects on og:locale (en_US / ru_RU / es_419 / zh_CN /
// uk_UA). x-default keeps default English in worldwide search results.

export const APP_LANG_TO_OG_LOCALE = {
  en: 'en_US',
  ru: 'ru_RU',
  es: 'es_419',
  zh: 'zh_CN',
  ua: 'uk_UA',
};

// Used in <html lang>, ISO-639 codes. "ua" → "uk" is the spec mapping.
export const APP_LANG_TO_HTML_LANG = {
  en: 'en',
  ru: 'ru',
  es: 'es',
  zh: 'zh-Hans',
  ua: 'uk',
};

function tmpl(s, vars) {
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

// ─────────────────────────────────────────────────────────────────────────
// Home / generic landing
// ─────────────────────────────────────────────────────────────────────────

const HOME = {
  en: {
    title: 'Free DMV Practice Test | 50 States | 5 Languages | DMVSOS',
    description: 'Free DMV practice tests for all 50 states in 5 languages: English, Spanish, Russian, Ukrainian, Chinese. Sourced from official state Driver Handbooks. No signup.',
  },
  ru: {
    title: 'Бесплатный тест DMV на русском | Все 50 штатов | DMVSOS',
    description: 'Бесплатные тесты DMV для всех 50 штатов США на 5 языках: английский, испанский, русский, украинский, китайский. Реальные вопросы из официальных руководств водителя. Без регистрации.',
  },
  es: {
    title: 'Examen DMV gratis en español | Los 50 estados | DMVSOS',
    description: 'Pruebas de práctica DMV gratis para los 50 estados en 5 idiomas: inglés, español, ruso, ucraniano, chino. Preguntas reales del Manual del Conductor oficial. Sin registro.',
  },
  zh: {
    title: 'DMV 笔试免费练习 | 全美50州 | 5种语言 | DMVSOS',
    description: '全美50州 DMV 笔试免费练习题，5种语言（英文、西班牙文、俄文、乌克兰文、中文），题目来源于官方驾驶手册。无需注册。',
  },
  ua: {
    title: 'Безкоштовний тест DMV українською | Усі 50 штатів | DMVSOS',
    description: 'Безкоштовні тести DMV для всіх 50 штатів США 5 мовами: англійською, іспанською, російською, українською, китайською. Реальні питання з офіційних посібників водія. Без реєстрації.',
  },
};

export function homeMeta(lang) {
  return HOME[lang] || HOME.en;
}

// ─────────────────────────────────────────────────────────────────────────
// State landing /dmv-test/[state]
// ─────────────────────────────────────────────────────────────────────────

const STATE = {
  en: {
    title: '{name} DMV Practice Test {year} · Free | DMVSOS',
    description: 'Free {name} {agency} practice test {year}. Study {questions} real {abbr} knowledge test questions in 5 languages. Pass on your first try · no signup required.',
  },
  ru: {
    title: 'Тест {agency} {name} {year} на русском · Бесплатно | DMVSOS',
    description: 'Бесплатный тест {agency} {name} {year} на русском. {questions} реальных вопроса экзамена {abbr} на 5 языках. Сдай с первого раза без регистрации.',
  },
  es: {
    title: 'Examen {agency} {name} {year} gratis · Español | DMVSOS',
    description: 'Examen de manejo {name} {year} gratis en español. {questions} preguntas reales del examen {abbr} en 5 idiomas. Aprueba a la primera · sin registro.',
  },
  zh: {
    title: '{name} {agency} 笔试 {year} · 免费中文练习 | DMVSOS',
    description: '{name} {agency} 笔试免费练习，{year}年最新题库，{questions}道{abbr}真实考题，提供5种语言。一次通过 · 无需注册。',
  },
  ua: {
    title: 'Тест {agency} {name} {year} українською · Безкоштовно | DMVSOS',
    description: 'Безкоштовний тест {agency} {name} {year} українською. {questions} реальних питань іспиту {abbr} 5 мовами. Склади з першого разу без реєстрації.',
  },
};

export function stateMeta(lang, vars) {
  const t = STATE[lang] || STATE.en;
  return {
    title: tmpl(t.title, vars),
    description: tmpl(t.description, vars),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// /dmv-test (hub)
// ─────────────────────────────────────────────────────────────────────────

const HUB = {
  en: {
    title: 'Free DMV Practice Tests · All 50 States {year} | DMVSOS',
    description: 'Free DMV practice tests for all 50 US states in 5 languages. Pick your state and start practicing for your knowledge test today. No signup required.',
  },
  ru: {
    title: 'Бесплатные тесты DMV для всех 50 штатов {year} | DMVSOS',
    description: 'Бесплатные тесты DMV для всех 50 штатов США на 5 языках. Выбери штат и начни готовиться к экзамену прямо сейчас. Без регистрации.',
  },
  es: {
    title: 'Exámenes DMV gratis · Los 50 estados {year} | DMVSOS',
    description: 'Exámenes de práctica DMV gratis para los 50 estados en 5 idiomas. Elige tu estado y empieza a practicar para el examen escrito hoy. Sin registro.',
  },
  zh: {
    title: 'DMV 笔试免费练习 · 全美50州 {year} | DMVSOS',
    description: '全美50州 DMV 笔试免费练习题，5种语言。选择你的州，立即开始备考。无需注册。',
  },
  ua: {
    title: 'Безкоштовні тести DMV · Усі 50 штатів {year} | DMVSOS',
    description: 'Безкоштовні тести DMV для всіх 50 штатів США 5 мовами. Обери штат і починай готуватись до екзамену зараз. Без реєстрації.',
  },
};

export function hubMeta(lang, vars) {
  const t = HUB[lang] || HUB.en;
  return {
    title: tmpl(t.title, vars),
    description: tmpl(t.description, vars),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// /manuals — driver-manual library hub
// ─────────────────────────────────────────────────────────────────────────

const MANUALS_HUB = {
  en: {
    title: 'Free Driver Handbooks · All 50 States | DMVSOS',
    description: 'Download free official driver handbooks for all 50 US states in 5 languages. Car, CDL, and motorcycle manuals. Direct PDFs.',
  },
  ru: {
    title: 'Руководства водителя бесплатно · Все 50 штатов | DMVSOS',
    description: 'Скачать официальные руководства водителя для всех 50 штатов США на 5 языках. Авто, грузовик (CDL) и мотоцикл. Прямые PDF.',
  },
  es: {
    title: 'Manuales del Conductor gratis · 50 estados | DMVSOS',
    description: 'Descarga manuales del conductor oficiales gratis para los 50 estados en 5 idiomas. Auto, CDL y motocicleta. PDFs directos.',
  },
  zh: {
    title: '驾驶手册免费下载 · 全美50州 | DMVSOS',
    description: '免费下载全美50州官方驾驶手册，提供5种语言。汽车、卡车（CDL）和摩托车手册。直接 PDF。',
  },
  ua: {
    title: 'Посібники водія безкоштовно · Усі 50 штатів | DMVSOS',
    description: 'Завантаж офіційні посібники водія для всіх 50 штатів США 5 мовами. Авто, вантажівка (CDL) та мотоцикл. Прямі PDF.',
  },
};

export function manualsHubMeta(lang) {
  return MANUALS_HUB[lang] || MANUALS_HUB.en;
}

// ─────────────────────────────────────────────────────────────────────────
// /manuals/[state] — state manuals hub
// ─────────────────────────────────────────────────────────────────────────

const STATE_MANUAL = {
  en: {
    title: '{name} Driver Handbook · Free PDF in 5 Languages | DMVSOS',
    description: 'Free {name} ({abbr}) driver handbook in 5 languages. Download the official car, CDL, or motorcycle manual PDF. Study for the {abbr} {agency} test.',
  },
  ru: {
    title: 'Руководство водителя {name} · PDF на 5 языках | DMVSOS',
    description: 'Бесплатное руководство водителя {name} ({abbr}) на 5 языках. Скачай официальный PDF для авто, грузовика (CDL) или мотоцикла. Готовься к экзамену {agency}.',
  },
  es: {
    title: 'Manual del Conductor {name} · PDF gratis 5 idiomas | DMVSOS',
    description: 'Manual del conductor {name} ({abbr}) gratis en 5 idiomas. Descarga el PDF oficial para auto, CDL o motocicleta. Prepárate para el examen {agency}.',
  },
  zh: {
    title: '{name} 驾驶手册 · 免费 PDF 5种语言 | DMVSOS',
    description: '{name} ({abbr}) 驾驶手册免费下载，5种语言。汽车、卡车（CDL）或摩托车官方 PDF。备考 {agency} 笔试。',
  },
  ua: {
    title: 'Посібник водія {name} · PDF 5 мовами | DMVSOS',
    description: 'Безкоштовний посібник водія {name} ({abbr}) 5 мовами. Завантаж офіційний PDF для авто, вантажівки (CDL) або мотоцикла. Готуйся до іспиту {agency}.',
  },
};

export function stateManualMeta(lang, vars) {
  const t = STATE_MANUAL[lang] || STATE_MANUAL.en;
  return {
    title: tmpl(t.title, vars),
    description: tmpl(t.description, vars),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// /manuals/[state]/[cat] — state + category manual page
// ─────────────────────────────────────────────────────────────────────────

const STATE_CAT_MANUAL = {
  en: {
    title: '{name} {catLabel} · Free PDF in 5 Languages | DMVSOS',
    description: 'Free {name} {catLabel} in 5 languages. Download the official {abbr} {catLabel} PDF or read online. Study for the {abbr} {agency} written test.',
  },
  ru: {
    title: '{name} {catLabel} · PDF на 5 языках бесплатно | DMVSOS',
    description: 'Бесплатное {catLabel} {name} на 5 языках. Скачай официальный PDF {abbr} или читай онлайн. Готовься к письменному экзамену {agency}.',
  },
  es: {
    title: '{name} {catLabel} · PDF gratis en 5 idiomas | DMVSOS',
    description: '{catLabel} {name} gratis en 5 idiomas. Descarga el PDF oficial {abbr} o lee online. Prepárate para el examen escrito {agency}.',
  },
  zh: {
    title: '{name} {catLabel} · 免费 PDF 5种语言 | DMVSOS',
    description: '{name} {catLabel} 免费下载，5种语言。{abbr} 官方 PDF 或在线阅读。备考 {agency} 笔试。',
  },
  ua: {
    title: '{name} {catLabel} · PDF 5 мовами безкоштовно | DMVSOS',
    description: 'Безкоштовне {catLabel} {name} 5 мовами. Завантаж офіційний PDF {abbr} або читай онлайн. Готуйся до письмового іспиту {agency}.',
  },
};

// Localized category labels — used in titles + descriptions.
const CAT_LABELS = {
  en: { car: "Driver's Handbook",        cdl: 'CDL Manual',                  motorcycle: 'Motorcycle Handbook' },
  ru: { car: 'Руководство водителя',     cdl: 'Руководство CDL',             motorcycle: 'Руководство мотоциклиста' },
  es: { car: 'Manual del Conductor',     cdl: 'Manual CDL',                  motorcycle: 'Manual del Motociclista' },
  zh: { car: '驾驶手册',                  cdl: 'CDL 手册',                     motorcycle: '摩托车手册' },
  ua: { car: 'Посібник водія',           cdl: 'Посібник CDL',                motorcycle: 'Посібник мотоцикліста' },
};

export function categoryLabel(lang, cat) {
  return (CAT_LABELS[lang] || CAT_LABELS.en)[cat] || cat;
}

export function stateCatManualMeta(lang, vars) {
  const t = STATE_CAT_MANUAL[lang] || STATE_CAT_MANUAL.en;
  return {
    title: tmpl(t.title, vars),
    description: tmpl(t.description, vars),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Canonical + hreflang.
//
// EN lives at the root (x-default). ru/es/zh/ua live under a /[locale]/ path
// prefix with GENUINELY localized server-rendered bodies (the locale routes).
// Pages that HAVE locale routes pass { hreflang: true } and get a per-locale
// self-canonical + the full 5-lang hreflang cluster. Pages whose locale routes
// aren't built yet keep the legacy behavior: canonical at the single EN base
// (consolidating any ?lang variant to English) and NO hreflang — so we never
// advertise a /ru/... URL that would 404.
// ─────────────────────────────────────────────────────────────────────────

const SITE_URL = 'https://dmvsos.com';

// EN = root (no prefix). hreflang codes follow Google's spec (ua → uk, zh → zh-Hans).
const LOCALE_PATH = { en: '', ru: '/ru', es: '/es', zh: '/zh', ua: '/ua' };
const HREFLANG_CODE = { en: 'en', ru: 'ru', es: 'es', zh: 'zh-Hans', ua: 'uk' };

export function localizedAlternates(pathname, lang = 'en', { hreflang = false } = {}) {
  // Treat the home path '/' as '' so locale URLs read /ru (not /ru/) — keeps the
  // whole cluster trailing-slash-free and consistent.
  const p = pathname === '/' ? '' : pathname;
  if (!hreflang) {
    // No locale route for this page type yet: always canonical to EN base.
    return { canonical: `${SITE_URL}${p}` };
  }
  const canonical = `${SITE_URL}${LOCALE_PATH[lang] || ''}${p}`;
  const languages = { 'x-default': `${SITE_URL}${p}` };
  for (const [code, prefix] of Object.entries(LOCALE_PATH)) {
    languages[HREFLANG_CODE[code]] = `${SITE_URL}${prefix}${p}`;
  }
  return { canonical, languages };
}
