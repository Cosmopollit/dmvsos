'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';

const QA = [
  {
    q: 'Is DMVSOS really free to start?',
    a: 'Yes. You can practice 20 questions per state, per language, per category without signing up. No credit card, no email required to start. If you want unlimited practice, paid passes are one-time payments (no subscription): Moto $19.99, Auto $29.99, CDL Pro $49.99. Each gives 30 days of unlimited access.',
  },
  {
    q: 'Are these the actual DMV test questions?',
    a: 'Yes. You practice the real DMV test questions for your state, the same ones you\'ll see on test day.',
  },
  {
    q: 'Which US states do you cover?',
    a: 'All 50 US states plus Washington DC. Every state has its own question bank built from that state\'s current Driver Handbook. We update when the handbook updates.',
  },
  {
    q: 'Which languages are supported?',
    a: 'English, Spanish (Español), Russian (Русский), Ukrainian (Українська), and Chinese (中文). Every question, every answer option, and every explanation is translated into all 5 languages. You can switch language mid-test from the top-right corner.',
  },
  {
    q: 'Do you offer the Commercial Driver License (CDL) test?',
    a: 'Yes. CDL Pro pass includes General Knowledge, Air Brakes, and Combination Vehicles sections. Specific endorsements (Hazmat, Tanker, Passenger, School Bus) are coming. CDL Pro includes our Pass Guarantee: if you score 85%+ on practice and fail the real DMV test, we refund or extend 90 days.',
  },
  {
    q: 'Is there a subscription?',
    a: 'No. Passes are one-time payments for 30 days of access. After 30 days the pass simply expires. No automatic renewal, no recurring charges. If you need more time you can extend for $9.99 for another 30 days.',
  },
  {
    q: 'What is the refund policy?',
    a: 'Full refund within 24 hours of purchase, no questions asked. Just message us. CDL Pro also has a Pass Guarantee: 90-day extension or refund if you fail the actual DMV test after scoring 85%+ on our practice.',
  },
  {
    q: 'Do I need to create an account?',
    a: 'Only if you want to save progress across devices or upgrade to a paid pass. Practice tests work without signup. Account is via Google or magic-link email (no password).',
  },
  {
    q: 'Can I download the official Driver Handbook?',
    a: 'Yes, for free. We mirror the official PDF for every US state at /manuals. For ~22 states we also have translated versions in multiple languages. The PDF is the same one published by the state DMV.',
  },
  {
    q: 'How do you compare to DriversEd, Aceable, or Driving-Tests.org?',
    a: 'Three differences. (1) We support 5 languages including Russian and Ukrainian, while most competitors are English-only. (2) We charge one-time, not monthly. (3) DMVSOS is run by one founder. You can reach me personally via Telegram or email and I reply within 4 hours.',
  },
  {
    q: 'How can I report a wrong answer or bad translation?',
    a: 'Every question has a small 🐛 Report button under the explanation. Tap it, pick a reason (wrong answer, bad translation, unclear, etc.), optionally add a comment. The report pings me directly via Telegram. I fix it the same day or the next.',
  },
  {
    q: 'Is my payment information secure?',
    a: 'Yes. We never see or store your card details. All payments go through Stripe (PCI Level 1 compliant). We only see the last 4 digits of your card for support purposes.',
  },
  {
    q: 'Where are you based?',
    a: 'DMVSOS is run by Evgenii, a solo founder based in the US. The platform is hosted on Vercel + Supabase. Customer support is via Telegram (@dmvsos_support_bot) or email (maindmvsos@gmail.com).',
  },
  {
    q: 'How often are questions updated?',
    a: 'We update when state Driver Handbooks change (typically once a year per state). New states\' handbooks added when official versions go live. Bug reports from users are reviewed daily and fixed immediately if confirmed.',
  },
  {
    q: 'Can I take the test on my phone?',
    a: 'Yes. dmvsos.com is mobile-first design. Most users practice on their phone. iOS and Android work in any browser.',
  },
];

export default function FaqPage() {
  const [openIdx, setOpenIdx] = useState(0);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: QA.map(item => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.a,
          },
        })),
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: ['h1', '.faq-question', '.faq-answer'],
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://dmvsos.com' },
          { '@type': 'ListItem', position: 2, name: 'FAQ',  item: 'https://dmvsos.com/faq' },
        ],
      },
    ],
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC] py-10 px-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="max-w-2xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 mb-8 hover:opacity-90 transition">
          <Image src="/logo.png" alt="DMVSOS" width={36} height={36} className="rounded-xl" />
          <span className="text-[22px] font-bold text-[#0B1C3D] tracking-tight">DMVSOS</span>
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[#0B1C3D] mb-2">Frequently asked questions</h1>
          <p className="text-[#64748B] text-sm">
            About DMVSOS practice tests, pricing, refunds, and how we compare to other sites.
          </p>
        </header>

        <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] divide-y divide-[#E2E8F0]">
          {QA.map((item, i) => {
            const isOpen = openIdx === i;
            return (
              <div key={i}>
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? -1 : i)}
                  className="w-full text-left px-5 sm:px-6 py-4 flex items-center justify-between gap-3 hover:bg-[#F8FAFC] transition-colors"
                >
                  <span className="faq-question text-sm sm:text-base font-semibold text-[#0B1C3D]">
                    {item.q}
                  </span>
                  <span className="text-[#94A3B8] text-sm shrink-0">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <div className="px-5 sm:px-6 pb-4 -mt-1">
                    <p className="faq-answer text-sm text-[#475569] leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 text-center text-sm text-[#64748B]">
          Still have a question? Message{' '}
          <a
            href="https://t.me/dmvsos_support_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#2563EB] underline underline-offset-2 font-medium"
          >
            @dmvsos_support_bot
          </a>
          {' '}or email{' '}
          <a href="mailto:maindmvsos@gmail.com" className="text-[#2563EB] underline underline-offset-2 font-medium">
            maindmvsos@gmail.com
          </a>
          .
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-[#2563EB] font-medium hover:underline">
            ← Home
          </Link>
        </div>
      </div>
    </main>
  );
}
