import Link from 'next/link';
import Image from 'next/image';
import { t } from '@/lib/translations';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META } from '@/lib/manual-data';
import { examRulesFor } from '@/lib/exam-rules';
import { agencyAbbrForState } from '@/lib/agencies';

// Local i18n for the user-visible strings on this page. Kept self-contained so
// shared files stay untouched. Metadata + JSON-LD stay English on purpose.
// Interpolations are passed as values: {name}, {year}, {agency}, {label},
// {labelFull}, {testLabel}, {n}, {plural}.
const PAGE_I18N = {
  en: {
    allManuals: 'All Manuals',
    freeTest: 'Free Test',
    home: 'Home',
    manuals: 'Manuals',
    officialBadge: ({ year }) => `Official ${year} handbook`,
    publishedBy: ({ labelFull, agency }) => `Official ${labelFull} published by ${agency}.`,
    availableIn: ({ n, plural }) => `Available in ${n} language${plural}.`,
    downloadOrRead: 'Download links below or read online.',
    downloadHeading: ({ name, label }) => `Download the ${name} ${label}`,
    pickLanguage: 'Free official PDF. Pick your language.',
    pdfNotYet: 'PDF not yet in our library',
    visit: 'Visit the',
    officialDmvSite: ({ name }) => `official ${name} DMV website`,
    toDownloadLatest: ({ label }) => `to download the latest ${label} directly.`,
    readyToTest: 'Ready to test your knowledge?',
    practiceHeading: ({ name, testLabel }) => `${name} ${testLabel} Practice`,
    practiceSub: ({ name, label }) => `Real questions based on the official ${name} ${label}. Free, no signup needed.`,
    takeFreeTest: ({ testLabel }) => `Take Free ${testLabel}`,
    faqTitle: 'Frequently Asked Questions',
    otherManuals: ({ name }) => `Other ${name} Manuals`,
    allStateManuals: ({ name }) => `All ${name} Manuals`,
    inNearbyStates: ({ icon, label }) => `${icon} ${label} in Nearby States`,
    all50States: 'All 50 States',
    footer: 'DMVSOS.com · Free DMV Practice Tests & Driver Manuals for All 50 States',
  },
  ru: {
    allManuals: 'Все руководства',
    freeTest: 'Бесплатный тест',
    home: 'Главная',
    manuals: 'Руководства',
    officialBadge: ({ year }) => `Официальное руководство ${year}`,
    publishedBy: ({ labelFull, agency }) => `Официальное ${labelFull}, издано ${agency}.`,
    availableIn: ({ n }) => `Доступно на ${n} ${n === 1 ? 'языке' : 'языках'}.`,
    downloadOrRead: 'Ссылки для скачивания ниже или читайте онлайн.',
    downloadHeading: ({ name, label }) => `Скачать ${name} ${label}`,
    pickLanguage: 'Бесплатный официальный PDF. Выберите язык.',
    pdfNotYet: 'PDF пока нет в нашей библиотеке',
    visit: 'Зайдите на',
    officialDmvSite: ({ name }) => `официальный сайт DMV штата ${name}`,
    toDownloadLatest: ({ label }) => `, чтобы скачать актуальное ${label} напрямую.`,
    readyToTest: 'Готовы проверить свои знания?',
    practiceHeading: ({ name, testLabel }) => `Практика ${name} ${testLabel}`,
    practiceSub: ({ name, label }) => `Реальные вопросы на основе официального ${name} ${label}. Бесплатно, без регистрации.`,
    takeFreeTest: ({ testLabel }) => `Пройти бесплатно ${testLabel}`,
    faqTitle: 'Частые вопросы',
    otherManuals: ({ name }) => `Другие руководства ${name}`,
    allStateManuals: ({ name }) => `Все руководства ${name}`,
    inNearbyStates: ({ icon, label }) => `${icon} ${label} в соседних штатах`,
    all50States: 'Все 50 штатов',
    footer: 'DMVSOS.com · Бесплатные тесты DMV и руководства водителя для всех 50 штатов',
  },
  es: {
    allManuals: 'Todos los manuales',
    freeTest: 'Prueba gratis',
    home: 'Inicio',
    manuals: 'Manuales',
    officialBadge: ({ year }) => `Manual oficial ${year}`,
    publishedBy: ({ labelFull, agency }) => `${labelFull} oficial publicado por ${agency}.`,
    availableIn: ({ n }) => `Disponible en ${n} ${n === 1 ? 'idioma' : 'idiomas'}.`,
    downloadOrRead: 'Enlaces de descarga abajo o léelo en línea.',
    downloadHeading: ({ name, label }) => `Descargar el ${label} de ${name}`,
    pickLanguage: 'PDF oficial gratis. Elige tu idioma.',
    pdfNotYet: 'El PDF aún no está en nuestra biblioteca',
    visit: 'Visita el',
    officialDmvSite: ({ name }) => `sitio oficial del DMV de ${name}`,
    toDownloadLatest: ({ label }) => `para descargar el ${label} más reciente directamente.`,
    readyToTest: '¿Listo para poner a prueba tus conocimientos?',
    practiceHeading: ({ name, testLabel }) => `Práctica del ${testLabel} de ${name}`,
    practiceSub: ({ name, label }) => `Preguntas reales basadas en el ${label} oficial de ${name}. Gratis, sin registro.`,
    takeFreeTest: ({ testLabel }) => `Hacer el ${testLabel} gratis`,
    faqTitle: 'Preguntas frecuentes',
    otherManuals: ({ name }) => `Otros manuales de ${name}`,
    allStateManuals: ({ name }) => `Todos los manuales de ${name}`,
    inNearbyStates: ({ icon, label }) => `${icon} ${label} en estados cercanos`,
    all50States: 'Los 50 estados',
    footer: 'DMVSOS.com · Pruebas de práctica del DMV y manuales de conducir gratis para los 50 estados',
  },
  zh: {
    allManuals: '所有手册',
    freeTest: '免费测试',
    home: '主页',
    manuals: '手册',
    officialBadge: ({ year }) => `${year}年官方手册`,
    publishedBy: ({ labelFull, agency }) => `由 ${agency} 发布的官方${labelFull}。`,
    availableIn: ({ n }) => `提供 ${n} 种语言。`,
    downloadOrRead: '下方为下载链接，或在线阅读。',
    downloadHeading: ({ name, label }) => `下载 ${name} ${label}`,
    pickLanguage: '免费官方 PDF。选择你的语言。',
    pdfNotYet: '我们的资料库暂无此 PDF',
    visit: '请访问',
    officialDmvSite: ({ name }) => `${name} DMV 官方网站`,
    toDownloadLatest: ({ label }) => `，直接下载最新的${label}。`,
    readyToTest: '准备好检验你的知识了吗？',
    practiceHeading: ({ name, testLabel }) => `${name} ${testLabel}练习`,
    practiceSub: ({ name, label }) => `基于官方 ${name} ${label} 的真实题目。免费，无需注册。`,
    takeFreeTest: ({ testLabel }) => `免费参加${testLabel}`,
    faqTitle: '常见问题',
    otherManuals: ({ name }) => `${name} 的其他手册`,
    allStateManuals: ({ name }) => `${name} 所有手册`,
    inNearbyStates: ({ icon, label }) => `${icon} 邻近各州的${label}`,
    all50States: '全部 50 个州',
    footer: 'DMVSOS.com · 全美 50 个州的免费 DMV 练习测试和驾驶手册',
  },
  ua: {
    allManuals: 'Усі посібники',
    freeTest: 'Безкоштовний тест',
    home: 'Головна',
    manuals: 'Посібники',
    officialBadge: ({ year }) => `Офіційний посібник ${year}`,
    publishedBy: ({ labelFull, agency }) => `Офіційний ${labelFull}, виданий ${agency}.`,
    availableIn: ({ n }) => `Доступно ${n} ${n === 1 ? 'мовою' : 'мовами'}.`,
    downloadOrRead: 'Посилання для завантаження нижче або читайте онлайн.',
    downloadHeading: ({ name, label }) => `Завантажити ${name} ${label}`,
    pickLanguage: 'Безкоштовний офіційний PDF. Оберіть мову.',
    pdfNotYet: 'PDF поки немає в нашій бібліотеці',
    visit: 'Завітайте на',
    officialDmvSite: ({ name }) => `офіційний сайт DMV штату ${name}`,
    toDownloadLatest: ({ label }) => `, щоб завантажити актуальний ${label} напряму.`,
    readyToTest: 'Готові перевірити свої знання?',
    practiceHeading: ({ name, testLabel }) => `Практика ${name} ${testLabel}`,
    practiceSub: ({ name, label }) => `Реальні питання на основі офіційного ${name} ${label}. Безкоштовно, без реєстрації.`,
    takeFreeTest: ({ testLabel }) => `Пройти безкоштовно ${testLabel}`,
    faqTitle: 'Поширені запитання',
    otherManuals: ({ name }) => `Інші посібники ${name}`,
    allStateManuals: ({ name }) => `Усі посібники ${name}`,
    inNearbyStates: ({ icon, label }) => `${icon} ${label} у сусідніх штатах`,
    all50States: 'Усі 50 штатів',
    footer: 'DMVSOS.com · Безкоштовні тести DMV та посібники водія для всіх 50 штатів',
  },
};

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const INDEX_URL = `${SUPABASE_URL}/storage/v1/object/public/manuals/manuals-index.json`;

const VALID_CATS = ['car', 'cdl', 'motorcycle'];

const CAT_META = {
  car: {
    label: "Driver's Handbook",
    labelFull: "Driver's Handbook / DMV Manual",
    icon: '🚗',
    testLabel: 'DMV Written Test',
    testCat: 'dmv',
    descSuffix: 'car license written knowledge test',
    faqQuestions: (name, abbr, rules) => [
      {
        q: `How many questions are on the ${name} DMV written test?`,
        a: rules
          ? `The ${name} (${abbr}) car knowledge test has ${rules.questions} questions, and you need ${rules.pass} correct (${Math.round((rules.pass / rules.questions) * 100)}%) to pass. You can practice every one of them free at DMVSOS before test day.`
          : `Most state car knowledge tests have 25 to 50 questions with an 80% pass mark. Practice free at DMVSOS so you walk in ready.`,
      },
      {
        q: `What topics are covered in the ${name} driver's handbook?`,
        a: `The ${name} driver's handbook covers traffic laws and regulations, road signs and signals, safe driving practices, right-of-way rules, speed limits, DUI/DWI laws, and vehicle operation requirements specific to ${name}.`,
      },
      {
        q: `Is the ${name} driver's handbook available in Spanish?`,
        a: `Many states publish their driver's handbook in several languages. Every available language for ${name}, including Spanish, Russian, Chinese, and more, is listed above on this page for direct download.`,
      },
      {
        q: `How do I pass the ${name} DMV written test?`,
        a: `Study the official ${name} driver's handbook thoroughly, then take free practice tests at DMVSOS.com to reinforce what you've learned. Most test-takers who study the full handbook and complete several practice tests pass on their first attempt.`,
      },
    ],
  },
  cdl: {
    label: 'CDL Manual',
    labelFull: 'Commercial Driver License Manual',
    icon: '🚛',
    testLabel: 'CDL Knowledge Test',
    testCat: 'cdl',
    descSuffix: 'commercial driver license (CDL) knowledge test',
    faqQuestions: (name, abbr, rules) => [
      {
        q: `What is covered in the ${name} CDL manual?`,
        a: `The ${name} CDL manual covers general knowledge (traffic laws, safe driving), vehicle inspection, basic vehicle control, shifting/backing, pre-trip inspections, hazardous materials, passenger transport, air brakes, and combination vehicles, all following FMCSA federal guidelines.`,
      },
      {
        q: `How many questions are on the ${name} CDL general knowledge test?`,
        a: rules
          ? `The CDL general knowledge test in ${name} (${abbr}) has ${rules.questions} questions, and you need ${rules.pass} correct (${Math.round((rules.pass / rules.questions) * 100)}%) to pass. Endorsement tests (HazMat, Tanker, Passenger, and others) are separate, with 20 to 30 questions each.`
          : `The CDL general knowledge test has 50 questions, and you need 40 correct (80%) to pass. Endorsement tests are separate, with 20 to 30 questions each.`,
      },
      {
        q: `Do I need a CDL to drive a commercial vehicle in ${name}?`,
        a: `Yes. A Commercial Driver License (CDL) is required in ${name} to operate vehicles with a GVWR over 26,000 lbs, vehicles carrying 16+ passengers, or any vehicle transporting hazardous materials requiring placards.`,
      },
      {
        q: `Is the ${name} CDL manual the same as the federal CDL manual?`,
        a: `The ${name} CDL manual is based on the federal FMCSA Commercial Driver's License Standards but may include state-specific regulations. Always study the ${name}-specific version for your test.`,
      },
    ],
  },
  motorcycle: {
    label: 'Motorcycle Handbook',
    labelFull: 'Motorcycle Rider Handbook',
    icon: '🏍️',
    testLabel: 'Motorcycle Knowledge Test',
    testCat: 'moto',
    descSuffix: 'motorcycle license written knowledge test',
    faqQuestions: (name, abbr, rules) => [
      {
        q: `What is covered in the ${name} motorcycle handbook?`,
        a: `The ${name} motorcycle handbook covers motorcycle controls and equipment, riding techniques, defensive riding strategies, intersections and turning, carrying passengers and cargo, special riding conditions (rain, night, highways), and ${name}-specific traffic laws for motorcyclists.`,
      },
      {
        q: `Do I need a separate license to ride a motorcycle in ${name}?`,
        a: `Yes. ${name} requires a motorcycle endorsement (M) or separate motorcycle license to legally ride on public roads. You must pass both a written knowledge test and a skills test (or complete an approved safety course).`,
      },
      {
        q: `How many questions are on the ${name} motorcycle written test?`,
        a: rules
          ? `The ${name} (${abbr}) motorcycle knowledge test has ${rules.questions} questions, and you need ${rules.pass} correct (${Math.round((rules.pass / rules.questions) * 100)}%) to pass. Practice free at DMVSOS to be ready for every one.`
          : `Most state motorcycle knowledge tests have around 25 questions with an 80% pass mark. Practice free at DMVSOS to be ready.`,
      },
      {
        q: `Can I take a motorcycle safety course instead of the written test in ${name}?`,
        a: `Many states allow you to waive the written and/or skills test by completing an approved MSF (Motorcycle Safety Foundation) Basic RiderCourse. Check with the ${name} DMV for current requirements.`,
      },
    ],
  },
};

const LANG_FLAGS = {
  en: '🇺🇸', es: '🇪🇸', ru: '🇷🇺', zh: '🇨🇳', ua: '🇺🇦',
  vi: '🇻🇳', ko: '🇰🇷', ar: '🇸🇦', fr: '🇫🇷', de: '🇩🇪',
  hy: '🇦🇲', hi: '🇮🇳', pa: '🇮🇳', ht: '🇭🇹', so: '🇸🇴',
  sw: '🇰🇪', my: '🇲🇲', ne: '🇳🇵', pt: '🇧🇷', ja: '🇯🇵', hmn: '🌿',
  tl: '🇵🇭', sm: '🇼🇸', to: '🇹🇴', haw: '🌺', mh: '🇲🇭', ilo: '🇵🇭', chk: '🇫🇲',
};

const LANG_LABELS = {
  en: 'English', es: 'Español', zh: '中文', ru: 'Русский', ua: 'Українська',
  vi: 'Tiếng Việt', hy: 'Հայերեն', hi: 'हिन्दी', pa: 'ਪੰਜਾਬੀ', ht: 'Kreyòl',
  ko: '한국어', ar: 'العربية', fr: 'Français', de: 'Deutsch', so: 'Soomaali',
  sw: 'Kiswahili', my: 'မြန်မာ', ne: 'नेपाली', pt: 'Português', ja: '日本語', hmn: 'Hmong',
  tl: 'Filipino', sm: 'Samoa', to: 'Faka-Tonga', haw: 'ʻŌlelo Hawaiʻi', mh: 'Kajin M̧ajeļ', ilo: 'Ilocano', chk: 'Chuukese',
};

// Geographic neighbors for "other states" section
const STATE_NEIGHBORS = {
  alabama: ['georgia', 'florida', 'mississippi', 'tennessee'],
  alaska: ['washington', 'oregon', 'idaho', 'montana'],
  arizona: ['california', 'nevada', 'utah', 'new-mexico'],
  arkansas: ['texas', 'louisiana', 'mississippi', 'tennessee'],
  california: ['oregon', 'nevada', 'arizona', 'washington'],
  colorado: ['utah', 'wyoming', 'nebraska', 'kansas'],
  connecticut: ['new-york', 'massachusetts', 'rhode-island', 'new-jersey'],
  delaware: ['maryland', 'new-jersey', 'pennsylvania', 'virginia'],
  florida: ['georgia', 'alabama', 'south-carolina', 'tennessee'],
  georgia: ['florida', 'south-carolina', 'north-carolina', 'tennessee'],
  hawaii: ['california', 'alaska', 'washington', 'oregon'],
  idaho: ['washington', 'oregon', 'montana', 'wyoming'],
  illinois: ['indiana', 'wisconsin', 'iowa', 'missouri'],
  indiana: ['illinois', 'ohio', 'michigan', 'kentucky'],
  iowa: ['illinois', 'wisconsin', 'minnesota', 'missouri'],
  kansas: ['colorado', 'nebraska', 'oklahoma', 'missouri'],
  kentucky: ['tennessee', 'indiana', 'ohio', 'virginia'],
  louisiana: ['texas', 'arkansas', 'mississippi', 'alabama'],
  maine: ['new-hampshire', 'vermont', 'massachusetts', 'new-york'],
  maryland: ['virginia', 'delaware', 'pennsylvania', 'west-virginia'],
  massachusetts: ['connecticut', 'rhode-island', 'new-york', 'new-hampshire'],
  michigan: ['indiana', 'ohio', 'illinois', 'wisconsin'],
  minnesota: ['wisconsin', 'iowa', 'north-dakota', 'south-dakota'],
  mississippi: ['alabama', 'louisiana', 'tennessee', 'arkansas'],
  missouri: ['illinois', 'iowa', 'kansas', 'tennessee'],
  montana: ['idaho', 'wyoming', 'north-dakota', 'south-dakota'],
  nebraska: ['kansas', 'colorado', 'iowa', 'south-dakota'],
  nevada: ['california', 'arizona', 'utah', 'oregon'],
  'new-hampshire': ['maine', 'vermont', 'massachusetts', 'connecticut'],
  'new-jersey': ['new-york', 'pennsylvania', 'delaware', 'connecticut'],
  'new-mexico': ['arizona', 'colorado', 'utah', 'texas'],
  'new-york': ['new-jersey', 'connecticut', 'pennsylvania', 'massachusetts'],
  'north-carolina': ['south-carolina', 'virginia', 'georgia', 'tennessee'],
  'north-dakota': ['minnesota', 'south-dakota', 'montana', 'wyoming'],
  ohio: ['indiana', 'michigan', 'pennsylvania', 'kentucky'],
  oklahoma: ['texas', 'kansas', 'colorado', 'arkansas'],
  oregon: ['california', 'washington', 'idaho', 'nevada'],
  pennsylvania: ['new-york', 'new-jersey', 'ohio', 'maryland'],
  'rhode-island': ['connecticut', 'massachusetts', 'new-york', 'new-jersey'],
  'south-carolina': ['georgia', 'north-carolina', 'florida', 'virginia'],
  'south-dakota': ['north-dakota', 'minnesota', 'nebraska', 'wyoming'],
  tennessee: ['kentucky', 'virginia', 'north-carolina', 'georgia'],
  texas: ['oklahoma', 'new-mexico', 'louisiana', 'arkansas'],
  utah: ['nevada', 'arizona', 'colorado', 'idaho'],
  vermont: ['new-hampshire', 'new-york', 'massachusetts', 'maine'],
  virginia: ['maryland', 'north-carolina', 'west-virginia', 'tennessee'],
  washington: ['oregon', 'idaho', 'california', 'nevada'],
  'west-virginia': ['virginia', 'maryland', 'pennsylvania', 'ohio'],
  wisconsin: ['minnesota', 'iowa', 'illinois', 'michigan'],
  wyoming: ['montana', 'idaho', 'utah', 'colorado'],
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

// Shared server-rendered body for the per-state, per-category manual page.
// `lang`, `state`, and `cat` arrive as props: the root wrapper passes the
// cookie language, the /[locale]/ wrapper passes the path-segment locale. This
// component reads NO cookies, so a cookieless crawler hitting
// /ru/manuals/[state]/[cat] gets a genuinely Russian body. PAGE_I18N, CAT_META,
// and the JSON-LD are all preserved; only the language source changed.
export default async function StateCatManualBody({ lang, state, cat }) {
  const name = STATE_DISPLAY[state];
  const meta = STATE_META[state];
  const year = new Date().getFullYear();
  const catInfo = CAT_META[cat];

  const tex = t[lang] || t.en;
  const tx = PAGE_I18N[lang] || PAGE_I18N.en;

  // Per-state agency naming: swap the standalone word "DMV" in rendered
  // state-specific copy for the real agency (WA→DOL, TX→DPS, IL→SOS, ...).
  // The \b word-boundary keeps "DMVSOS" intact; no-op for true-DMV states.
  const ag = agencyAbbrForState(state);
  const dmv = (s) => String(s || '').replace(/\bDMV\b/g, ag);

  // Fetch PDFs for this specific category
  const index = await fetchManualIndex();
  const catLangs = index?.[state]?.[cat];
  const pdfs = catLangs
    ? Object.entries(catLangs).map(([langCode, url]) => ({ langCode, url }))
    : [];

  // Other categories for this state
  const otherCats = VALID_CATS.filter(c => c !== cat);

  // Neighbor states (geographic)
  const neighbors = STATE_NEIGHBORS[state] || STATE_SLUGS.filter(s => s !== state).slice(0, 4);

  // FAQ for structured data. Swap the hardcoded "DMV" in the question/answer
  // templates for the state's real agency (e.g. "Check with the {name} DMV"
  // → "...DOL" for WA). Applied here so both the rendered FAQ and the JSON-LD
  // stay consistent. No-op for true-DMV states.
  const faqs = catInfo.faqQuestions(name, meta.abbr, examRulesFor(state, cat))
    .map(({ q, a }) => ({ q: dmv(q), a: dmv(a) }));

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: `${name} ${catInfo.label} ${year}`,
        description: `Official ${name} ${catInfo.labelFull} for the ${meta.abbr} ${catInfo.testLabel}.`,
        author: { '@type': 'Organization', name: meta.agency },
        publisher: { '@type': 'Organization', name: 'DMVSOS', url: 'https://dmvsos.com' },
        url: `https://dmvsos.com/manuals/${state}/${cat}`,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home',    item: 'https://dmvsos.com' },
          { '@type': 'ListItem', position: 2, name: 'Manuals', item: 'https://dmvsos.com/manuals' },
          { '@type': 'ListItem', position: 3, name,            item: `https://dmvsos.com/manuals/${state}` },
          { '@type': 'ListItem', position: 4, name: catInfo.label, item: `https://dmvsos.com/manuals/${state}/${cat}` },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
      ...(pdfs.length > 0 ? [{
        '@type': 'GovernmentService',
        name: `${name} ${catInfo.labelFull}`,
        serviceType: 'Driver Education',
        provider: { '@type': 'GovernmentOrganization', name: meta.agency },
        areaServed: { '@type': 'State', name },
      }] : []),
    ],
  });

  return (
    <div
      className="min-h-screen font-[family-name:var(--font-inter)]"
      style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      {/* Decorative glow, clipped to the viewport so the off-screen circles
          never cause horizontal scroll on mobile. */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(26,86,219,0.08) 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-150px] left-[-150px] w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)' }} />
      </div>

      {/* Header */}
      <header className="w-full max-w-lg mx-auto pt-5 pb-4 px-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition">
            <Image src="/logo.png" alt="DMVSOS" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/manuals" className="text-xs font-medium text-[#64748B] hover:text-[#2563EB] transition">
              {tx.allManuals}
            </Link>
            <Link
              href={`/category?state=${state}&lang=${lang}`}
              className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition"
            >
              {tx.freeTest}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-16">

        {/* Breadcrumb */}
        <nav className="text-xs text-[#94A3B8] mb-5 mt-1" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li><Link href="/" className="hover:text-[#2563EB]">{tx.home}</Link></li>
            <li>/</li>
            <li><Link href="/manuals" className="hover:text-[#2563EB]">{tx.manuals}</Link></li>
            <li>/</li>
            <li><Link href={`/manuals/${state}`} className="hover:text-[#2563EB]">{name}</Link></li>
            <li>/</li>
            <li className="text-[#1A2B4A] font-medium">{catInfo.label}</li>
          </ol>
        </nav>

        {/* H1 */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] rounded-full px-3 py-1">
              {tx.officialBadge({ year })}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#0B1C3D] mb-2 leading-tight" style={{ letterSpacing: '-0.02em' }}>
            {name} {catInfo.label} {year}
          </h1>
          <p className="text-sm text-[#64748B]">
            {tx.publishedBy({ labelFull: catInfo.labelFull, agency: meta.agency })}{' '}
            {pdfs.length > 0
              ? tx.availableIn({ n: pdfs.length, plural: pdfs.length > 1 ? 's' : '' })
              : tx.downloadOrRead}
          </p>
        </div>

        {/* PDF Downloads */}
        {pdfs.length > 0 ? (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 mb-5 shadow-sm">
            <h2 className="text-base font-bold text-[#0B1C3D] mb-1">
              {tx.downloadHeading({ name, label: catInfo.label })}
            </h2>
            <p className="text-xs text-[#94A3B8] mb-4">{tx.pickLanguage}</p>
            <div className="flex flex-col gap-2">
              {pdfs.map(({ langCode, url }) => (
                <a
                  key={langCode}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:bg-[#EFF6FF] transition-all"
                >
                  <span className="flex items-center gap-2.5 text-sm font-medium text-[#1A2B4A]">
                    <span className="text-lg leading-none">{LANG_FLAGS[langCode] || '📄'}</span>
                    {LANG_LABELS[langCode] || langCode.toUpperCase()}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] shrink-0">
                    PDF
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" />
                    </svg>
                  </span>
                </a>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-2xl p-5 mb-5">
            <p className="text-sm font-medium text-[#92400E] mb-1">{tx.pdfNotYet}</p>
            <p className="text-xs text-[#B45309]">
              {tx.visit}{' '}
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(`${name} ${catInfo.labelFull} PDF official`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {dmv(tx.officialDmvSite({ name }))}
              </a>{' '}
              {tx.toDownloadLatest({ label: catInfo.label })}
            </p>
          </div>
        )}

        {/* Practice Test CTA */}
        <div className="bg-[#0B1C3D] rounded-2xl p-6 mb-5 text-center shadow-lg border border-[#1e3a5f]">
          <p className="text-sm font-semibold text-[#60A5FA] mb-2">
            {tx.readyToTest}
          </p>
          <h2 className="text-base font-bold text-white mb-1">
            {tx.practiceHeading({ name, testLabel: catInfo.testLabel })}
          </h2>
          <p className="text-sm text-[#94A3B8] mb-4">
            {tx.practiceSub({ name, label: catInfo.label })}
          </p>
          <Link
            href={`/test?state=${state}&category=${catInfo.testCat}&lang=${lang}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#2563EB] text-white rounded-xl font-semibold hover:bg-[#1D4ED8] transition-colors text-sm"
          >
            {tx.takeFreeTest({ testLabel: catInfo.testLabel })}
          </Link>
        </div>

        {/* FAQ */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-[#0B1C3D] mb-4">
            {tx.faqTitle}
          </h2>
          <div className="space-y-3">
            {faqs.map(({ q, a }) => (
              <div key={q} className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-sm">
                <p className="text-sm font-bold text-[#0B1C3D] mb-2">{q}</p>
                <p className="text-sm text-[#475569] leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Other categories for this state */}
        <div className="mb-8">
          <h2 className="text-sm font-bold text-[#0B1C3D] mb-3">
            {tx.otherManuals({ name })}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {otherCats.map(c => (
              <Link
                key={c}
                href={`/manuals/${state}/${c}`}
                className="p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:shadow-sm transition-all text-sm font-medium text-[#1A2B4A] hover:text-[#2563EB] flex items-center gap-2"
              >
                <span>{CAT_META[c].icon}</span>
                <span>{CAT_META[c].label}</span>
              </Link>
            ))}
            <Link
              href={`/manuals/${state}`}
              className="p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:shadow-sm transition-all text-sm font-medium text-[#1A2B4A] hover:text-[#2563EB] text-center"
            >
              {tx.allStateManuals({ name })}
            </Link>
          </div>
        </div>

        {/* Nearby states | same category */}
        <div className="mb-8">
          <h2 className="text-sm font-bold text-[#0B1C3D] mb-3">
            {tx.inNearbyStates({ icon: catInfo.icon, label: catInfo.label })}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {neighbors.slice(0, 4).map(s => (
              <Link
                key={s}
                href={`/manuals/${s}/${cat}`}
                className="p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:shadow-sm transition-all text-sm font-medium text-[#1A2B4A] hover:text-[#2563EB]"
              >
                {STATE_DISPLAY[s]}{' '}
                <span className="text-[#94A3B8] text-xs">({STATE_META[s].abbr})</span>
              </Link>
            ))}
            <Link
              href="/manuals"
              className="p-3 rounded-xl border border-[#2563EB] bg-[#EFF6FF] text-sm font-semibold text-[#2563EB] text-center col-span-2 hover:bg-[#DBEAFE] transition-colors"
            >
              {tx.all50States}
            </Link>
          </div>
        </div>

      </main>

      <footer className="border-t border-[#E2E8F0] py-8 text-center text-xs text-[#94A3B8]">
        <div className="max-w-lg mx-auto px-4">
          {tx.footer}
        </div>
      </footer>
    </div>
  );
}
