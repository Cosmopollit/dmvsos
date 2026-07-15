'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { t } from '@/lib/translations';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { getSavedLang, saveLang } from '@/lib/lang';
import { PLANS, planForCategory } from '@/lib/plans';
import { examRulesFor, passPercentFor } from '@/lib/exam-rules';
import { agencyAbbrForState } from '@/lib/agencies';
import { isInAppBrowser } from '@/lib/emailHints';
import SupportFooter from '@/app/components/SupportFooter';
import GradientButton from '@/app/components/GradientButton';
import AnimatedLock from '@/app/components/AnimatedLock';

// Animated SVG score ring, ported from the app's ScoreRing.tsx: a soft track,
// a gradient arc that sweeps in on mount (CSS stroke-dashoffset), and a tick
// on the track marking the pass threshold. Colored success vs error.
function ScoreRing({ percent, passPercent, passed, size = 188, stroke = 16, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(100, percent)) / 100;
  const offset = c * (1 - target);
  const cx = size / 2;
  // Pass-mark tick: a dot on the track at the threshold angle, clockwise
  // from 12 o'clock (matches the sweep direction).
  let tick = null;
  if (passPercent != null && passPercent > 0 && passPercent < 100) {
    const theta = ((-90 + 360 * (passPercent / 100)) * Math.PI) / 180;
    tick = { x: cx + r * Math.cos(theta), y: cx + r * Math.sin(theta) };
  }
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0">
        <circle cx={cx} cy={cx} r={r} stroke="#F1F5F9" strokeWidth={stroke} fill="none" />
        <circle
          className="score-ring-arc"
          cx={cx}
          cy={cx}
          r={r}
          stroke={`url(#ringGrad-${passed ? 'pass' : 'fail'})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          style={{ '--ring-circ': c, '--ring-target': offset, strokeDashoffset: offset }}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
        {tick && (
          <circle cx={tick.x} cy={tick.y} r={stroke * 0.28} fill="#0B1C3D" stroke="#FFFFFF" strokeWidth={2} />
        )}
        <defs>
          <linearGradient id="ringGrad-pass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22C55E" />
            <stop offset="1" stopColor="#16A34A" />
          </linearGradient>
          <linearGradient id="ringGrad-fail" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FBBF24" />
            <stop offset="1" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}

// The big % counts up from 0 on mount via requestAnimationFrame, matching the
// app's CountUp. Falls back to the final value if effects don't run (SSR/no-JS).
function useCountUp(value, duration = 1100, delay = 220) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf;
    let cancelled = false;
    const start = performance.now() + delay;
    const tick = (now) => {
      if (cancelled) return;
      const elapsed = now - start;
      if (elapsed < 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const p = Math.min(1, elapsed / duration);
      setShown(Math.round(value * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [value, duration, delay]);
  return shown;
}

const langs = [
  { label: 'EN', code: 'en' },
  { label: 'RU', code: 'ru' },
  { label: 'ES', code: 'es' },
  { label: 'ZH', code: 'zh' },
  { label: 'UA', code: 'ua' },
];

function ResultContent() {
  const router = useRouter();
  const params = useSearchParams();
  const score = parseInt(params.get('score') || 0, 10);
  const total = Math.max(1, parseInt(params.get('total') || 3, 10));
  const percent = Math.round((score / total) * 100);

  const { user, isPro } = useAuth();

  const [testResults, setTestResults] = useState(null);
  const [expandedRefs, setExpandedRefs] = useState({});
  const [langOverride, setLangOverride] = useState(null);
  const [showLangMenu, setShowLangMenu] = useState(false);
  // OAuth buttons here break inside FB/IG/TikTok webviews (Google blocks
  // OAuth in webviews). Detected after mount to avoid hydration mismatch.
  const [inApp, setInApp] = useState(false);
  useEffect(() => { setInApp(isInAppBrowser()); }, []);
  // Reaching the result screen means a test was finished — unlock the
  // "Take a break" arcade in the header (works for free + Pro, any device).
  useEffect(() => {
    try { localStorage.setItem('dmvsos_break_unlocked', '1'); } catch { /* private mode */ }
  }, []);
  // sessionStorage is client-only; must sync after hydration
  useEffect(() => {
    // sessionStorage first (same-tab flow), then the durable localStorage
    // copy: closing the browser after finishing a test used to destroy the
    // whole review. The durable copy is only trusted if it plausibly belongs
    // to THIS result URL (score/total match when present) and is fresh.
    let parsed = null;
    try {
      const raw = sessionStorage.getItem('testResults');
      parsed = raw ? JSON.parse(raw) : null;
    } catch { /* blocked storage */ }
    if (!parsed) {
      try {
        const raw = localStorage.getItem('dmvsos_last_result');
        const stored = raw ? JSON.parse(raw) : null;
        const fresh = stored && Date.now() - (stored.savedAt || 0) < 7 * 24 * 3600e3;
        const urlScore = params.get('score');
        const urlTotal = params.get('total');
        const matches = stored && (urlScore == null
          || (String(stored.score) === urlScore && String(stored.total) === urlTotal));
        if (fresh && matches) parsed = stored;
      } catch { /* blocked storage */ }
    }
    setTestResults(parsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const questions = testResults?.questions ?? [];
  const userAnswers = testResults?.userAnswers ?? [];
  const elapsed = testResults?.elapsed ?? 0;
  // URL params take precedence: they are written by the test page at finish
  // and survive everything. The old storage-then-'washington' fallback could
  // flip the PASS/FAIL verdict for states with a different pass mark.
  const state = params.get('state') || testResults?.state || 'washington';
  const category = params.get('category') || testResults?.category || 'car';
  const passRule = examRulesFor(state, category);
  const passMark = passRule ? passRule.pass / passRule.questions : 0.8;
  const passPercent = Math.round(passMark * 100);
  const passed = total > 0 && score / total >= passMark;
  const wrongCount = Math.max(0, total - score);
  const countedPercent = useCountUp(percent);
  const lang = langOverride ?? testResults?.lang ?? getSavedLang();
  const currentLang = langs.find(l => l.code === lang) || langs[0];
  function switchLang(code) { setLangOverride(code); saveLang(code); setShowLangMenu(false); }
  const wrongQuestions = questions.filter((q, i) => userAnswers[i] !== q.correctAnswerIndex);
  const tex = t[lang] || t.en;
  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // A failed OAuth start used to be completely silent (dead button). Route
  // the user to /login where the email path always works and errors surface.
  async function oauthSignIn(provider) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      console.error('[result] oauth start failed', provider, error.message);
      router.push(`/login?lang=${lang}`);
    }
  }
  const handleGoogleSignIn = () => oauthSignIn('google');
  const handleAppleSignIn = () => oauthSignIn('apple');
  const handleFacebookSignIn = () => oauthSignIn('facebook');

  function stripQuestion(s) {
    return (s || '').replace(/^\d+\.\s*/, '');
  }
  function stripAnswer(s) {
    return (s || '').replace(/^[A-DА-Га-гa-d]\.\s*/, '');
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-6" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
      <div className="w-full max-w-lg flex flex-col items-center gap-5">
        {/* Header with nav */}
        <div className="w-full flex items-center justify-between">
          <button type="button" onClick={() => router.push(`/category?state=${state}&lang=${lang}`)}
            className="text-sm text-[#94A3B8] hover:text-[#2563EB] transition font-medium">
            {tex.back}
          </button>
          <Link href="/" className="flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition">
            <Image src="/logo.png" alt="DMVSOS" width={24} height={24} className="rounded-md" />
            <span className="text-sm font-bold text-[#0B1C3D]">DMVSOS</span>
          </Link>
          <div className="relative">
            <button type="button" onClick={() => setShowLangMenu(v => !v)} onBlur={() => setTimeout(() => setShowLangMenu(false), 150)}
              className="flex items-center gap-1 text-xs font-semibold text-[#64748B] bg-white border border-[#E2E8F0] rounded-full px-2.5 py-1.5 hover:border-[#2563EB] transition-colors">
              <span>{currentLang.label}</span><svg width="9" height="9" viewBox="0 0 12 12" className="ml-0.5 shrink-0" style={{ fill: '#94A3B8' }}><path d="M6 8L1 3h10z" /></svg>
            </button>
            {showLangMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-lg z-50 py-1 min-w-[90px]">
                {langs.map(l => (
                  <button key={l.code} type="button" onMouseDown={() => switchLang(l.code)}
                    className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-[#F8FAFC] transition-colors ${lang === l.code ? 'text-[#2563EB]' : 'text-[#64748B]'}`}>
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Result hero: illustration, animated score ring + count-up %, badge,
            pass-mark line, and a health-app style 3-cell metric strip. */}
        <div className="bg-white rounded-2xl p-8 w-full shadow-sm border border-[#E2E8F0] text-center flex flex-col items-center">
          <div className="flex justify-center mb-5 h-[100px]">
            <Image
              src={passed ? '/illustrations/trophy.png' : '/illustrations/diary.png'}
              alt=""
              width={passed ? 100 : 150}
              height={passed ? 100 : 100}
              className="select-none h-full w-auto object-contain"
              priority
            />
          </div>

          <ScoreRing percent={percent} passPercent={passPercent} passed={passed} size={188} stroke={16}>
            <div className="text-5xl font-bold text-[#0B1C3D] leading-none">{countedPercent}%</div>
            <div className="text-sm text-[#94A3B8] mt-1.5 font-medium">
              {score}/{total} {tex.resultCorrect}
            </div>
          </ScoreRing>

          <div
            className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold mt-5 ${
              passed ? 'bg-[#F0FDF4] text-[#15803D]' : 'bg-[#FEF2F2] text-[#DC2626]'
            }`}
          >
            {(passed ? tex.passed : tex.notPassed).replace(/[✅❌]/gu, '').trim()}
          </div>

          <p className="text-[#94A3B8] text-xs mt-2.5">
            {tex.passMark} · {passPercent}%
          </p>

          {/* Metric strip: Correct / Wrong / Time. Time cell only when timed. */}
          <div className="flex items-stretch justify-center w-full mt-5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] py-3.5">
            <div className="flex-1 flex flex-col items-center px-2">
              <span className="text-2xl font-bold text-[#16A34A] leading-none">{score}</span>
              <span className="text-[11px] text-[#94A3B8] font-medium mt-1">{tex.resultCorrect}</span>
            </div>
            <div className="w-px bg-[#E2E8F0] self-stretch my-1" />
            <div className="flex-1 flex flex-col items-center px-2">
              <span className="text-2xl font-bold text-[#DC2626] leading-none">{wrongCount}</span>
              <span className="text-[11px] text-[#94A3B8] font-medium mt-1">{tex.resultWrong}</span>
            </div>
            {elapsed > 0 && (
              <>
                <div className="w-px bg-[#E2E8F0] self-stretch my-1" />
                <div className="flex-1 flex flex-col items-center px-2">
                  <span className="text-2xl font-bold text-[#0B1C3D] leading-none tabular-nums">{formatTime(elapsed)}</span>
                  <span className="text-[11px] text-[#94A3B8] font-medium mt-1">{tex.resultTime}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sign in to save results */}
        {!user && (
          <div className="bg-white rounded-2xl p-6 w-full shadow-sm border border-[#E2E8F0] text-center">
            <h3 className="text-lg font-bold text-[#0B1C3D] mb-1 flex items-center justify-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#EFF6FF] shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /></svg>
              </span>
              {tex.saveResults}
            </h3>
            <p className="text-sm text-[#94A3B8] mb-4">{tex.saveSubtext}</p>
            {inApp ? (
              <div className="rounded-xl border border-[#F59E0B] bg-[#FEF3C7] p-3 text-left">
                <p className="text-xs text-[#B45309] leading-relaxed mb-2">{tex.inAppBrowserWarning}</p>
                {/* The warning used to promise an email form that this page
                    does not render — give the webview user an actual path. */}
                <Link href={`/login?lang=${lang}`} className="text-xs font-semibold text-[#B45309] underline">
                  {tex.successSignInCta || 'Sign in with email'}
                </Link>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full bg-white text-[#0B1C3D] border border-[#E2E8F0] py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-3 hover:bg-[#F8FAFC] hover:border-[#2563EB] transition-all"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/><path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/><path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/></svg>
                  {tex.continueGoogle}
                </button>
                <button
                  type="button"
                  onClick={handleAppleSignIn}
                  className="w-full bg-black text-white border border-black py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-3 hover:bg-[#1a1a1a] transition-all mt-2"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="white" className="shrink-0"><path d="M13.4 9.3c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.7-3.2.7-.6 0-1.6-.7-2.7-.7-1.4 0-2.7.8-3.4 2-1.4 2.5-.4 6.2 1 8.2.7 1 1.5 2 2.5 2 1 0 1.4-.6 2.6-.6 1.2 0 1.6.6 2.6.6 1.1 0 1.8-.9 2.5-1.9.8-1.1 1.1-2.2 1.1-2.2s-2-.8-2-3.3zM11.5 3c.6-.7 1-1.6.8-2.5-.8 0-1.8.5-2.3 1.2-.5.6-1 1.5-.8 2.4.9.1 1.8-.4 2.3-1.1z"/></svg>
                  {tex.continueApple}
                </button>
                <button
                  type="button"
                  onClick={handleFacebookSignIn}
                  className="w-full bg-[#1877F2] text-white py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-3 hover:bg-[#166FE5] transition-all mt-2"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="white" className="shrink-0"><path d="M18 9a9 9 0 1 0-10.406 8.89v-6.29H5.309V9h2.285V7.017c0-2.258 1.344-3.505 3.4-3.505.985 0 2.015.176 2.015.176v2.215h-1.135c-1.118 0-1.467.694-1.467 1.406V9h2.496l-.399 2.6h-2.097v6.29A9.003 9.003 0 0 0 18 9z"/></svg>
                  {tex.continueFacebook}
                </button>
              </>
            )}
          </div>
        )}

        {/* Post-test upsell — ABOVE the review on purpose: this is the highest-
            intent moment in the product, and burying the offer under 20 scrolls
            of question review meant most users never saw it. The headline ties
            to the state's real pass mark (same keys as the paywall modal), and
            the CTA preselects the tested category's plan. Hidden for Pro. */}
        {!isPro && (() => {
          const planName = (p) => (
            p.pass_type === 'cdl' ? tex.planCdlPro
              : p.pass_type === 'moto' ? tex.planMotoPass
                : tex.planAutoPass
          );
          const tints = {
            moto: { bg: '#FFF7ED', color: '#D97706' },
            auto: { bg: '#EFF6FF', color: '#2563EB' },
            cdl: { bg: '#FEF3C7', color: '#B45309' },
          };
          const planArt = { moto: '/vehicles/moto-hero.png', auto: '/vehicles/mustang.png', cdl: '/vehicles/truck-hero.png' };
          const pct = total > 0 ? Math.round((score / total) * 100) : 0;
          const passPct = passPercentFor(state, category === 'cdl' ? 'cdl' : category === 'moto' ? 'motorcycle' : 'car') || 80;
          const belowPass = pct < passPct;
          const ag = agencyAbbrForState(state);
          const headline = (belowPass
            ? (tex.upgradeModalTitleShort || 'Below the {agency} pass mark ({passPct}%) — let’s fix that')
            : (tex.upgradeModalTitlePass || 'You’d pass this one. Lock it in for exam day.'))
            .replace('{agency}', ag).replace('{passPct}', String(passPct));
          return (
            <div className="bg-white rounded-2xl p-5 w-full border border-[#E2E8F0] shadow-sm">
              <p className={`font-bold text-base mb-1 text-center ${belowPass ? 'text-[#B45309]' : 'text-[#15803D]'}`}>{headline}</p>
              <p className="text-[#64748B] text-xs mb-4 text-center">{tex.unlockEverythingSub}</p>
              <div className="flex flex-col gap-2 mb-4">
                {PLANS.map((p) => {
                  const tint = tints[p.pass_type] || tints.auto;
                  return (
                    <div key={p.pass_type} className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
                      <span
                        className="flex items-center justify-center w-12 h-9 rounded-lg shrink-0 overflow-hidden"
                        style={{ background: tint.bg }}
                      >
                        <Image src={planArt[p.pass_type] || '/vehicles/mustang.png'} alt="" width={44} height={32} className="object-contain w-full h-full" />
                      </span>
                      <span className="flex-1 text-sm font-semibold text-[#0B1C3D] truncate">{planName(p)}</span>
                      <span className="text-sm font-bold" style={{ color: tint.color }}>{p.price}</span>
                    </div>
                  );
                })}
              </div>
              {/* intent=checkout: the button says Unlock — /upgrade fires the
                  Stripe checkout on arrival (or routes через login with the
                  intent preserved) instead of asking for a second Buy click. */}
              <GradientButton variant="gold" href={`/upgrade?lang=${lang}&plan=${planForCategory(category).id}&intent=checkout`}>
                <AnimatedLock size={20} color="#0B1C3D" />
                {tex.unlockFullAccess}
              </GradientButton>
            </div>
          );
        })()}

        {/* Question-by-question review */}
        {questions.length > 0 && (
          <div className="bg-white rounded-2xl p-6 w-full shadow-sm border border-[#E2E8F0]">
            <h2 className="text-lg font-bold text-[#0B1C3D] mb-4">{tex.questionReview}</h2>
            <ul className="space-y-4">
              {questions.map((q, i) => {
                const correct = userAnswers[i] === q.correctAnswerIndex;
                const correctText = q.answers?.[q.correctAnswerIndex];
                return (
                  <li
                    key={i}
                    className={`rounded-xl p-4 border text-left ${
                      correct ? 'bg-[#F0FDF4] border-[#16A34A]' : 'bg-[#FEF2F2] border-[#DC2626]'
                    }`}
                  >
                    {q.imageUrl && (
                      <div className="flex justify-center mb-3">
                        {/* eslint-disable-next-line @next/next/no-img-element -- question images have variable aspect ratios */}
                        <img src={q.imageUrl} alt="" className="h-20 rounded-lg border border-[#E2E8F0] object-contain" />
                      </div>
                    )}
                    <div className="flex gap-2 items-start">
                      <span className="shrink-0 mt-0.5">
                        {correct ? (
                          <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#16A34A" /><path d="M4.5 8l2.2 2.2L11.5 5.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#DC2626" /><path d="M5.2 5.2l5.6 5.6M10.8 5.2l-5.6 5.6" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#0B1C3D]">
                          {stripQuestion(q.question)}
                        </p>
                        {!correct && correctText != null && (
                          <p className="text-sm text-[#16A34A] mt-1">
                            {tex.correct}: <strong>{stripAnswer(correctText)}</strong>
                          </p>
                        )}
                        {q.explanation && (
                          <p className="text-sm text-[#64748B] mt-1">
                            {q.explanation}
                          </p>
                        )}
                        {q.manualReference && (
                          <div className="mt-2.5">
                            <button
                              type="button"
                              onClick={() => setExpandedRefs(prev => ({ ...prev, [i]: !prev[i] }))}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] bg-white border border-[#BFDBFE] rounded-full px-3 py-1.5 hover:bg-[#EFF6FF] hover:border-[#2563EB] transition-all"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M4 5a2 2 0 0 1 2-2h7v16H6a2 2 0 0 0-2 2V5z" /><path d="M13 3h5a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2h-5" /></svg>
                              <span>{q.manualSection || 'Driver Manual'}</span>
                              <svg width="9" height="9" viewBox="0 0 12 12" className={`ml-0.5 shrink-0 opacity-70 transition-transform ${expandedRefs[i] ? 'rotate-180' : ''}`} fill="currentColor"><path d="M6 8L1 3h10z" /></svg>
                            </button>
                            {expandedRefs[i] && (
                              <p className="mt-2 text-xs text-[#1E40AF] italic border-l-2 border-[#2563EB] pl-3 leading-relaxed">
                                &ldquo;{q.manualReference}&rdquo;
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Buttons */}
        {wrongQuestions.length > 0 && (
          <GradientButton
            variant="blue"
            onClick={() => {
              try { sessionStorage.setItem('retryQuestions', JSON.stringify(wrongQuestions)); } catch { /* blocked storage: /test shows its empty state instead of this button crashing */ }
              router.push(`/test?state=${state}&category=${category}&lang=${lang}&retry=true`);
            }}
          >
            {tex.retryWrong} ({wrongQuestions.length})
          </GradientButton>
        )}
        <button
          type="button"
          onClick={() => router.push(`/category?state=${state}&lang=${lang}`)}
          className="w-full bg-white border border-[#E2E8F0] text-[#0B1C3D] py-3.5 rounded-xl font-semibold text-base hover:border-[#2563EB] hover:text-[#2563EB] hover:bg-[#F8FAFC] transition-all"
        >
          {tex.tryAgain}
        </button>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="w-full bg-white border border-[#E2E8F0] text-[#0B1C3D] py-3.5 rounded-xl font-semibold text-base hover:border-[#2563EB] hover:text-[#2563EB] hover:bg-[#F8FAFC] transition-all"
        >
          {tex.home}
        </button>

        {/* Manual link */}
        <a
          href={`/manuals/${state}`}
          className="block w-full text-center text-sm text-[#2563EB] hover:underline font-medium py-2"
        >
          {tex.studyManual}
        </a>

        <SupportFooter lang={lang} />
      </div>
    </main>
  );
}

export default function Result() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}><div className="w-6 h-6 border-2 border-[#94A3B8] border-t-transparent rounded-full animate-spin" /></main>}>
      <ResultContent />
    </Suspense>
  );
}
