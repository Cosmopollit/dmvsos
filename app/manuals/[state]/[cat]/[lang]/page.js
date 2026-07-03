import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META } from '@/lib/manual-data';

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const INDEX_URL = `${SUPABASE_URL}/storage/v1/object/public/manuals/manuals-index.json`;

const VALID_CATS = ['car', 'cdl', 'motorcycle'];

const CAT_META = {
  car:        { label: "Driver's Handbook",   testCat: 'dmv' },
  cdl:        { label: 'CDL Manual',          testCat: 'cdl' },
  motorcycle: { label: 'Motorcycle Handbook', testCat: 'moto' },
};

// Category illustration for the download card (same art as /manuals cards).
const CAT_ART = {
  car:        '/illustrations/manual-car.png',
  cdl:        '/illustrations/manual-cdl.png',
  motorcycle: '/illustrations/manual-moto.png',
};

const LANG_LABELS = {
  en: 'English', es: 'Español', zh: '中文', ru: 'Русский', ua: 'Українська',
  vi: 'Tiếng Việt', hy: 'Հայերեն', hi: 'हिन्दी', pa: 'ਪੰਜਾਬੀ', ht: 'Kreyòl',
  ko: '한국어', ar: 'العربية', fr: 'Français', de: 'Deutsch', so: 'Soomaali',
  sw: 'Kiswahili', my: 'မြန်မာ', ne: 'नेपाली', pt: 'Português', ja: '日本語', hmn: 'Hmong',
  tl: 'Filipino', sm: 'Samoa', to: 'Faka-Tonga', haw: 'ʻŌlelo Hawaiʻi', mh: 'Kajin M̧ajeļ', ilo: 'Ilocano', chk: 'Chuukese',
};

// Language-specific phrases for native speakers
const LANG_NATIVE = {
  en: { in: 'in English',       download: 'Download PDF',        study: 'Study for the DMV test',         cta: 'Take Free Practice Test' },
  es: { in: 'en Español',       download: 'Descargar PDF',        study: 'Estudia para el examen de manejo', cta: 'Tomar prueba gratis' },
  ru: { in: 'на русском',       download: 'Скачать PDF',          study: 'Подготовьтесь к экзамену ПДД',     cta: 'Бесплатный тест' },
  zh: { in: '中文版',            download: '下载 PDF',             study: '备考驾照笔试',                      cta: '免费练习测试' },
  ua: { in: 'українською',      download: 'Завантажити PDF',      study: 'Підготуйтеся до екзамену',         cta: 'Безкоштовний тест' },
  vi: { in: 'tiếng Việt',       download: 'Tải PDF',              study: 'Ôn thi bằng lái xe',               cta: 'Kiểm tra miễn phí' },
  ko: { in: '한국어',            download: 'PDF 다운로드',          study: '운전면허 필기시험 준비',              cta: '무료 테스트' },
  ar: { in: 'بالعربية',         download: 'تحميل PDF',            study: 'استعد لاختبار القيادة',             cta: 'اختبار مجاني' },
  fr: { in: 'en Français',      download: 'Télécharger PDF',      study: "Préparez l'examen du permis",       cta: 'Test gratuit' },
  de: { in: 'auf Deutsch',      download: 'PDF herunterladen',    study: 'Führerscheinprüfung vorbereiten',   cta: 'Kostenloser Test' },
  hy: { in: 'հայերեն',          download: 'Բեռնել PDF',           study: 'Պատրաստվեք քննությանը',            cta: 'Անվճար թեստ' },
  hi: { in: 'हिंदी में',         download: 'PDF डाउनलोड करें',    study: 'ड्राइविंग टेस्ट की तैयारी',        cta: 'मुफ्त टेस्ट' },
  pa: { in: 'ਪੰਜਾਬੀ ਵਿੱਚ',      download: 'PDF ਡਾਊਨਲੋਡ ਕਰੋ',    study: 'ਡ੍ਰਾਈਵਿੰਗ ਟੈਸਟ ਦੀ ਤਿਆਰੀ',         cta: 'ਮੁਫਤ ਟੈਸਟ' },
  ht: { in: 'an Kreyòl',        download: 'Telechaje PDF',        study: 'Prepare egzamen kondwit ou',        cta: 'Tès gratis' },
  so: { in: 'Soomaali',         download: 'Soo dejiso PDF',       study: 'U diyaarso imtixaanka baabulaynta', cta: 'Imtixaan bilaash' },
  sw: { in: 'Kiswahili',        download: 'Pakua PDF',            study: 'Jiandae kwa mtihani wa udereva',    cta: 'Mtihani wa bure' },
  my: { in: 'မြန်မာဘာသာ',       download: 'PDF ဒေါင်းလုပ်',      study: 'ယာဉ်မောင်းစာမေးပွဲ ပြင်ဆင်ပါ',   cta: 'အခမဲ့ စမ်းသပ်' },
  ne: { in: 'नेपालीमा',         download: 'PDF डाउनलोड गर्नुस्',  study: 'ड्राइभिङ परीक्षाको तयारी',         cta: 'निःशुल्क परीक्षा' },
  pt: { in: 'em Português',     download: 'Baixar PDF',           study: 'Estude para o exame de direção',    cta: 'Teste gratuito' },
  ja: { in: '日本語版',          download: 'PDF ダウンロード',      study: '運転免許筆記試験の勉強',              cta: '無料テスト' },
  hmn: { in: 'lus Hmoob',       download: 'Rub PDF',              study: 'Kawm rau kev sim tsav tsheb',       cta: 'Kev sim dawb' },
  tl:  { in: 'Filipino',        download: 'I-download ang PDF',   study: 'Mag-aral para sa DMV test',         cta: 'Libreng Pagsasanay' },
  sm:  { in: 'Gagana Sāmoa',    download: 'Lalau mai le PDF',     study: "Sauni mo le su'esu'ega",            cta: "Su'esu'e fua" },
  to:  { in: 'lea faka-Tonga',  download: 'Tukumai PDF',          study: 'Teuteu ki he fakamatala',           cta: 'Fakamatala tauhi' },
  haw: { in: 'ʻŌlelo Hawaiʻi',  download: 'Hoʻoiho PDF',         study: 'Aʻo no ka hoʻokolohua',            cta: 'Hoʻāʻo manuahi' },
  mh:  { in: 'Kajin M̧ajeļ',   download: 'Download PDF',         study: 'Kobban ñan test',                   cta: 'Test wōt' },
  ilo: { in: 'Ilocano',         download: 'I-download ti PDF',    study: 'Aralen para iti eksamen',           cta: 'Libre nga pagbasa' },
  chk: { in: 'Chuukese',        download: 'Download PDF',         study: 'Fen ren ewe test',                  cta: 'Free test' },
};

// Localized category label (visible body only; metadata/JSON-LD stay English).
// Falls back to CAT_META[cat].label for languages not listed here.
const CAT_I18N = {
  ru: { car: 'Руководство водителя', cdl: 'Руководство CDL', motorcycle: 'Руководство мотоциклиста' },
  es: { car: 'Manual del conductor', cdl: 'Manual CDL', motorcycle: 'Manual de motocicleta' },
  zh: { car: '驾驶手册',            cdl: 'CDL 手册',      motorcycle: '摩托车手册' },
  ua: { car: 'Посібник водія',      cdl: 'Посібник CDL',  motorcycle: 'Посібник мотоцикліста' },
};

// Page chrome (buttons, headings, sentences) for the 5 core app languages.
// Other manual languages fall back to English (en). Placeholders: {year}
// {agency} {name} {nl}=native language label. No em-dashes in any language.
const LANG_CHROME = {
  en: {
    allManuals: 'All Manuals', freeTest: 'Free Test', home: 'Home', manuals: 'Manuals',
    official: 'Official', subtitle: 'The official {year} edition, published by {agency}. Free PDF below.',
    edition: '{year} Edition · Free', opensPdf: 'Opens official PDF · No signup required',
    otherLanguages: 'Other Languages', practiceTitle: '{name} Practice Test',
    realQuestions: 'Real questions · {nl} · Free · No signup', otherStates: 'Other States',
    allLanguages: 'All languages · {name}',
    footer: 'Free DMV Practice Tests & Driver Manuals for All 50 States',
  },
  ru: {
    allManuals: 'Все руководства', freeTest: 'Бесплатный тест', home: 'Главная', manuals: 'Руководства',
    official: 'Официальное', subtitle: 'Официальное издание {year} года от {agency}. Бесплатный PDF ниже.',
    edition: 'Издание {year} · Бесплатно', opensPdf: 'Открывает официальный PDF · Без регистрации',
    otherLanguages: 'Другие языки', practiceTitle: 'Пробный тест · {name}',
    realQuestions: 'Реальные вопросы · {nl} · Бесплатно · Без регистрации', otherStates: 'Другие штаты',
    allLanguages: 'Все языки · {name}',
    footer: 'Бесплатные тесты и руководства для всех 50 штатов',
  },
  es: {
    allManuals: 'Todos los manuales', freeTest: 'Examen gratis', home: 'Inicio', manuals: 'Manuales',
    official: 'Oficial', subtitle: 'Edición oficial {year}, publicada por {agency}. PDF gratis abajo.',
    edition: 'Edición {year} · Gratis', opensPdf: 'Abre el PDF oficial · Sin registro',
    otherLanguages: 'Otros idiomas', practiceTitle: 'Examen de práctica · {name}',
    realQuestions: 'Preguntas reales · {nl} · Gratis · Sin registro', otherStates: 'Otros estados',
    allLanguages: 'Todos los idiomas · {name}',
    footer: 'Exámenes y manuales gratuitos para los 50 estados',
  },
  zh: {
    allManuals: '所有手册', freeTest: '免费测试', home: '首页', manuals: '手册',
    official: '官方', subtitle: '{agency} 发布的 {year} 年官方版本。下方提供免费 PDF。',
    edition: '{year} 年版 · 免费', opensPdf: '打开官方 PDF · 无需注册',
    otherLanguages: '其他语言', practiceTitle: '{name} 模拟考试',
    realQuestions: '真实题目 · {nl} · 免费 · 无需注册', otherStates: '其他州',
    allLanguages: '所有语言 · {name}',
    footer: '全部 50 个州的免费练习测试和驾驶手册',
  },
  ua: {
    allManuals: 'Усі посібники', freeTest: 'Безкоштовний тест', home: 'Головна', manuals: 'Посібники',
    official: 'Офіційне', subtitle: 'Офіційне видання {year} року від {agency}. Безкоштовний PDF нижче.',
    edition: 'Видання {year} · Безкоштовно', opensPdf: 'Відкриває офіційний PDF · Без реєстрації',
    otherLanguages: 'Інші мови', practiceTitle: 'Пробний тест · {name}',
    realQuestions: 'Справжні питання · {nl} · Безкоштовно · Без реєстрації', otherStates: 'Інші штати',
    allLanguages: 'Усі мови · {name}',
    footer: 'Безкоштовні тести та посібники для всіх 50 штатів',
  },
};

// Full language name in English for SEO titles
const LANG_ENGLISH_NAME = {
  en: 'English', es: 'Spanish', ru: 'Russian', zh: 'Chinese', ua: 'Ukrainian',
  vi: 'Vietnamese', ko: 'Korean', ar: 'Arabic', fr: 'French', de: 'German',
  hy: 'Armenian', hi: 'Hindi', pa: 'Punjabi', ht: 'Haitian Creole', so: 'Somali',
  sw: 'Swahili', my: 'Burmese', ne: 'Nepali', pt: 'Portuguese', ja: 'Japanese', hmn: 'Hmong',
  tl: 'Tagalog', sm: 'Samoan', to: 'Tongan', haw: 'Hawaiian', mh: 'Marshallese', ilo: 'Ilocano', chk: 'Chuukese',
};

// App lang code → BCP-47/ISO-639 hreflang code
const LANG_TO_ISO = {
  en: 'en',  es: 'es',  ru: 'ru',  zh: 'zh-Hans',  ua: 'uk',
  vi: 'vi',  ko: 'ko',  ar: 'ar',  fr: 'fr',       de: 'de',
  hy: 'hy',  hi: 'hi',  pa: 'pa',  ht: 'ht',       so: 'so',
  sw: 'sw',  my: 'my',  ne: 'ne',  pt: 'pt',       ja: 'ja',
  hmn: 'hmn', tl: 'tl', sm: 'sm', to: 'to', haw: 'haw', mh: 'mh', ilo: 'ilo', chk: 'chk',
};

async function fetchManualIndex() {
  try {
    const res = await fetch(INDEX_URL, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  const index = await fetchManualIndex();
  if (!index) return [];
  const params = [];
  for (const [state, cats] of Object.entries(index)) {
    if (!STATE_DISPLAY[state]) continue;
    for (const [cat, langs] of Object.entries(cats)) {
      if (!VALID_CATS.includes(cat)) continue;
      for (const lang of Object.keys(langs)) {
        params.push({ state, cat, lang });
      }
    }
  }
  return params;
}

export async function generateMetadata({ params }) {
  const { state, cat, lang } = await params;
  const name = STATE_DISPLAY[state];
  if (!name || !VALID_CATS.includes(cat)) return {};
  const year = new Date().getFullYear();
  const catInfo = CAT_META[cat];
  const langEN = LANG_ENGLISH_NAME[lang] || lang.toUpperCase();
  const native = LANG_NATIVE[lang];

  const title = `${name} ${catInfo.label} in ${langEN} | Free PDF ${year} | DMVSOS`;
  const description = `Download the official ${name} ${catInfo.label} in ${langEN} (${year}) | free PDF. ${native?.study || 'Study for your DMV test'} with the official handbook ${native?.in || ''}.`;

  // Build hreflang alternates from sibling lang pages that exist for this (state, cat).
  const SITE = 'https://dmvsos.com';
  const canonical = `${SITE}/manuals/${state}/${cat}/${lang}`;
  const index = await fetchManualIndex();
  const availableLangs = Object.keys(index?.[state]?.[cat] || {});
  const languages = {};
  for (const l of availableLangs) {
    const iso = LANG_TO_ISO[l];
    if (!iso) continue;
    languages[iso] = `${SITE}/manuals/${state}/${cat}/${l}`;
  }
  // x-default: prefer English when available, else the current lang
  languages['x-default'] = availableLangs.includes('en')
    ? `${SITE}/manuals/${state}/${cat}/en`
    : canonical;

  return {
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'DMVSOS',
      type: 'article',
    },
  };
}

export default async function StateManualLangPage({ params }) {
  const { state, cat, lang } = await params;
  const name = STATE_DISPLAY[state];
  if (!name || !VALID_CATS.includes(cat)) notFound();

  const meta = STATE_META[state];
  const year = new Date().getFullYear();
  const catInfo = CAT_META[cat];
  const native = LANG_NATIVE[lang] || LANG_NATIVE.en;
  const langEN = LANG_ENGLISH_NAME[lang] || lang.toUpperCase();
  const nativeLabel = LANG_LABELS[lang] || lang.toUpperCase();
  // Localized page chrome + category label (English fallback for non-core langs).
  const ui = { ...LANG_CHROME.en, ...(LANG_CHROME[lang] || {}) };
  const catLabel = CAT_I18N[lang]?.[cat] || catInfo.label;

  // Fetch PDF URL for this exact state/cat/lang
  const index = await fetchManualIndex();
  const pdfUrl = index?.[state]?.[cat]?.[lang];
  if (!pdfUrl) notFound();

  // All available languages for this state/cat
  const allLangs = index?.[state]?.[cat] ? Object.keys(index[state][cat]) : [];
  const otherLangs = allLangs.filter(l => l !== lang);

  // Other states that have a PDF for this same cat+lang
  const otherStatesWithLang = STATE_SLUGS
    .filter(s => s !== state && index?.[s]?.[cat]?.[lang])
    .slice(0, 6);

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home',              item: 'https://dmvsos.com' },
          { '@type': 'ListItem', position: 2, name: 'Manuals',           item: 'https://dmvsos.com/manuals' },
          { '@type': 'ListItem', position: 3, name,                      item: `https://dmvsos.com/manuals/${state}` },
          { '@type': 'ListItem', position: 4, name: catInfo.label,       item: `https://dmvsos.com/manuals/${state}/${cat}` },
          { '@type': 'ListItem', position: 5, name: langEN,              item: `https://dmvsos.com/manuals/${state}/${cat}/${lang}` },
        ],
      },
      {
        '@type': 'Article',
        headline: `${name} ${catInfo.label} in ${langEN} ${year}`,
        description: `Official ${name} ${catInfo.label} in ${langEN}. Free PDF published by ${meta.agency}.`,
        inLanguage: lang,
        author: { '@type': 'Organization', name: meta.agency },
        publisher: { '@type': 'Organization', name: 'DMVSOS', url: 'https://dmvsos.com' },
        url: `https://dmvsos.com/manuals/${state}/${cat}/${lang}`,
      },
    ],
  });

  return (
    <div
      className="min-h-screen font-[family-name:var(--font-inter)]"
      style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <div className="fixed top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(26,86,219,0.08) 0%, transparent 70%)' }} />
      <div className="fixed bottom-[-150px] left-[-150px] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)' }} />

      {/* Header */}
      <header className="w-full max-w-lg mx-auto pt-5 pb-4 px-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition">
            <Image src="/logo.png" alt="DMVSOS" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/manuals" className="text-xs font-medium text-[#64748B] hover:text-[#2563EB] transition">
              {ui.allManuals}
            </Link>
            <Link
              href={`/category?state=${state}&lang=${lang}`}
              className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition"
            >
              {ui.freeTest}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-16">

        {/* Breadcrumb */}
        <nav className="text-xs text-[#94A3B8] mb-5 mt-1" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li><Link href="/" className="hover:text-[#2563EB]">{ui.home}</Link></li>
            <li>/</li>
            <li><Link href="/manuals" className="hover:text-[#2563EB]">{ui.manuals}</Link></li>
            <li>/</li>
            <li><Link href={`/manuals/${state}`} className="hover:text-[#2563EB]">{name}</Link></li>
            <li>/</li>
            <li><Link href={`/manuals/${state}/${cat}`} className="hover:text-[#2563EB]">{catLabel}</Link></li>
            <li>/</li>
            <li className="text-[#1A2B4A] font-medium">{nativeLabel}</li>
          </ol>
        </nav>

        {/* H1 */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs font-semibold text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] rounded-full px-3 py-1">
              {ui.official} {year} · {nativeLabel}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#0B1C3D] mb-2 leading-tight" style={{ letterSpacing: '-0.02em' }}>
            {name} {catLabel}
            <span className="block text-[#2563EB]">{native.in}</span>
          </h1>
          <p className="text-sm text-[#64748B]">
            {ui.subtitle.replace('{year}', year).replace('{agency}', meta.agency)}
          </p>
        </div>

        {/* Primary PDF download | big CTA */}
        <div className="bg-white rounded-2xl border-2 border-[#2563EB] p-6 mb-5 shadow-md text-center">
          <div className="flex justify-center mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={CAT_ART[cat] || '/illustrations/manual.png'} alt="" className="h-16 object-contain select-none" />
          </div>
          <p className="text-base font-bold text-[#0B1C3D] mb-1">
            {name} {catLabel} · {nativeLabel}
          </p>
          <p className="text-xs text-[#64748B] mb-5">
            {meta.agency} · {ui.edition.replace('{year}', year)}
          </p>
          {/* GradientButton (blue) visual, inlined on an <a> because the PDF
              must keep opening in a new tab and GradientButton's Link does
              not forward target/rel. */}
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="gradient-btn relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-2xl px-8 py-4 text-sm font-bold text-white transition-transform duration-100 active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)', boxShadow: '0 6px 18px rgba(37,99,235,0.35)' }}
          >
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.22), rgba(255,255,255,0))' }} />
            <span aria-hidden="true" className="gradient-btn-shine pointer-events-none absolute inset-y-0 -left-1/2 w-1/2" />
            <span className="relative z-10 flex items-center justify-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m8 11 4 4 4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
              {native.download}
            </span>
          </a>
          <p className="text-xs text-[#94A3B8] mt-3">{ui.opensPdf}</p>
        </div>

        {/* Other languages for same state/cat */}
        {otherLangs.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 mb-5 shadow-sm">
            <h2 className="text-sm font-bold text-[#0B1C3D] mb-3">
              {name} {catLabel} · {ui.otherLanguages}
            </h2>
            <div className="flex flex-wrap gap-2">
              {otherLangs.map(l => (
                <Link
                  key={l}
                  href={`/manuals/${state}/${cat}/${l}`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#2563EB] transition-all text-xs font-medium text-[#475569]"
                >
                  <span>{LANG_LABELS[l] || l.toUpperCase()}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Practice test CTA */}
        <div className="bg-[#0B1C3D] rounded-2xl p-6 mb-5 text-center shadow-lg border border-[#1e3a5f]">
          <p className="text-sm font-semibold text-[#60A5FA] mb-2">
            {native.study}
          </p>
          <h2 className="text-base font-bold text-white mb-1">
            {ui.practiceTitle.replace('{name}', name)}
          </h2>
          <p className="text-sm text-[#94A3B8] mb-4">
            {ui.realQuestions.replace('{nl}', nativeLabel)}
          </p>
          <Link
            href={`/test?state=${state}&category=${catInfo.testCat}&lang=${lang}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#2563EB] text-white rounded-xl font-semibold hover:bg-[#1D4ED8] transition-colors text-sm"
          >
            {native.cta}
          </Link>
        </div>

        {/* Other states with same cat+lang */}
        {otherStatesWithLang.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-bold text-[#0B1C3D] mb-3">
              {catLabel} {native.in} · {ui.otherStates}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {otherStatesWithLang.map(s => (
                <Link
                  key={s}
                  href={`/manuals/${s}/${cat}/${lang}`}
                  className="p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:shadow-sm transition-all text-sm font-medium text-[#1A2B4A] hover:text-[#2563EB]"
                >
                  {STATE_DISPLAY[s]}{' '}
                  <span className="text-[#94A3B8] text-xs">({STATE_META[s].abbr})</span>
                </Link>
              ))}
              <Link
                href={`/manuals/${state}/${cat}`}
                className="p-3 rounded-xl border border-[#2563EB] bg-[#EFF6FF] text-sm font-semibold text-[#2563EB] text-center col-span-2 hover:bg-[#DBEAFE] transition-colors"
              >
                {ui.allLanguages.replace('{name}', name)}
              </Link>
            </div>
          </div>
        )}

      </main>

      <footer className="border-t border-[#E2E8F0] py-8 text-center text-xs text-[#94A3B8]">
        <div className="max-w-lg mx-auto px-4">
          DMVSOS.com · {ui.footer}
        </div>
      </footer>
    </div>
  );
}
