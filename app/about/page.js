'use client';

import Link from 'next/link';
import Image from 'next/image';
import { getSavedLang } from '@/lib/lang';
import { t } from '@/lib/translations';

export default function AboutPage() {
  const lang = typeof window !== 'undefined' ? getSavedLang() : 'en';
  const tex = t[lang] || t.en;

  return (
    <main className="min-h-screen bg-[#F8FAFC] py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Logo + nav */}
        <Link href="/" className="inline-flex items-center gap-2 mb-8 hover:opacity-90 transition">
          <Image src="/logo.png" alt="DMVSOS" width={36} height={36} className="rounded-xl" />
          <span className="text-[22px] font-bold text-[#0B1C3D] tracking-tight">DMVSOS</span>
        </Link>

        <article className="bg-white rounded-2xl p-8 sm:p-10 shadow-sm border border-[#E2E8F0]">
          <h1 className="text-3xl font-bold text-[#0B1C3D] mb-2">About DMVSOS</h1>
          <p className="text-[#64748B] text-sm mb-8">Run by one person. Built around state-official content.</p>

          <section className="space-y-5 text-[#1E293B] leading-relaxed">
            <p>
              Hi, I&apos;m <strong>Evgenii</strong>. I built DMVSOS because the existing DMV
              prep options are stuck on three things: English-only content, generic questions
              that don&apos;t match the state you&apos;re actually testing in, and monthly
              subscriptions that bill you forever after you got your license.
            </p>
            <p>
              <strong>DMVSOS</strong> fixes all three.
            </p>

            <h2 className="text-xl font-bold text-[#0B1C3D] pt-4">What we do</h2>
            <ul className="space-y-2 list-disc pl-6">
              <li>
                Practice tests for <strong>all 50 US states</strong> + DC. Every question comes
                from that state&apos;s <strong>official Driver Handbook</strong>.
              </li>
              <li>
                <strong>5 languages</strong>: English, Spanish, Russian, Ukrainian, Chinese.
                Each question, each option, each explanation, all translated.
              </li>
              <li>
                <strong>Car, CDL, and Motorcycle</strong> categories.
              </li>
              <li>
                <strong>One-time payment.</strong> $19.99 (Moto), $29.99 (Auto), $49.99 (CDL Pro).
                30 days of unlimited practice. No subscription. Extension is $9.99 if you need
                more time.
              </li>
              <li>
                <strong>Free to start.</strong> 20 questions per state per language, no signup.
              </li>
              <li>
                <strong>CDL Pass Guarantee:</strong> if you score 85%+ on practice and fail the
                actual DMV test, we refund or extend 90 days. Your choice.
              </li>
            </ul>

            <h2 className="text-xl font-bold text-[#0B1C3D] pt-4">Where the questions come from</h2>
            <p>
              I&apos;m not selling you leaked exam answers. Nobody legitimate has those. Every
              question is written from the official state Driver Handbook (the same source the
              real DMV exam draws from), in the same format and difficulty. We cite the exact
              section of the handbook under each question.
            </p>
            <p>
              If you spot a question that looks wrong, there&apos;s a 🐛 Report button under
              every answer. It pings me directly via Telegram. I fix the question that day or
              the next.
            </p>

            <h2 className="text-xl font-bold text-[#0B1C3D] pt-4">Support</h2>
            <p>
              No call center, no chatbot maze. Write to me on Telegram:{' '}
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
              . I read everything personally, usually reply within 4 hours.
            </p>

            <h2 className="text-xl font-bold text-[#0B1C3D] pt-4">Why I keep it small</h2>
            <p>
              No investors, no growth team, no marketing fluff. Just me, your money goes to
              running the servers and translating new questions when state handbooks update.
              The whole thing exists because I needed it and figured others did too.
            </p>
            <p>
              If you pass your test thanks to this, send a message. It keeps me going.
            </p>

            <div className="pt-6 mt-6 border-t border-[#E2E8F0] text-sm text-[#64748B] space-y-2">
              <p>
                <strong>Contact:</strong>{' '}
                <a href="mailto:maindmvsos@gmail.com" className="text-[#2563EB]">maindmvsos@gmail.com</a>
                {' '}·{' '}
                <a href="https://t.me/dmvsos_support_bot" target="_blank" rel="noopener noreferrer" className="text-[#2563EB]">@dmvsos_support_bot</a>
              </p>
              <p>
                <strong>Refunds:</strong> Full refund within 24 hours of purchase. Just reply to the receipt or message me.
              </p>
              <p>
                <strong>Terms / Privacy:</strong>{' '}
                <Link href="/terms" className="text-[#2563EB]">Terms</Link>
                {' · '}
                <Link href="/privacy" className="text-[#2563EB]">Privacy Policy</Link>
              </p>
            </div>
          </section>
        </article>

        <div className="mt-6 text-center">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-[#2563EB] font-medium hover:underline">
            ← {tex.home || 'Home'}
          </Link>
        </div>
      </div>
    </main>
  );
}
