'use client';
// Practice-test CTA at the bottom of a state+category manual page.
// State-aware per the base-access rule: a FREE reader gets the "free test"
// invitation (the base-access game lives across free prep, manuals included);
// a PAID reader is already in, so the "free" framing drops and he sees a clean
// "practice" invite. SSR default is the free version (isPro resolves false
// until auth loads) — so the crawlable copy stays SEO-friendly.
import { useAuth } from '@/lib/AuthContext';
import GradientButton from '@/app/components/GradientButton';

export default function ManualPracticeCta({ href, kicker, heading, subFree, subPro, ctaFree, ctaPro }) {
  const { isPro } = useAuth();
  return (
    <div className="bg-[#0B1C3D] rounded-2xl p-6 mb-5 text-center shadow-lg border border-[#1e3a5f]">
      <p className="text-sm font-semibold text-[#60A5FA] mb-2">{kicker}</p>
      <h2 className="text-base font-bold text-white mb-1">{heading}</h2>
      <p className="text-sm text-[#94A3B8] mb-4">{isPro ? subPro : subFree}</p>
      <GradientButton href={href} variant="blue" className="max-w-xs mx-auto">
        {isPro ? ctaPro : ctaFree}
      </GradientButton>
    </div>
  );
}
