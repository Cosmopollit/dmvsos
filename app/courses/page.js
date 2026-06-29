'use client';

// Courses — Stage 0 affiliate window, ported from the mobile app
// (dmvsos-mobile/src/app/courses.tsx). We refer (don't provide) traffic-school
// / defensive-driving / drivers-ed courses; partners pay a commission. The app
// keeps real affiliate URLs in src/lib/affiliates.ts, all currently empty, so
// the screen ships a "coming soon" state until a partner goes live. We mirror
// that here: an amber coming-soon banner, a preview of the course kinds we plan
// to add, and an FTC-style partner disclosure. No dead/commission-less links.

import { Suspense, useState } from 'react';
import { getSavedLang } from '@/lib/lang';
import SiteHeader from '@/app/components/SiteHeader';
import SupportFooter from '@/app/components/SupportFooter';

// All visible copy lives here (local dict, NOT lib/translations.js), matching
// how app/faq, app/vs, app/about localize. Strings ported faithfully from the
// app's translations.ts courses keys. No em-dashes, no AI voice.
const COURSES_I18N = {
  en: {
    title: 'Courses',
    subtitle: 'Online courses to dismiss a ticket, lower your insurance, or get certified.',
    soonBody: 'We are adding partner courses for your state. Check back soon.',
    kinds: [
      'Ticket dismissal / traffic school',
      'Defensive driving',
      'Online drivers ed',
    ],
    partnerNote: 'These are partner courses. We may earn a commission, at no extra cost to you. Prices and rules are set by the provider.',
  },
  ru: {
    title: 'Курсы',
    subtitle: 'Онлайн-курсы, чтобы снять штраф, снизить страховку или получить сертификат.',
    soonBody: 'Мы добавляем курсы партнёров для твоего штата. Загляни позже.',
    kinds: [
      'Снятие штрафа / traffic school',
      'Безопасное вождение',
      'Онлайн drivers ed',
    ],
    partnerNote: 'Это курсы партнёров. Мы можем получить комиссию, для тебя цена та же. Цены и правила устанавливает провайдер.',
  },
  es: {
    title: 'Cursos',
    subtitle: 'Cursos en línea para quitar una multa, bajar tu seguro u obtener un certificado.',
    soonBody: 'Estamos agregando cursos de socios para tu estado. Vuelve pronto.',
    kinds: [
      'Anular multa / escuela de tráfico',
      'Manejo defensivo',
      'Educación vial en línea',
    ],
    partnerNote: 'Son cursos de socios. Podemos ganar una comisión, sin costo extra para ti. Los precios y reglas los fija el proveedor.',
  },
  zh: {
    title: '课程',
    subtitle: '在线课程，可消除罚单、降低保险或获得证书。',
    soonBody: '我们正在为你的州添加合作课程。请稍后再来。',
    kinds: [
      '消除罚单 / 交通学校',
      '防御性驾驶',
      '在线驾驶教育',
    ],
    partnerNote: '这些是合作伙伴课程。我们可能获得佣金，你无需额外付费。价格和规则由提供方设定。',
  },
  ua: {
    title: 'Курси',
    subtitle: 'Онлайн-курси, щоб зняти штраф, знизити страховку або отримати сертифікат.',
    soonBody: 'Ми додаємо курси партнерів для твого штату. Зазирни пізніше.',
    kinds: [
      'Зняття штрафу / traffic school',
      'Безпечне водіння',
      'Онлайн drivers ed',
    ],
    partnerNote: 'Це курси партнерів. Ми можемо отримати комісію, для тебе ціна та сама. Ціни та правила встановлює провайдер.',
  },
};

function CoursesContent() {
  const [lang] = useState(() => getSavedLang() || 'en');
  const tx = COURSES_I18N[lang] || COURSES_I18N.en;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg,#EFF6FF,#FFF7ED)' }}
    >
      <SiteHeader initialLang={lang} />

      <main className="w-full max-w-lg mx-auto px-4 pt-2 pb-6 flex-1">
        <h1 className="text-2xl font-bold text-[#0B1C3D] tracking-tight mb-2">{tx.title}</h1>
        <p className="text-[15px] leading-relaxed text-[#64748B] mb-5">{tx.subtitle}</p>

        <div className="flex items-start gap-2.5 bg-[#FEF3C7] rounded-2xl px-4 py-4 mb-5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
            <path d="M4 5a2 2 0 0 1 2-2h7v16H6a2 2 0 0 0-2 2V5z" /><path d="M13 3h5a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2h-5" />
          </svg>
          <p className="text-[13px] leading-snug font-semibold text-[#92400E]">{tx.soonBody}</p>
        </div>

        <ul className="flex flex-col gap-2 mb-5">
          {tx.kinds.map((kind) => (
            <li
              key={kind}
              className="flex items-center gap-3 bg-white rounded-2xl border border-[#E2E8F0] px-4 py-3.5 shadow-sm"
            >
              <span className="w-9 h-9 rounded-full bg-[#EFF6FF] flex items-center justify-center shrink-0">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 5a2 2 0 0 1 2-2h7v16H6a2 2 0 0 0-2 2V5z" /><path d="M13 3h5a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2h-5" />
                </svg>
              </span>
              <span className="text-[15px] font-semibold text-[#0B1C3D]">{kind}</span>
            </li>
          ))}
        </ul>

        <p className="text-xs leading-relaxed text-[#94A3B8] px-1">{tx.partnerNote}</p>
      </main>

      <SupportFooter lang={lang} />
    </div>
  );
}

export default function CoursesPage() {
  return (
    <Suspense fallback={null}>
      <CoursesContent />
    </Suspense>
  );
}
