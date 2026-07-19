'use client';
import { useState } from 'react';
import GradientButton from '@/app/components/GradientButton';

// PDF download list + the manuals-to-test bridge. The PDF opens in a NEW tab,
// so this tab stays behind it: the moment of the click is the one chance to
// plant the next step. On first click a card appears offering the free test
// for the same state and category, deep-linked straight into /test (which
// auto-starts the free 20 for anonymous users - no /category stop).
//
// Analytics note: GA4 enhanced measurement fires file_download on the anchor
// click natively; nothing extra here.

const CAT_TO_TEST = { car: 'dmv', cdl: 'cdl', motorcycle: 'moto' };

const NUDGE_I18N = {
  en: {
    title: 'The manual is opening in a new tab',
    body: 'While it loads, check yourself: 20 free {state} questions in your language. No signup.',
    cta: 'Start the free test',
  },
  ru: {
    title: 'Мануал открывается в соседней вкладке',
    body: 'Пока он грузится, проверь себя: 20 бесплатных вопросов по {state} на твоём языке. Без регистрации.',
    cta: 'Начать бесплатный тест',
  },
  es: {
    title: 'El manual se abre en otra pestaña',
    body: 'Mientras carga, ponte a prueba: 20 preguntas gratis de {state} en tu idioma. Sin registro.',
    cta: 'Empezar la prueba gratis',
  },
  zh: {
    title: '手册正在新标签页中打开',
    body: '加载期间不妨自测一下：{state} 的20道免费题目，支持您的语言，无需注册。',
    cta: '开始免费测试',
  },
  ua: {
    title: 'Мануал відкривається в сусідній вкладці',
    body: 'Поки він вантажиться, перевір себе: 20 безкоштовних питань по {state} твоєю мовою. Без реєстрації.',
    cta: 'Почати безкоштовний тест',
  },
};

export default function ManualPdfLinks({ links, state, stateName, cat, lang = 'en' }) {
  const [clicked, setClicked] = useState(false);
  const tx = NUDGE_I18N[lang] || NUDGE_I18N.en;
  const testHref = `/test?state=${state}&category=${CAT_TO_TEST[cat] || 'dmv'}&lang=${lang}`;

  return (
    <div>
      <div className="flex flex-col gap-2">
        {links.map(({ langCode, url, label }) => (
          <a
            key={langCode}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setClicked(true)}
            className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:bg-[#EFF6FF] transition-all"
          >
            <span className="flex items-center gap-2.5 text-sm font-medium text-[#1A2B4A]">
              {label}
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
      {clicked && (
        <div className="mt-3 rounded-xl p-4 text-center border border-[#1e3a5f]"
          style={{ background: 'linear-gradient(135deg, #0B1C3D 0%, #10254D 100%)', animation: 'mpl-rise 0.35s ease-out' }}>
          <p className="text-sm font-bold text-white mb-1">{tx.title}</p>
          <p className="text-xs text-[#94A3B8] mb-3">{tx.body.replace('{state}', stateName)}</p>
          <GradientButton href={testHref} variant="blue" className="max-w-[260px] mx-auto">
            {tx.cta}
          </GradientButton>
          <style jsx>{`
            @keyframes mpl-rise {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
