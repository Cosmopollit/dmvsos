'use client';
// Small inline SVG padlock that does a one-shot wiggle on mount (reuses the
// lock-wiggle keyframe in globals.css). Used on locked/upsell CTAs instead of
// the static 🔒 emoji. CSS-only. The mobile app does a lift-shackle loop;
// here we keep the simpler web wiggle that already ships in globals.css.
export default function AnimatedLock({ size = 20, color = '#FFFFFF', className = '' }) {
  return (
    <svg
      className={`lock-animate inline-block shrink-0 ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      {/* Shackle */}
      <path
        d="M8 10V7a4 4 0 0 1 8 0v3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Body */}
      <rect x="5" y="10" width="14" height="10" rx="2.5" fill={color} />
    </svg>
  );
}
