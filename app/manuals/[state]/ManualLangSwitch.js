'use client';
import { saveLang } from '@/lib/lang';
import { useRouter } from 'next/navigation';

const LANGS = [
  { code: 'en', label: 'EN', flag: '🇺🇸' },
  { code: 'ru', label: 'RU', flag: '🇷🇺' },
  { code: 'es', label: 'ES', flag: '🇪🇸' },
  { code: 'zh', label: 'ZH', flag: '🇨🇳' },
  { code: 'ua', label: 'UA', flag: '🇺🇦' },
];

export default function ManualLangSwitch({ currentLang }) {
  const router = useRouter();

  function handleLang(code) {
    saveLang(code);
    router.refresh();
  }

  return (
    <div className="flex gap-1.5 flex-wrap">
      {LANGS.map(({ code, label, flag }) => (
        <button
          key={code}
          type="button"
          onClick={() => handleLang(code)}
          className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
            currentLang === code
              ? 'bg-[#0B1C3D] text-white'
              : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#2563EB] hover:text-[#2563EB]'
          }`}
        >
          {flag} {label}
        </button>
      ))}
    </div>
  );
}
