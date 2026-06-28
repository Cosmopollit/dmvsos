'use client';
import { useState, useEffect } from 'react';
import { t } from '@/lib/translations';
import { useAuth } from '@/lib/AuthContext';

// "Take a break" header entry. Opens the Break Mode arcade (/break.html) in
// an overlay. Now open to everyone (previously gated behind first-test-pass).
// The `dmvsos_break_unlocked` localStorage flag is still set by the test result
// page but no longer required to play.
const UNLOCK_KEY = 'dmvsos_break_unlocked';

export default function BreakButton({ langCode = 'en' }) {
  const tex = t[langCode] || t.en;
  const { isPro } = useAuth();
  const [completedTest, setCompletedTest] = useState(false);
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Read the test-completed flag after mount (client-only) and re-check when the
  // tab regains focus, so finishing a test in another tab flips it without reload.
  useEffect(() => {
    const read = () => {
      try { setCompletedTest(localStorage.getItem(UNLOCK_KEY) === '1'); } catch { /* private mode */ }
    };
    read();
    window.addEventListener('focus', read);
    return () => window.removeEventListener('focus', read);
  }, []);

  // Open to everyone. (Was: const unlocked = isPro || completedTest;)
  const unlocked = true;

  // The locked hint is hover-driven on desktop; on touch there is no hover, so a
  // tap shows it and it auto-dismisses.
  useEffect(() => {
    if (!showHint) return;
    const id = setTimeout(() => setShowHint(false), 2600);
    return () => clearTimeout(id);
  }, [showHint]);

  // Lock body scroll + close on Escape while the arcade overlay is open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = tex.navBreak || 'Take a break';
  const lockedHint = tex.navBreakLocked || 'Unlocks after your first test';

  const coffee = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h13v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9z" />
      <path d="M17 10h2.5a2.5 2.5 0 0 1 0 5H17M8 3v2M12 3v2" />
    </svg>
  );
  const lock = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );

  return (
    <>
      {unlocked ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-[#B45309] bg-[#FEF3C7] border border-[#FDE68A] rounded-full px-3 py-1 hover:bg-[#FDE68A] active:scale-95 transition"
        >
          {coffee}
          <span>{label}</span>
        </button>
      ) : (
        <span className="relative inline-flex">
          <button
            type="button"
            aria-label={`${label} — ${lockedHint}`}
            onMouseEnter={() => setShowHint(true)}
            onMouseLeave={() => setShowHint(false)}
            onFocus={() => setShowHint(true)}
            onBlur={() => setShowHint(false)}
            onClick={() => setShowHint(v => !v)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-[#94A3B8] bg-[#F8FAFC] border border-[#E2E8F0] rounded-full px-3 py-1 cursor-help select-none active:scale-95 transition"
          >
            {lock}
            <span>{label}</span>
          </button>
          {showHint && (
            <span
              role="tooltip"
              className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-[60] w-max max-w-[220px] text-center leading-snug text-[11px] font-medium text-white bg-[#0B1C3D] rounded-lg px-2.5 py-1.5 shadow-lg"
            >
              {lockedHint}
              <span aria-hidden="true" className="absolute left-1/2 -translate-x-1/2 -top-1 w-2 h-2 rotate-45 bg-[#0B1C3D]" />
            </span>
          )}
        </span>
      )}

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4"
          style={{ backdropFilter: 'blur(2px)' }}
        >
          <div onClick={e => e.stopPropagation()} className="relative">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-white text-[#0B1C3D] flex items-center justify-center shadow-lg hover:bg-[#F1F5F9] active:scale-95 transition"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <iframe
              src={`/break.html?lang=${langCode}`}
              title="Break Mode"
              className="block rounded-2xl border border-[#1f2a44] shadow-2xl bg-[#050913]"
              style={{ width: 'min(92vw, 360px)', height: 'min(86vh, 680px)' }}
            />
            <a
              href="/game/"
              target="_blank"
              rel="noopener"
              onClick={e => e.stopPropagation()}
              className="block text-center mt-3 text-[11px] font-semibold tracking-[0.18em] text-[#fde047] hover:text-white"
            >
              {tex.navAboutGame || 'ABOUT THE GAME'} →
            </a>
          </div>
        </div>
      )}
    </>
  );
}
