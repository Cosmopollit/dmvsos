import Link from 'next/link';
import { notFound } from 'next/navigation';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META } from '@/lib/manual-data';

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const INDEX_URL = `${SUPABASE_URL}/storage/v1/object/public/manuals/manuals-index.json`;

const VALID_CATS = ['car', 'cdl', 'motorcycle'];

const CAT_META = {
  car:        { label: "Driver's Handbook", icon: '🚗', testCat: 'dmv' },
  cdl:        { label: 'CDL Manual',        icon: '🚛', testCat: 'cdl' },
  motorcycle: { label: 'Motorcycle Handbook', icon: '🏍️', testCat: 'moto' },
};

const LANG_FLAGS = {
  en: '🇺🇸', es: '🇪🇸', ru: '🇷🇺', zh: '🇨🇳', ua: '🇺🇦',
  vi: '🇻🇳', ko: '🇰🇷', ar: '🇸🇦', fr: '🇫🇷', de: '🇩🇪',
  hy: '🇦🇲', hi: '🇮🇳', pa: '🇮🇳', ht: '🇭🇹', so: '🇸🇴',
  sw: '🇰🇪', my: '🇲🇲', ne: '🇳🇵', pt: '🇧🇷', ja: '🇯🇵', hmn: '🌿',
};

const LANG_LABELS = {
  en: 'English', es: 'Español', zh: '中文', ru: 'Русский', ua: 'Українська',
  vi: 'Tiếng Việt', hy: 'Հայերեն', hi: 'हिन्दी', pa: 'ਪੰਜਾਬੀ', ht: 'Kreyòl',
  ko: '한국어', ar: 'العربية', fr: 'Français', de: 'Deutsch', so: 'Soomaali',
  sw: 'Kiswahili', my: 'မြန်မာ', ne: 'नेपाली', pt: 'Português', ja: '日本語', hmn: 'Hmong',
};

// Language-specific phrases for native speakers
const LANG_NATIVE = {
  en: { in: 'in English',       download: 'Download PDF',        study: 'Study for the DMV test',         cta: 'Take Free Practice Test →' },
  es: { in: 'en Español',       download: 'Descargar PDF',        study: 'Estudia para el examen de manejo', cta: 'Tomar prueba gratis →' },
  ru: { in: 'на русском',       download: 'Скачать PDF',          study: 'Подготовьтесь к экзамену ПДД',     cta: 'Бесплатный тест →' },
  zh: { in: '中文版',            download: '下载 PDF',             study: '备考驾照笔试',                      cta: '免费练习测试 →' },
  ua: { in: 'українською',      download: 'Завантажити PDF',      study: 'Підготуйтеся до екзамену',         cta: 'Безкоштовний тест →' },
  vi: { in: 'tiếng Việt',       download: 'Tải PDF',              study: 'Ôn thi bằng lái xe',               cta: 'Kiểm tra miễn phí →' },
  ko: { in: '한국어',            download: 'PDF 다운로드',          study: '운전면허 필기시험 준비',              cta: '무료 테스트 →' },
  ar: { in: 'بالعربية',         download: 'تحميل PDF',            study: 'استعد لاختبار القيادة',             cta: 'اختبار مجاني →' },
  fr: { in: 'en Français',      download: 'Télécharger PDF',      study: "Préparez l'examen du permis",       cta: 'Test gratuit →' },
  de: { in: 'auf Deutsch',      download: 'PDF herunterladen',    study: 'Führerscheinprüfung vorbereiten',   cta: 'Kostenloser Test →' },
  hy: { in: 'հայերեն',          download: 'Բեռնել PDF',           study: 'Պատրաստվեք քննությանը',            cta: 'Անվճար թեստ →' },
  hi: { in: 'हिंदी में',         download: 'PDF डाउनलोड करें',    study: 'ड्राइविंग टेस्ट की तैयारी',        cta: 'मुफ्त टेस्ट →' },
  pa: { in: 'ਪੰਜਾਬੀ ਵਿੱਚ',      download: 'PDF ਡਾਊਨਲੋਡ ਕਰੋ',    study: 'ਡ੍ਰਾਈਵਿੰਗ ਟੈਸਟ ਦੀ ਤਿਆਰੀ',         cta: 'ਮੁਫਤ ਟੈਸਟ →' },
  ht: { in: 'an Kreyòl',        download: 'Telechaje PDF',        study: 'Prepare egzamen kondwit ou',        cta: 'Tès gratis →' },
  so: { in: 'Soomaali',         download: 'Soo dejiso PDF',       study: 'U diyaarso imtixaanka baabulaynta', cta: 'Imtixaan bilaash →' },
  sw: { in: 'Kiswahili',        download: 'Pakua PDF',            study: 'Jiandae kwa mtihani wa udereva',    cta: 'Mtihani wa bure →' },
  my: { in: 'မြန်မာဘာသာ',       download: 'PDF ဒေါင်းလုပ်',      study: 'ယာဉ်မောင်းစာမေးပွဲ ပြင်ဆင်ပါ',   cta: 'အခမဲ့ စမ်းသပ် →' },
  ne: { in: 'नेपालीमा',         download: 'PDF डाउनलोड गर्नुस्',  study: 'ड्राइभिङ परीक्षाको तयारी',         cta: 'निःशुल्क परीक्षा →' },
  pt: { in: 'em Português',     download: 'Baixar PDF',           study: 'Estude para o exame de direção',    cta: 'Teste gratuito →' },
  ja: { in: '日本語版',          download: 'PDF ダウンロード',      study: '運転免許筆記試験の勉強',              cta: '無料テスト →' },
  hmn: { in: 'lus Hmoob',       download: 'Rub PDF',              study: 'Kawm rau kev sim tsav tsheb',       cta: 'Kev sim dawb →' },
};

// Full language name in English for SEO titles
const LANG_ENGLISH_NAME = {
  en: 'English', es: 'Spanish', ru: 'Russian', zh: 'Chinese', ua: 'Ukrainian',
  vi: 'Vietnamese', ko: 'Korean', ar: 'Arabic', fr: 'French', de: 'German',
  hy: 'Armenian', hi: 'Hindi', pa: 'Punjabi', ht: 'Haitian Creole', so: 'Somali',
  sw: 'Swahili', my: 'Burmese', ne: 'Nepali', pt: 'Portuguese', ja: 'Japanese', hmn: 'Hmong',
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

  const title = `${name} ${catInfo.label} in ${langEN} — Free PDF ${year} | DMVSOS`;
  const description = `Download the official ${name} ${catInfo.label} in ${langEN} (${year}) — free PDF. ${native?.study || 'Study for your DMV test'} with the official handbook ${native?.in || ''}.`;

  return {
    title,
    description,
    alternates: { canonical: `https://www.dmvsos.com/manuals/${state}/${cat}/${lang}` },
    openGraph: {
      title,
      description,
      url: `https://www.dmvsos.com/manuals/${state}/${cat}/${lang}`,
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
  const flag = LANG_FLAGS[lang] || '📄';
  const nativeLabel = LANG_LABELS[lang] || lang.toUpperCase();

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
          { '@type': 'ListItem', position: 1, name: 'Home',              item: 'https://www.dmvsos.com' },
          { '@type': 'ListItem', position: 2, name: 'Manuals',           item: 'https://www.dmvsos.com/manuals' },
          { '@type': 'ListItem', position: 3, name,                      item: `https://www.dmvsos.com/manuals/${state}` },
          { '@type': 'ListItem', position: 4, name: catInfo.label,       item: `https://www.dmvsos.com/manuals/${state}/${cat}` },
          { '@type': 'ListItem', position: 5, name: langEN,              item: `https://www.dmvsos.com/manuals/${state}/${cat}/${lang}` },
        ],
      },
      {
        '@type': 'Article',
        headline: `${name} ${catInfo.label} in ${langEN} ${year}`,
        description: `Official ${name} ${catInfo.label} in ${langEN}. Free PDF published by ${meta.agency}.`,
        inLanguage: lang,
        author: { '@type': 'Organization', name: meta.agency },
        publisher: { '@type': 'Organization', name: 'DMVSOS', url: 'https://www.dmvsos.com' },
        url: `https://www.dmvsos.com/manuals/${state}/${cat}/${lang}`,
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
            <img src="/logo.png" alt="DMVSOS" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/manuals" className="text-xs font-medium text-[#64748B] hover:text-[#2563EB] transition">
              All Manuals
            </Link>
            <Link
              href={`/category?state=${state}&lang=${lang}`}
              className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition"
            >
              Free Test →
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-16">

        {/* Breadcrumb */}
        <nav className="text-xs text-[#94A3B8] mb-5 mt-1" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li><Link href="/" className="hover:text-[#2563EB]">Home</Link></li>
            <li>/</li>
            <li><Link href="/manuals" className="hover:text-[#2563EB]">Manuals</Link></li>
            <li>/</li>
            <li><Link href={`/manuals/${state}`} className="hover:text-[#2563EB]">{name}</Link></li>
            <li>/</li>
            <li><Link href={`/manuals/${state}/${cat}`} className="hover:text-[#2563EB]">{catInfo.label}</Link></li>
            <li>/</li>
            <li className="text-[#1A2B4A] font-medium">{flag} {nativeLabel}</li>
          </ol>
        </nav>

        {/* H1 */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-2xl">{flag}</span>
            <span className="text-xs font-bold text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] rounded-full px-3 py-1 uppercase tracking-widest">
              Official {year} — {nativeLabel}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#0B1C3D] mb-2 leading-tight" style={{ letterSpacing: '-0.02em' }}>
            {name} {catInfo.label}
            <span className="block text-[#2563EB]">{native.in}</span>
          </h1>
          <p className="text-sm text-[#64748B]">
            {name} {catInfo.label} in {langEN} — official {year} edition by {meta.agency}.
            Free PDF download below.
          </p>
        </div>

        {/* Primary PDF download — big CTA */}
        <div className="bg-white rounded-2xl border-2 border-[#2563EB] p-6 mb-5 shadow-md text-center">
          <div className="text-4xl mb-3">{flag}</div>
          <p className="text-base font-bold text-[#0B1C3D] mb-1">
            {name} {catInfo.label} — {nativeLabel}
          </p>
          <p className="text-xs text-[#64748B] mb-5">
            {meta.agency} · {year} Edition · Free
          </p>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 bg-[#2563EB] text-white rounded-xl font-bold text-sm hover:bg-[#1D4ED8] transition-colors shadow-md"
          >
            📥 {native.download}
          </a>
          <p className="text-xs text-[#94A3B8] mt-3">Opens official PDF · No signup required</p>
        </div>

        {/* Other languages for same state/cat */}
        {otherLangs.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 mb-5 shadow-sm">
            <h2 className="text-sm font-bold text-[#0B1C3D] mb-3">
              {name} {catInfo.label} — Other Languages
            </h2>
            <div className="flex flex-wrap gap-2">
              {otherLangs.map(l => (
                <Link
                  key={l}
                  href={`/manuals/${state}/${cat}/${l}`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#2563EB] transition-all text-xs font-medium text-[#475569]"
                >
                  <span className="text-base leading-none">{LANG_FLAGS[l] || '📄'}</span>
                  <span>{LANG_LABELS[l] || l.toUpperCase()}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Practice test CTA */}
        <div className="bg-[#0B1C3D] rounded-2xl p-6 mb-5 text-center shadow-lg border border-[#1e3a5f]">
          <p className="text-xs font-semibold text-[#60A5FA] uppercase tracking-widest mb-2">
            {native.study}
          </p>
          <h2 className="text-base font-bold text-white mb-1">
            {name} DMV Practice Test
          </h2>
          <p className="text-sm text-[#94A3B8] mb-4">
            Real questions · {nativeLabel} · Free · No signup
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
              {catInfo.icon} {catInfo.label} {native.in} — Other States
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {otherStatesWithLang.map(s => (
                <Link
                  key={s}
                  href={`/manuals/${s}/${cat}/${lang}`}
                  className="p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:shadow-sm transition-all text-sm font-medium text-[#1A2B4A] hover:text-[#2563EB]"
                >
                  {flag} {STATE_DISPLAY[s]}{' '}
                  <span className="text-[#94A3B8] text-xs">({STATE_META[s].abbr})</span>
                </Link>
              ))}
              <Link
                href={`/manuals/${state}/${cat}`}
                className="p-3 rounded-xl border border-[#2563EB] bg-[#EFF6FF] text-sm font-semibold text-[#2563EB] text-center col-span-2 hover:bg-[#DBEAFE] transition-colors"
              >
                All {name} {catInfo.label} Languages →
              </Link>
            </div>
          </div>
        )}

      </main>

      <footer className="border-t border-[#E2E8F0] py-8 text-center text-xs text-[#94A3B8]">
        <div className="max-w-lg mx-auto px-4">
          DMVSOS.com — Free DMV Practice Tests &amp; Driver Manuals for All 50 States
        </div>
      </footer>
    </div>
  );
}
