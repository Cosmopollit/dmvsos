'use client';
// Shared primary CTA, ported from the mobile app's GradientButton.tsx.
// A deep brand gradient with a top gloss highlight and a slow shine sweep
// ("переливание"), plus a press scale. CSS-only, no native physics or
// haptics. Renders an <a> (Next Link) when `href` is given, else a <button>.
import Link from 'next/link';

// blue: primary brand action. gold: Pro / unlock action.
const VARIANTS = {
  blue: {
    gradient: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)',
    glow: 'rgba(37,99,235,0.35)',
    text: '#FFFFFF',
  },
  gold: {
    gradient: 'linear-gradient(135deg, #FBBF24 0%, #F59E0B 55%, #D97706 100%)',
    glow: 'rgba(245,158,11,0.4)',
    // Navy on gold: white-on-amber fails contrast (~2:1).
    text: '#0B1C3D',
  },
};

export default function GradientButton({
  href,
  onClick,
  variant = 'blue',
  children,
  className = '',
}) {
  const v = VARIANTS[variant] || VARIANTS.blue;
  const inner = (
    <span
      className="gradient-btn group relative flex items-center justify-center gap-2 w-full overflow-hidden rounded-2xl px-5 py-3.5 text-base font-bold transition-transform duration-100 active:scale-[0.98]"
      style={{ background: v.gradient, color: v.text, boxShadow: `0 6px 18px ${v.glow}` }}
    >
      {/* Top gloss highlight */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2"
        style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.22), rgba(255,255,255,0))' }}
      />
      {/* Shine sweep on an interval */}
      <span aria-hidden="true" className="gradient-btn-shine pointer-events-none absolute inset-y-0 -left-1/2 w-1/2" />
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={`block w-full ${className}`}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={`block w-full ${className}`}>
      {inner}
    </button>
  );
}
