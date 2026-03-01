'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSavedLang } from '@/lib/lang';
import { useAuth } from '@/lib/AuthContext';

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const INDEX_URL = `${SUPABASE_URL}/storage/v1/object/public/manuals/manuals-index.json`;

const LANG_NAMES = {
  en: 'English', es: 'Spanish', zh: 'Chinese', ru: 'Russian', vi: 'Vietnamese',
  hy: 'Armenian', hi: 'Hindi', pa: 'Punjabi', ht: 'Haitian Creole', ko: 'Korean',
  ar: 'Arabic', fr: 'French', de: 'German', ua: 'Ukrainian', so: 'Somali',
  sw: 'Swahili', my: 'Burmese', ne: 'Nepali', pt: 'Portuguese', ja: 'Japanese',
  hmn: 'Hmong',
};

const CATEGORY_LABELS = {
  car: 'Car (DMV)',
  cdl: 'CDL',
  motorcycle: 'Motorcycle',
};

const STATE_DISPLAY = {
  alabama: 'Alabama', alaska: 'Alaska', arizona: 'Arizona', arkansas: 'Arkansas',
  california: 'California', colorado: 'Colorado', connecticut: 'Connecticut',
  delaware: 'Delaware', florida: 'Florida', georgia: 'Georgia', hawaii: 'Hawaii',
  idaho: 'Idaho', illinois: 'Illinois', indiana: 'Indiana', iowa: 'Iowa',
  kansas: 'Kansas', kentucky: 'Kentucky', louisiana: 'Louisiana', maine: 'Maine',
  maryland: 'Maryland', massachusetts: 'Massachusetts', michigan: 'Michigan',
  minnesota: 'Minnesota', mississippi: 'Mississippi', missouri: 'Missouri',
  montana: 'Montana', nebraska: 'Nebraska', nevada: 'Nevada',
  'new-hampshire': 'New Hampshire', 'new-jersey': 'New Jersey',
  'new-mexico': 'New Mexico', 'new-york': 'New York',
  'north-carolina': 'North Carolina', 'north-dakota': 'North Dakota',
  ohio: 'Ohio', oklahoma: 'Oklahoma', oregon: 'Oregon', pennsylvania: 'Pennsylvania',
  'rhode-island': 'Rhode Island', 'south-carolina': 'South Carolina',
  'south-dakota': 'South Dakota', tennessee: 'Tennessee', texas: 'Texas',
  utah: 'Utah', vermont: 'Vermont', virginia: 'Virginia', washington: 'Washington',
  'west-virginia': 'West Virginia', wisconsin: 'Wisconsin', wyoming: 'Wyoming',
};

const UI = {
  en: {
    title: 'Free DMV Driver Manuals',
    subtitle: 'Official driver handbooks for all 50 US states. Download PDF manuals in multiple languages.',
    selectState: 'Select your state',
    category: 'Category',
    availableLanguages: 'Available languages',
    download: 'Download PDF',
    noManuals: 'No manuals available for this selection yet.',
    backHome: 'Back to Home',
    allStates: 'All states',
    practiceTest: 'Take Practice Test',
  },
  ru: {
    title: 'Бесплатные руководства водителя',
    subtitle: 'Официальные руководства для водителей всех 50 штатов США. Скачайте PDF на нескольких языках.',
    selectState: 'Выберите штат',
    category: 'Категория',
    availableLanguages: 'Доступные языки',
    download: 'Скачать PDF',
    noManuals: 'Для этого выбора пока нет руководств.',
    backHome: 'На главную',
    allStates: 'Все штаты',
    practiceTest: 'Пройти тест',
  },
  es: {
    title: 'Manuales de conducir gratuitos',
    subtitle: 'Manuales oficiales para conductores de los 50 estados. Descarga PDF en varios idiomas.',
    selectState: 'Selecciona tu estado',
    category: 'Categoria',
    availableLanguages: 'Idiomas disponibles',
    download: 'Descargar PDF',
    noManuals: 'No hay manuales disponibles para esta seleccion.',
    backHome: 'Volver al inicio',
    allStates: 'Todos los estados',
    practiceTest: 'Hacer examen',
  },
  zh: {
    title: '免费驾驶手册',
    subtitle: '所有50个州的官方驾驶手册。多语言PDF下载。',
    selectState: '选择您的州',
    category: '类别',
    availableLanguages: '可用语言',
    download: '下载PDF',
    noManuals: '此选择暂无手册。',
    backHome: '返回首页',
    allStates: '所有州',
    practiceTest: '参加练习测试',
  },
  ua: {
    title: 'Безкоштовні посібники водія',
    subtitle: 'Офіційні посібники водіїв усіх 50 штатів США. Завантажте PDF кількома мовами.',
    selectState: 'Оберіть штат',
    category: 'Категорія',
    availableLanguages: 'Доступні мови',
    download: 'Завантажити PDF',
    noManuals: 'Для цього вибору поки немає посібників.',
    backHome: 'На головну',
    allStates: 'Усі штати',
    practiceTest: 'Пройти тест',
  },
};

export default function ManualsPage() {
  const searchParams = useSearchParams();
  const stateParam = searchParams.get('state');
  const [index, setIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedState, setSelectedState] = useState(stateParam || '');
  const [selectedCategory, setSelectedCategory] = useState('car');
  const [lang] = useState(() => getSavedLang());
  const tex = UI[lang] || UI.en;

  useEffect(() => {
    fetch(INDEX_URL)
      .then(r => r.json())
      .then(data => { setIndex(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (stateParam && stateParam !== selectedState) {
      setSelectedState(stateParam);
    }
  }, [stateParam]);

  const stateData = index?.[selectedState];
  const categoryData = stateData?.[selectedCategory];
  const availableCategories = stateData ? Object.keys(stateData) : [];

  // Count total manuals
  const totalManuals = index ? Object.values(index).reduce((sum, cats) =>
    sum + Object.values(cats).reduce((s, langs) => s + Object.keys(langs).length, 0), 0
  ) : 0;
  const totalStates = index ? Object.keys(index).length : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F0F4FF] to-white font-[family-name:var(--font-inter)]">
      {/* Header */}
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-[#1A2B4A]">
            DMVSOS
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-[#64748B] hover:text-[#1A2B4A]">
              {tex.backHome}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-[#1A2B4A] mb-3">
            {tex.title}
          </h1>
          <p className="text-[#64748B] text-lg max-w-2xl mx-auto">
            {tex.subtitle}
          </p>
          {index && (
            <p className="text-sm text-[#94A3B8] mt-2">
              {totalStates} states - {totalManuals} manuals available
            </p>
          )}
        </div>

        {loading ? (
          <div className="text-center py-20 text-[#94A3B8]">Loading manuals...</div>
        ) : !index ? (
          <div className="text-center py-20 text-[#94A3B8]">
            Manuals are being prepared. Check back soon.
          </div>
        ) : (
          <div className="space-y-6">
            {/* State Selector */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6">
              <label className="block text-sm font-medium text-[#64748B] mb-2">
                {tex.selectState}
              </label>
              <select
                value={selectedState}
                onChange={(e) => {
                  setSelectedState(e.target.value);
                  setSelectedCategory('car');
                  // Update URL without navigation
                  if (e.target.value) {
                    window.history.replaceState(null, '', `/manuals?state=${e.target.value}`);
                  } else {
                    window.history.replaceState(null, '', '/manuals');
                  }
                }}
                className="w-full p-3 rounded-xl border border-[#E2E8F0] text-[#1A2B4A] text-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              >
                <option value="">{tex.allStates}</option>
                {Object.keys(index).sort().map(s => (
                  <option key={s} value={s}>{STATE_DISPLAY[s] || s}</option>
                ))}
              </select>
            </div>

            {/* Selected state view */}
            {selectedState && stateData ? (
              <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6">
                <h2 className="text-2xl font-bold text-[#1A2B4A] mb-4">
                  {STATE_DISPLAY[selectedState] || selectedState}
                </h2>

                {/* Category tabs */}
                <div className="flex gap-2 mb-6">
                  {['car', 'cdl', 'motorcycle'].map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      disabled={!availableCategories.includes(cat)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
                        ${selectedCategory === cat
                          ? 'bg-[#2563EB] text-white'
                          : availableCategories.includes(cat)
                            ? 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                            : 'bg-[#F8FAFC] text-[#CBD5E1] cursor-not-allowed'
                        }`}
                    >
                      {CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>

                {/* Language downloads */}
                {categoryData ? (
                  <div>
                    <h3 className="text-sm font-medium text-[#64748B] mb-3">
                      {tex.availableLanguages}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {Object.entries(categoryData).map(([langCode, url]) => (
                        <a
                          key={langCode}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-4 rounded-xl border border-[#E2E8F0] hover:border-[#2563EB] hover:bg-[#F0F4FF] transition-colors group"
                        >
                          <span className="text-[#1A2B4A] font-medium">
                            {LANG_NAMES[langCode] || langCode}
                          </span>
                          <span className="text-sm text-[#2563EB] group-hover:underline">
                            {tex.download} ↓
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[#94A3B8] text-center py-8">{tex.noManuals}</p>
                )}

                {/* CTA to practice test */}
                <div className="mt-6 pt-6 border-t border-[#E2E8F0]">
                  <Link
                    href={`/category?state=${encodeURIComponent(STATE_DISPLAY[selectedState] || selectedState)}&lang=${lang}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#2563EB] text-white rounded-xl font-medium hover:bg-[#1D4ED8] transition-colors"
                  >
                    {tex.practiceTest} →
                  </Link>
                </div>
              </div>
            ) : !selectedState ? (
              /* All states grid */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.keys(index).sort().map(state => {
                  const cats = index[state];
                  const langCount = new Set(
                    Object.values(cats).flatMap(c => Object.keys(c))
                  ).size;
                  const catList = Object.keys(cats).map(c => CATEGORY_LABELS[c] || c).join(', ');

                  return (
                    <button
                      key={state}
                      onClick={() => {
                        setSelectedState(state);
                        setSelectedCategory('car');
                        window.history.replaceState(null, '', `/manuals?state=${state}`);
                      }}
                      className="text-left p-4 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:bg-[#F0F4FF] transition-colors"
                    >
                      <div className="font-medium text-[#1A2B4A]">
                        {STATE_DISPLAY[state] || state}
                      </div>
                      <div className="text-sm text-[#94A3B8] mt-1">
                        {catList} - {langCount} {langCount === 1 ? 'language' : 'languages'}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-[#94A3B8] py-8">{tex.noManuals}</p>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E2E8F0] mt-16 py-8 text-center text-sm text-[#94A3B8]">
        <div className="max-w-5xl mx-auto px-4">
          DMVSOS.com - Free DMV Practice Tests & Driver Manuals
        </div>
      </footer>
    </div>
  );
}
