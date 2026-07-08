'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { t, pluralizeQuestions } from '@/lib/translations';
import { getSavedLang, saveLang } from '@/lib/lang';
import { agencyAbbrForState } from '@/lib/agencies';
import { examRulesFor, passPercentFor } from '@/lib/exam-rules';
import { pickHardest } from '@/lib/question-difficulty';
import { trackBeginCheckout, trackTestStart, trackTestFinish, trackResume, trackCheckoutError } from '@/lib/gtag';
import { planForCategory } from '@/lib/plans';
import { useExperiment } from '@/lib/experiments';
import GradientButton from '@/app/components/GradientButton';

// Brand line icons (2px stroke) — replaces the page's pre-overhaul emoji set
// (✏️🎯📚🏆🔒🔓📖🔔📨 …) with the SVG language the rest of the site speaks.
const ICON_PATHS = {
  pencil: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>,
  book: <path d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z" />,
  trophy: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4a3 3 0 003 3M17 6h3a3 3 0 01-3 3" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
  unlock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 017.5-1.5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" /></>,
  bell: <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 6l-10 7L2 6" /></>,
  flag: <path d="M4 21V4a1 1 0 011-1h11l-1.5 4L16 11H5" />,
  inbox: <path d="M22 12h-6l-2 3h-4l-2-3H2M5 5h14l3 7v7H2v-7l3-7z" />,
  offline: <path d="M2 8a15 15 0 0120 0M5 12a10 10 0 0114 0M8.5 15.5a5 5 0 017 0M12 19h.01M3 3l18 18" />,
};
function LineIcon({ name, size = 16, color = '#2563EB', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}
// Green check / red cross dots (same art as the pricing feature lists).
const CheckDot = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" className="inline-block shrink-0 align-[-2px]" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="#16A34A" /><path d="M4.5 8l2.2 2.2L11.5 5.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
);
const CrossDot = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" className="inline-block shrink-0 align-[-2px]" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="#DC2626" /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
);
// Paywall-modal plan art — same PNGs as the home/result plan cards.
const PLAN_ART = { moto: '/vehicles/moto-hero.png', auto: '/vehicles/mustang.png', cdl: '/vehicles/truck-hero.png' };

const langs = [
  { label: 'EN', code: 'en' },
  { label: 'RU', code: 'ru' },
  { label: 'ES', code: 'es' },
  { label: 'ZH', code: 'zh' },
  { label: 'UA', code: 'ua' },
];

function TestContent() {
  const router = useRouter();
  const params = useSearchParams();
  const state = params.get('state') || 'washington';
  const category = params.get('category') || 'car';
  const subcategory = params.get('subcategory') || null;
  const urlLang = params.get('lang');
  const [lang, setLangState] = useState(urlLang || getSavedLang());
  const [showLangMenu, setShowLangMenu] = useState(false);
  const currentLang = langs.find(l => l.code === lang) || langs[0];
  function switchLang(code) { setLangState(code); saveLang(code); setShowLangMenu(false); }

  // Hydration guard: useSearchParams can read empty on the first client render
  // on some browsers (notably iOS Safari), so the useState init above may fall
  // back to the saved lang and a RU/ES/etc. visitor arriving from the home
  // category button can briefly land on an English test. Re-apply the URL lang
  // once it is available. (A manual in-test switch changes state but not the
  // URL, so urlLang stays put and this effect will not fight it.)
  useEffect(() => {
    if (urlLang && langs.some(l => l.code === urlLang)) setLangState(urlLang);
  }, [urlLang]);

  // Per-question English reference view — lets non-English learners study in
  // their language and tap to see the canonical EN original on any question.
  // Only useful when the test lang is non-EN (an EN test doesn't need a
  // translation toggle). Cached by [clusterCode] so toggling is free.
  const [altViewCache, setAltViewCache] = useState({}); // { [clusterCode]: {question, answers, notFound?} }
  const [showAltView, setShowAltView] = useState(false);
  const [fetchingAltView, setFetchingAltView] = useState(false);
  const isRetry = params.get('retry') === 'true';
  const tex = t[lang] || t.en;

  // Per-state agency naming: many states are not "DMV" (WA→DOL, TX→DPS,
  // IL→SOS, ...). Swap the standalone word "DMV" in rendered state-specific
  // copy for the real agency. The \b word-boundary keeps "DMVSOS" and the
  // /dmv-test route intact, and it's a no-op for true-DMV states.
  const ag = agencyAbbrForState(state);
  const dmv = (s) => String(s || '').replace(/\bDMV\b/g, ag);

  const { isPro, hasCar, hasMoto, hasCdl, loading: authLoading, user } = useAuth();
  useExperiment('test_visit', user?.id);

  // Category-aware access: each category needs its own plan
  const hasFullAccess = ['moto', 'motorcycle'].includes(category) ? hasMoto
    : category === 'cdl' ? hasCdl
    : hasCar; // car/dmv → requires car_pass (or cdl_pass which includes car)

  // Plan for current category — single source of truth (lib/plans.js)
  const plan = planForCategory(category);
  const suggestPlan = plan.id;
  const isMoto = plan.pass_type === 'moto';
  const isCdl = plan.pass_type === 'cdl';
  const freeLimit = isMoto ? 5 : 20;       // moto preview = 5q, car = 20q
  const nudgeAt   = isMoto ? 3 : 17;       // show nudge at question 4 (idx 3) for moto, 18 for car

  const [allQuestions, setAllQuestions] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [testMode, setTestMode] = useState(null); // null = not started, 'free' | 'real' | 'extended' | 'marathon'
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [userAnswers, setUserAnswers] = useState([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState(0);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [loadError, setLoadError] = useState('');
  // True when the questions fetch failed at the network layer (offline /
  // dropped / non-JSON 500), as opposed to a legit "no questions in this
  // language yet" empty result. Drives a retry screen instead of the
  // misleading "coming soon / try English" empty state.
  const [networkError, setNetworkError] = useState(false);
  // Bumped by the retry button to re-run the load effect without changing
  // state/category/lang.
  const [reloadKey, setReloadKey] = useState(0);
  // True when /api/test/check failed at the network layer for the current
  // question. Lets the user tap again instead of silently scoring a correct
  // answer as wrong.
  const [checkError, setCheckError] = useState(false);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  const [motivationalMessage, setMotivationalMessage] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showTimeUp, setShowTimeUp] = useState(false);
  const [hideExplanations, setHideExplanations] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockAnimKey, setLockAnimKey] = useState({});
  const [showManualQuote, setShowManualQuote] = useState(false);
  // Blocks rapid double-clicks while /api/test/check is in flight
  const [submittingAnswer, setSubmittingAnswer] = useState(false);

  // Inline bug report
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportComment, setReportComment] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  async function submitReport(qToken) {
    if (!reportReason || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      await fetch('/api/question-report', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          q_token: qToken,
          language: lang,
          reason: reportReason,
          comment: reportComment || null,
          user_email: session?.user?.email || null,
        }),
      });
      setReportSent(true);
      setTimeout(() => {
        setShowReport(false);
        setReportReason('');
        setReportComment('');
        setReportSent(false);
      }, 1500);
    } catch { /* swallow */ }
    finally { setReportSubmitting(false); }
  }

  // Soft email capture (mid-test, around Q10) — anonymous → captured email
  const [showEmailCapture, setShowEmailCapture] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const startTimeRef = useRef(null);
  const timeLimitRef = useRef(0);

  // Time limits per category (in seconds)  ·  real exam simulation
  const categoryTimeLimit = { dmv: 40 * 60, car: 40 * 60, cdl: 50 * 60, moto: 30 * 60, motorcycle: 30 * 60 };
  const initialTime = categoryTimeLimit[category] || 60 * 60;

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const hasTimer = testMode === 'real' || testMode === 'free';

  useEffect(() => {
    if (!testMode || testMode === null) return;
    // Resume support: shift the start time back by the saved elapsed seconds.
    startTimeRef.current = Date.now() - (resumeElapsedRef.current || 0) * 1000;
    resumeElapsedRef.current = 0;
    if (!hasTimer) {
      // Track elapsed time only (no countdown) for extended/marathon
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
    timeLimitRef.current = initialTime;
    setRemaining(initialTime);
    const interval = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsed(elapsedSec);
      const rem = Math.max(0, timeLimitRef.current - elapsedSec);
      setRemaining(rem);
      if (rem === 0) setShowTimeUp(true);
    }, 1000);
    return () => clearInterval(interval);
  }, [testMode, hasTimer, initialTime]);

  useEffect(() => {
    if (!motivationalMessage) return;
    if (motivationalMessage.phase === 'show') {
      const t = setTimeout(() => setMotivationalMessage(m => m ? { ...m, phase: 'fade' } : null), 1000);
      return () => clearTimeout(t);
    }
    if (motivationalMessage.phase === 'fade') {
      const t = setTimeout(() => setMotivationalMessage(null), 300);
      return () => clearTimeout(t);
    }
  }, [motivationalMessage]);

  // Load questions  ·  does NOT depend on isPro
  useEffect(() => {
    if (isRetry) {
      try {
        const raw = sessionStorage.getItem('retryQuestions');
        const data = raw ? JSON.parse(raw) : [];
        setQuestions(Array.isArray(data) ? data : []);
        setTestMode('retry');
      } catch {
        setQuestions([]);
      }
      setLoadingQuestions(false);
      return;
    }
    setLoadingQuestions(true);
    setLoadError('');
    setNetworkError(false);
    const categoryMap = { dmv: 'car', cdl: 'cdl', moto: 'motorcycle' };
    const mappedCategory = categoryMap[category] || category;
    // Server-side fetch — anon Supabase key no longer dumps the question bank.
    // Endpoint enforces per-IP rate limit + input validation.
    // limit=500 covers the biggest bank (CA CDL = 352). Smaller states
    // just return their actual count. "Marathon" mode then truly = all.
    const qsParams = new URLSearchParams({
      state, category: mappedCategory, language: lang, limit: '500',
    });
    if (subcategory) qsParams.set('subcategory', subcategory);
    fetch('/api/test/questions?' + qsParams, { cache: 'no-store' })
      .then(async r => {
        const data = await r.json();
        return { status: r.status, ...data };
      })
      .then(({ ok, status, questions, error, resetAt }) => {
        if (!ok) {
          if (error === 'rate_limited') {
            const mins = resetAt ? Math.ceil((resetAt - Date.now()) / 60000) : 10;
            setLoadError((tex.tooManyRequestsRetry || 'Too many requests. Try again in ~{min} min.').replace('{min}', mins));
          } else {
            setLoadError(error || tex.failedToLoad || 'Failed to load questions.');
          }
          setAllQuestions([]);
          setLoadingQuestions(false);
          return;
        }
        if (!questions?.length) {
          setAllQuestions([]);
          setLoadingQuestions(false);
          return;
        }
        const strip = s => (s || '').replace(/^[A-DА-Га-гa-d]\.\s*/, '').trim();
        // Server no longer returns correct_answer/explanation/manual_* — those
        // are revealed per question via /api/test/check on user submit.
        const mapped = questions.map(row => {
          const answers = [row.option_a, row.option_b, row.option_c, row.option_d].filter(Boolean).map(strip);
          return {
            // q_token is an opaque, 4-hour-TTL AES-GCM encrypted blob
            // wrapping the real DB UUID. Server-side only knows how to
            // decrypt it. We pass it back to /api/test/check and
            // /api/question-report instead of any real ID.
            q_token: row.q_token,
            clusterCode: row.cluster_code || null,
            question: row.question_text || '',
            answers,
            correctAnswerIndex: null,    // populated by submitAnswer() after /check
            imageUrl: row.image_url || null,
            explanation: null,           // populated by /check
            manualSection: null,         // populated by /check
            manualReference: null,       // populated by /check
          };
        }).filter(row => row.answers.length >= 2);
        // Fisher-Yates shuffle
        for (let i = mapped.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [mapped[i], mapped[j]] = [mapped[j], mapped[i]];
        }
        tokenMintedAtRef.current = Date.now();
        setAllQuestions(mapped);
        setLoadingQuestions(false);
      })
      .catch(() => {
        // Network / parse failure (offline, dropped request, non-JSON 500).
        // Distinct from an ok-but-empty response: flag it so the UI offers a
        // retry instead of the "no questions / try English" empty state,
        // which would mislead the user and (for non-EN) loop them into an
        // English fetch that also fails offline.
        setNetworkError(true);
        setAllQuestions([]);
        setLoadingQuestions(false);
      });
  }, [state, category, lang, isRetry, subcategory, reloadKey]);

  // Close the alt view when moving between questions
  useEffect(() => { setShowAltView(false); setCheckError(false); }, [current]);

  async function fetchAltView(clusterCode) {
    if (!clusterCode || altViewCache[clusterCode]) return;
    setFetchingAltView(true);
    try {
      const categoryMap = { dmv: 'car', cdl: 'cdl', moto: 'motorcycle' };
      const mappedCategory = categoryMap[category] || category;
      const qs = new URLSearchParams({
        state, category: mappedCategory, language: 'en',
        cluster_codes: clusterCode, limit: '1',
      });
      if (subcategory) qs.set('subcategory', subcategory);
      const r = await fetch('/api/test/questions?' + qs, { cache: 'no-store' });
      const data = await r.json();
      const strip = s => (s || '').replace(/^[A-DА-Га-гa-d]\.\s*/, '').trim();
      if (data.ok && data.questions?.length) {
        const row = data.questions[0];
        const answers = [row.option_a, row.option_b, row.option_c, row.option_d].filter(Boolean).map(strip);
        setAltViewCache(prev => ({ ...prev, [clusterCode]: { question: row.question_text || '', answers } }));
      } else {
        setAltViewCache(prev => ({ ...prev, [clusterCode]: { question: '', answers: [], notFound: true } }));
      }
    } catch (_) {
      setAltViewCache(prev => ({ ...prev, [clusterCode]: { question: '', answers: [], notFound: true } }));
    } finally {
      setFetchingAltView(false);
    }
  }

  function startWithMode(mode) {
    // Real-exam count comes from the state's actual DMV format
    // (25 for WA, 30 for TX, 46 for CA, etc.) — see lib/exam-rules.js.
    // Fallback 40 covers unknown state/category combos.
    const realFromState = examRulesFor(state, category)?.questions;
    const realLimits = { dmv: realFromState || 40, car: realFromState || 40, cdl: 50, moto: realFromState || 30, motorcycle: realFromState || 30 };
    const limits = { free: freeLimit, real: realLimits[category] || 40, extended: 80, marathon: Infinity };
    const limit = limits[mode] ?? 40;
    // FREE tier draws from the hardest slice of the pool (numbers, exceptions,
    // confusable options — see lib/question-difficulty). The free ride should
    // feel like the exam's tricky end, so full prep sells itself. Paid modes
    // keep the natural difficulty mix (Real must stay representative).
    setQuestions(mode === 'free'
      ? pickHardest(allQuestions, Math.min(limit, allQuestions.length))
      : allQuestions.slice(0, Math.min(limit, allQuestions.length)));
    setCurrent(0);
    setScore(0);
    setUserAnswers([]);
    userAnswersRef.current = [];
    sessionSavedRef.current = false; // fresh test → allow one new session row
    setSelected(null);
    setShowAnswer(false); setShowManualQuote(false); setShowReport(false); setReportReason(""); setReportComment(""); setReportSent(false);
    setElapsed(0);
    setTestMode(mode);
    trackTestStart({ state, category, lang, mode });
  }

  // Paywall modal "Get it": go STRAIGHT to Stripe instead of re-selling on
  // /upgrade (every extra screen sheds buyers). Logged-in → create the checkout
  // session right here; anonymous → /login with intent=checkout so the existing
  // auto-resume on /upgrade fires the session without another Buy tap. Any
  // failure falls back to the /upgrade pricing page rather than a dead end.
  const [modalBuyLoading, setModalBuyLoading] = useState(false);
  const [modalNotice, setModalNotice] = useState(null);
  async function modalCheckout() {
    if (modalBuyLoading) return;
    setModalBuyLoading(true);
    setModalNotice(null);
    const fallback = `/upgrade?lang=${lang}&plan=${suggestPlan}`;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        const next = `/upgrade?plan=${suggestPlan}&lang=${lang}&intent=checkout`;
        router.push(`/login?next=${encodeURIComponent(next)}&lang=${lang}`);
        return;
      }
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ planType: suggestPlan, lang }),
      });
      const data = await res.json();
      if (res.status === 409 && data?.error === 'pass_already_active') {
        // Explain in place — the old silent /profile redirect read as
        // "the button is broken" (same fix /upgrade already got).
        setModalNotice({ type: 'owned', expires: data.expires_at });
        return;
      }
      if (res.status === 401) {
        const next = `/upgrade?plan=${suggestPlan}&lang=${lang}&intent=checkout`;
        router.push(`/login?next=${encodeURIComponent(next)}&lang=${lang}`);
        return;
      }
      if (data?.url) {
        trackBeginCheckout(suggestPlan.replace('onetime_', ''), 'new');
        window.location.href = data.url;
        return;
      }
      trackCheckoutError(res.status, 'paywall');
      router.push(fallback);
    } catch {
      trackCheckoutError('network', 'paywall');
      router.push(fallback);
    } finally {
      setModalBuyLoading(false);
    }
  }

  // Keyboard shortcuts: 1-4 to select answer, Enter/Space to advance
  // Must be before early returns to satisfy Rules of Hooks
  // Refs for keyboard shortcuts (must be before early returns for Rules of Hooks)
  const handleSelectRef = useRef(null);
  const handleNextRef = useRef(null);
  const handlePrevRef = useRef(null);
  // Ref for synchronous answer tracking (avoids React state batching race condition)
  const userAnswersRef = useRef([]);
  // Idempotency guard for test_sessions writes. Without this, holding Enter
  // or rapid-clicking "next" on the final question fires handleNext multiple
  // times before router.push completes, producing 10-15 duplicate session
  // rows (see freiibersuarez data 2026-05-18 11:57:21 — 15 inserts in 1 sec).
  const sessionSavedRef = useRef(false);

  // ── Mid-test progress persistence ─────────────────────────────────────────
  // A Pro user lost an almost-finished Marathon when the browser closed (the
  // whole test lived in React state). Every answer now snapshots the test to
  // localStorage; coming back offers "Continue from question N". q_tokens
  // expire after 4h, so resumes older than 3h re-fetch fresh tokens for the
  // still-unanswered questions by cluster_code (answered ones are already
  // revealed and need no token).
  // Scoped per state+category (+subcategory): a paused car marathon must
  // survive the user taking a quick moto test in between. The legacy single
  // key is still read once for snapshots saved before the split.
  const LEGACY_PROGRESS_KEY = 'dmvsos_test_progress';
  const PROGRESS_KEY = `${LEGACY_PROGRESS_KEY}:${state}:${category}${subcategory ? ':' + subcategory : ''}`;
  const resumeElapsedRef = useRef(0);
  const progressDoneRef = useRef(false);
  // When the questions' q_tokens were minted (fetch or refresh time). Tokens
  // expire 4h after MINT, so refresh decisions must use this, not savedAt —
  // savedAt renews on every answer while the tokens keep aging.
  const tokenMintedAtRef = useRef(Date.now());
  const [resumeSnap, setResumeSnap] = useState(null);

  useEffect(() => {
    try {
      const isFresh = s => Date.now() - (s?.savedAt || 0) < 7 * 24 * 3600e3;
      let snap = null;
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) snap = JSON.parse(raw);
      if (!snap) {
        // Pre-split snapshot: only usable if it belongs to this exact test.
        const legacyRaw = localStorage.getItem(LEGACY_PROGRESS_KEY);
        if (legacyRaw) snap = JSON.parse(legacyRaw);
      }
      // Drop expired sibling snapshots so scoped keys can't pile up forever.
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(LEGACY_PROGRESS_KEY)) continue;
        try {
          const s = JSON.parse(localStorage.getItem(key));
          if (!isFresh(s)) localStorage.removeItem(key);
        } catch { localStorage.removeItem(key); }
      }
      if (!snap) return;
      const match = snap.state === state && snap.category === category
        && snap.lang === lang && (snap.subcategory || null) === (subcategory || null);
      const unfinished = Array.isArray(snap.questions) && snap.questions.length > 0
        && snap.current < snap.questions.length;
      if (isFresh(snap) && match && unfinished) {
        setResumeSnap(snap);
        trackResume('shown');
      }
    } catch { /* corrupt snapshot or storage blocked: no resume offered */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, category, lang, subcategory]);

  useEffect(() => {
    if (!testMode || isRetry || progressDoneRef.current) return;
    if (!questions.length) return;
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({
        v: 1, savedAt: Date.now(), tokenMintedAt: tokenMintedAtRef.current,
        state, category, lang,
        subcategory: subcategory || null, mode: testMode,
        current, score, elapsed, questions, userAnswers: userAnswersRef.current,
      }));
    } catch { /* storage full/private mode: resume just won't be offered */ }
    // elapsed is read from state at answer-time writes; the seconds between the
    // last answer and a crash are lost, which is fine for resume purposes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testMode, current, questions, score]);

  // Freshest snapshot for the tab-close flush below, refreshed after every
  // render so pagehide never writes a stale clock.
  const latestSnapRef = useRef(null);
  useEffect(() => {
    const active = testMode && !isRetry && !progressDoneRef.current && questions.length > 0;
    latestSnapRef.current = active
      ? {
          v: 1, savedAt: Date.now(), tokenMintedAt: tokenMintedAtRef.current,
          state, category, lang,
          subcategory: subcategory || null, mode: testMode,
          current, score, elapsed, questions, userAnswers: userAnswersRef.current,
        }
      : null;
  });

  // Mobile browsers kill background tabs without warning — flush the freshest
  // snapshot when the tab hides or the page is being torn down.
  useEffect(() => {
    const flush = () => {
      if (!latestSnapRef.current) return;
      try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(latestSnapRef.current)); } catch { /* noop */ }
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    // BFCache thaw (iOS Safari back button after hours): the in-memory test
    // never went through the resume path, so its q_tokens can be past the 4h
    // TTL without anyone noticing until answers start failing.
    const onPageShow = (e) => {
      if (!e.persisted) return;
      const qs = latestSnapRef.current?.questions;
      if (qs?.length && Date.now() - (tokenMintedAtRef.current || 0) > 3 * 3600e3) {
        refreshResumedTokens(qs);
      }
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshResumedTokens(qs) {
    try {
      const codes = qs.filter(q => q.correctAnswerIndex == null && q.clusterCode).map(q => q.clusterCode);
      const categoryMap = { dmv: 'car', cdl: 'cdl', moto: 'motorcycle' };
      const mappedCategory = categoryMap[category] || category;
      for (let i = 0; i < codes.length; i += 100) {
        const batch = codes.slice(i, i + 100);
        const qsr = new URLSearchParams({
          state, category: mappedCategory, language: lang,
          cluster_codes: batch.join(','), limit: String(batch.length),
        });
        if (subcategory) qsr.set('subcategory', subcategory);
        const r = await fetch('/api/test/questions?' + qsr, { cache: 'no-store' });
        const data = await r.json();
        if (!data.ok || !data.questions) continue;
        const tokenByCluster = {};
        for (const row of data.questions) if (row.cluster_code) tokenByCluster[row.cluster_code] = row.q_token;
        setQuestions(prev => prev.map(q =>
          (q.correctAnswerIndex == null && q.clusterCode && tokenByCluster[q.clusterCode])
            ? { ...q, q_token: tokenByCluster[q.clusterCode] }
            : q
        ));
      }
      tokenMintedAtRef.current = Date.now();
    } catch { /* stale tokens re-mint on demand in handleSelect */ }
  }

  // On-demand single-token re-mint: the last line of defense when a token
  // expires mid-answer (marathon past 4h, BFCache thaw). Costs one
  // /questions rate-limit unit; returns null on any failure.
  async function mintFreshToken(question) {
    if (!question?.clusterCode) return null;
    try {
      const categoryMap = { dmv: 'car', cdl: 'cdl', moto: 'motorcycle' };
      const qsr = new URLSearchParams({
        state, category: categoryMap[category] || category, language: lang,
        cluster_codes: question.clusterCode, limit: '1',
      });
      if (subcategory) qsr.set('subcategory', subcategory);
      const r = await fetch('/api/test/questions?' + qsr, { cache: 'no-store' });
      const data = await r.json();
      return (data.ok && data.questions?.[0]?.q_token) || null;
    } catch {
      return null;
    }
  }

  function restoreProgress(snap) {
    progressDoneRef.current = false;
    sessionSavedRef.current = false;
    setQuestions(snap.questions);
    setCurrent(snap.current);
    setScore(snap.score || 0);
    userAnswersRef.current = snap.userAnswers || [];
    setUserAnswers(snap.userAnswers || []);
    setSelected(null);
    setShowAnswer(false); setShowManualQuote(false); setShowReport(false);
    resumeElapsedRef.current = snap.elapsed || 0;
    setResumeSnap(null);
    setTestMode(snap.mode);
    trackResume('accepted');
    // Refresh by token MINT age, not snapshot age: savedAt renews on every
    // answer, so a 3.5h-old test saved 10 minutes ago still has dying tokens.
    tokenMintedAtRef.current = snap.tokenMintedAt || snap.savedAt || 0;
    if (Date.now() - tokenMintedAtRef.current > 3 * 3600e3) refreshResumedTokens(snap.questions);
  }

  function dismissResume() {
    try { localStorage.removeItem(PROGRESS_KEY); } catch { /* noop */ }
    try { localStorage.removeItem(LEGACY_PROGRESS_KEY); } catch { /* noop */ }
    setResumeSnap(null);
    trackResume('dismissed');
  }
  useEffect(() => {
    if (!testMode || !questions.length) return;
    function onKeyDown(e) {
      // Don't hijack keys while the user is typing in a field (e.g. the
      // question-report comment box) — Space and 1-4 must type normally there.
      const el = e.target;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (showUpgradeBanner) return;
      const key = e.key;
      if (key === 'ArrowLeft') {
        handlePrevRef.current?.();
      } else if (!showAnswer && ['1', '2', '3', '4'].includes(key)) {
        const idx = parseInt(key) - 1;
        if (idx < (questions[current]?.answers?.length || 0)) {
          handleSelectRef.current?.(idx);
        }
      } else if (showAnswer && (key === 'Enter' || key === ' ')) {
        e.preventDefault();
        handleNextRef.current?.();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [testMode, questions, showAnswer, current, showUpgradeBanner]);

  function handleBack() {
    if (hasFullAccess && testMode && testMode !== 'free') {
      setTestMode(null);
      setQuestions([]);
      setCurrent(0);
      setScore(0);
      setUserAnswers([]);
      userAnswersRef.current = [];
      setSelected(null);
      setShowAnswer(false); setShowManualQuote(false); setShowReport(false); setReportReason(""); setReportComment(""); setReportSent(false);
      setElapsed(0);
      setRemaining(0);
      setShowUpgradeBanner(false);
      setShowTimeUp(false);
    } else {
      router.push(`/category?state=${state}&lang=${lang}`);
    }
  }

  function handlePrev() {
    if (current <= 0) return;
    const prevIndex = current - 1;
    const prevAnswer = userAnswersRef.current[prevIndex];
    setCurrent(prevIndex);
    if (prevAnswer !== undefined) {
      setSelected(prevAnswer);
      setShowAnswer(true);
    } else {
      setSelected(null);
      setShowAnswer(false); setShowManualQuote(false); setShowReport(false); setReportReason(""); setReportComment(""); setReportSent(false);
    }
  }
  handlePrevRef.current = handlePrev;

  // Set translated page title
  useEffect(() => {
    if (tex.practiceTestTitle) document.title = tex.practiceTestTitle;
  }, [tex.practiceTestTitle]);

  // Soft email capture: trigger once around Q10 for anonymous visitors.
  // Sees it once per device (localStorage flag survives reload).
  useEffect(() => {
    if (authLoading) return;
    if (hasFullAccess) return;                        // already paid
    if (typeof window === 'undefined') return;
    try {
      if (localStorage.getItem('dmvsos_email_seen')) return;
      // Trigger at Q10 (0-indexed = 9). For moto where freeLimit=5, skip.
      if (freeLimit < 20) return;
      if (current === 9 && showAnswer) {
        setShowEmailCapture(true);
        localStorage.setItem('dmvsos_email_seen', '1');
      }
    } catch { /* storage blocked: capture stays off, test must not crash */ }
  }, [current, showAnswer, authLoading, hasFullAccess, freeLimit]);

  async function handleSubmitEmail(e) {
    e.preventDefault();
    if (emailSubmitting || !emailInput.trim()) return;
    setEmailSubmitting(true);
    setEmailError('');
    try {
      // signInWithOtp creates an auth.users row and emails a magic link.
      // When the user clicks the link, they're signed in automatically.
      const { error } = await supabase.auth.signInWithOtp({
        email: emailInput.trim().toLowerCase(),
        options: { emailRedirectTo: window.location.href },
      });
      if (error) {
        setEmailError(error.message);
      } else {
        setEmailSent(true);
      }
    } catch (err) {
      setEmailError(err?.message || 'Something went wrong');
    } finally {
      setEmailSubmitting(false);
    }
  }

  // Wait for both auth and questions to load
  const loading = loadingQuestions || authLoading;

  if (loading) return (
    <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 mx-auto mb-4 border-2 border-[#BFDBFE] border-t-[#2563EB] rounded-full animate-spin" />
        <p className="text-[#94A3B8]">{tex.loadingQuestions}</p>
      </div>
    </main>
  );

  // Mode selector  ·  shown to ALL users (free and pro) before test starts
  if (!testMode && allQuestions.length) {
    const totalAvailable = allQuestions.length;
    // Per-state real-exam count: WA has 25, TX has 30, CA has 46, etc.
    // examRulesFor returns { questions, pass } for the (state, category)
    // pair; falls back to the old 40/30/50 defaults if not in the table.
    const stateRule = examRulesFor(state, category);
    const fallbackByCategory = { dmv: 40, car: 40, cdl: 50, moto: 30, motorcycle: 30 };
    const realCount = Math.min(stateRule?.questions || fallbackByCategory[category] || 40, totalAvailable);
    const modes = [
      ...(!hasFullAccess ? [{
        id: 'free',
        icon: 'pencil',
        label: tex.modePractice || 'Quick Practice',
        desc: isMoto
          ? `${freeLimit} ${tex.modeQuestions || 'questions'}  ·  always free`
          : (tex.modePracticeDesc || '20 questions  ·  always free'),
        count: Math.min(freeLimit, totalAvailable),
        color: '#16A34A',
        tint: '#F0FDF4',
        locked: false,
      }] : []),
      {
        id: 'real',
        icon: 'target',
        label: dmv(tex.modeReal),
        desc: dmv(tex.modeRealDesc),
        count: realCount,
        color: '#2563EB',
        tint: '#EFF6FF',
        time: `${categoryTimeLimit[category] / 60} ${tex.minLabel}`,
        locked: !hasFullAccess,
      },
      // Extended only for car/cdl — moto exam is short, 80q doesn't make sense
      ...(!isMoto ? [{
        id: 'extended',
        icon: 'book',
        label: tex.modeExtended,
        // The translated desc hardcodes "80"; when this state's pool is smaller
        // the count pill would contradict it (desc "80", pill "56") — swap in
        // the real number (digits are language-neutral across all 5 locales).
        desc: totalAvailable < 80
          ? String(tex.modeExtendedDesc || '').replace('80', String(Math.min(80, totalAvailable)))
          : tex.modeExtendedDesc,
        count: Math.min(80, totalAvailable),
        color: '#7C3AED',
        tint: '#F5F3FF',
        locked: !hasFullAccess,
      }] : []),
      {
        id: 'marathon',
        icon: 'trophy',
        label: tex.modeMarathon,
        desc: tex.modeMarathonDesc,
        count: totalAvailable,
        color: '#D97706',
        tint: '#FFF7ED',
        locked: !hasFullAccess,
      },
    ];
    // One concrete offer for the whole locked group. The old design repeated
    // this strip (state + price) on every locked card — three price tags in a
    // row read as noise, not value.
    const stateDisplayName = state ? state.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') : '';
    const unlockCtaText = (tex.unlockAllStateTests || 'Unlock all {state} tests · {price}')
      .replace('{state}', stateDisplayName)
      .replace('{price}', plan.price);

    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 relative" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
        {/* Header */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
          <button type="button" onClick={() => router.push(`/category?state=${state}&lang=${lang}`)}
            className="text-sm text-[#94A3B8] hover:text-[#2563EB] transition font-medium">
            {tex.back}
          </button>
          <Link href="/" className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition">
            <Image src="/logo.png" alt="DMVSOS" width={28} height={28} className="rounded-lg" />
            <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
          </Link>
          <div className="relative">
            <button type="button" onClick={() => setShowLangMenu(v => !v)} onBlur={() => setTimeout(() => setShowLangMenu(false), 150)}
              className="flex items-center gap-1 text-xs font-semibold text-[#64748B] bg-white border border-[#E2E8F0] rounded-full px-2.5 py-1.5 hover:border-[#2563EB] transition-colors">
              <span>{currentLang.label}</span><svg width="9" height="9" viewBox="0 0 12 12" className="ml-0.5 shrink-0" style={{ fill: '#94A3B8' }} aria-hidden="true"><path d="M6 8L1 3h10z" /></svg>
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

        <div className="w-full max-w-md mt-12">
          <div className="text-center mb-5">
            <h2 className="text-xl font-bold text-[#0B1C3D] mb-1">{tex.chooseMode}</h2>
            <p className="text-sm text-[#94A3B8]">{totalAvailable} {tex.modeQuestions}</p>
          </div>

          {/* Unfinished-test resume card — the fix for "браузер закрылся и всё
              пропало": restores questions, answers, score and the clock. */}
          {resumeSnap && (
            <div className="rounded-2xl border-2 border-[#2563EB] bg-[#EFF6FF] p-5 mb-4 shadow-md">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-11 h-11 rounded-xl bg-[#2563EB] flex items-center justify-center shrink-0">
                  <LineIcon name="clock" size={22} color="#FFFFFF" />
                </span>
                <div className="flex-1">
                  <div className="font-bold text-[#0B1C3D] text-[16px]">{tex.resumeTitle || 'Unfinished test'}</div>
                  <div className="text-sm text-[#475569] mt-0.5">
                    {(tex.resumeProgress || 'Question {n} of {total}')
                      .replace('{n}', String(resumeSnap.current + 1))
                      .replace('{total}', String(resumeSnap.questions.length))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <GradientButton onClick={() => restoreProgress(resumeSnap)} className="flex-1 text-sm">
                  {tex.resumeContinue || 'Continue'}
                </GradientButton>
                <button type="button" onClick={dismissResume}
                  className="px-4 py-2 rounded-xl border border-[#E2E8F0] bg-white text-sm font-semibold text-[#64748B] hover:border-[#2563EB] hover:text-[#2563EB] transition">
                  {tex.resumeStartOver || 'Start over'}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {modes.map(m => {
              // Unified card anatomy for every row: white surface, one soft
              // tinted icon tile, title + gray meta. The mode's color lives
              // ONLY in the icon tile — three pastel card backgrounds next to
              // each other read as noise, not hierarchy.
              const metaLine = m.id === 'real'
                ? `${m.count} ${tex.modeQuestions}${m.time ? ` · ${m.time}` : ''}`
                : m.id === 'marathon'
                  ? `${m.count} ${tex.modeQuestions}`
                  : null;
              if (!m.locked) {
                // Free user's single playable card is THE primary action on
                // this screen: green accent + explicit CTA with the brand
                // shine. Pro users get the same quiet anatomy, unlocked.
                if (!hasFullAccess) {
                  // Two rows (text, then full-width CTA): inline buttons crush
                  // the RU/ES/UA copy into 4-line wraps at 375px.
                  return (
                    <button key={m.id} type="button" onClick={() => startWithMode(m.id)}
                      className="relative overflow-hidden rounded-2xl p-5 text-left bg-white border border-[#86EFAC] transition-all hover:-translate-y-0.5"
                      style={{ boxShadow: '0 8px 24px rgba(22,163,74,0.14)' }}>
                      <div className="flex items-center gap-4 mb-4">
                        <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#F0FDF4' }}>
                          <LineIcon name={m.icon} size={22} color="#16A34A" />
                        </span>
                        <div className="flex-1">
                          <div className="font-bold text-[#0B1C3D] text-[16px]">{m.label}</div>
                          <div className="text-[13px] text-[#64748B] mt-0.5">{m.desc}</div>
                        </div>
                      </div>
                      <span className="relative overflow-hidden block w-full text-center text-[15px] font-bold px-4 py-3 rounded-xl text-white"
                        style={{ background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 60%, #15803D 100%)', boxShadow: '0 4px 12px rgba(22,163,74,0.3)' }}>
                        <span aria-hidden="true" className="gradient-btn-shine pointer-events-none absolute inset-y-0 -left-1/2 w-1/2" />
                        <span className="relative">{tex.startFree || 'Start Free'}</span>
                      </span>
                    </button>
                  );
                }
                return (
                  <button key={m.id} type="button" onClick={() => startWithMode(m.id)}
                    className="rounded-2xl p-5 flex items-center gap-4 bg-white hover:shadow-lg hover:-translate-y-0.5 transition-all text-left border border-[#E2E8F0] shadow-sm">
                    <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: m.tint }}>
                      <LineIcon name={m.icon} size={22} color={m.color} />
                    </span>
                    <div className="flex-1">
                      <div className="font-bold text-[#0B1C3D] text-[16px]">{m.label}</div>
                      <div className="text-[13px] text-[#64748B] mt-0.5">{m.desc}</div>
                      {metaLine && <div className="text-[11px] text-[#94A3B8] mt-1">{metaLine}</div>}
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: m.tint, color: m.color }}>
                      {m.count} {tex.modeQuestions}
                    </span>
                  </button>
                );
              }

              // Locked card · click goes straight to /upgrade. One quiet lock,
              // no per-card price strip — the single gold CTA below the list
              // carries the offer.
              return (
                <button
                  key={m.id}
                  type="button"
                  onMouseEnter={() => setLockAnimKey(k => ({ ...k, [m.id]: (k[m.id] || 0) + 1 }))}
                  onClick={() => router.push(`/upgrade?lang=${lang}&plan=${suggestPlan}`)}
                  className="rounded-2xl p-5 flex items-center gap-4 text-left bg-white border border-[#E2E8F0] shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer">
                  <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: m.tint }}>
                    <LineIcon name={m.icon} size={22} color={m.color} />
                  </span>
                  <div className="flex-1">
                    <div className="font-bold text-[#0B1C3D] text-[16px]">{m.label}</div>
                    <div className="text-[13px] text-[#64748B] mt-0.5">{m.desc}</div>
                    {metaLine && <div className="text-[11px] text-[#94A3B8] mt-1">{metaLine}</div>}
                  </div>
                  <span
                    key={lockAnimKey[m.id] || 0}
                    className={`w-9 h-9 rounded-full bg-[#F1F5F9] flex items-center justify-center shrink-0 ${lockAnimKey[m.id] ? 'lock-animate' : ''}`}>
                    <LineIcon name="lock" size={17} color="#64748B" />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Single concrete offer for the whole locked group (free users). */}
          {!hasFullAccess && (
            <GradientButton
              variant="gold"
              onClick={() => router.push(`/upgrade?lang=${lang}&plan=${suggestPlan}`)}
              className="mt-4">
              <span className="text-[15px]">{unlockCtaText}</span>
            </GradientButton>
          )}

          {/* Real exam mode toggle (pro only) */}
          {hasFullAccess && (
            <label className="flex items-start gap-3 mt-5 p-4 rounded-xl bg-white/60 border border-[#E2E8F0] cursor-pointer hover:bg-white/80 transition">
              <input
                type="checkbox"
                checked={hideExplanations}
                onChange={e => setHideExplanations(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#2563EB] rounded shrink-0"
              />
              <div>
                <div className="text-sm font-semibold text-[#0B1C3D]">{dmv(tex.hideExplanations)}</div>
                <div className="text-xs text-[#64748B] mt-0.5">{dmv(tex.hideExplanationsDesc)}</div>
              </div>
            </label>
          )}
        </div>

        {/* Lock modal  ·  upgrade prompt */}
        {showLockModal && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4"
            onClick={() => setShowLockModal(false)}>
            <div className="bg-white rounded-3xl p-7 w-full max-w-sm shadow-2xl text-center"
              onClick={e => e.stopPropagation()}>
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#EFF6FF] flex items-center justify-center"><LineIcon name="unlock" size={32} /></div>
              <h3 className="text-xl font-bold text-[#0B1C3D] mb-2">
                {tex.unlockTitle || 'Unlock Full Access'}
              </h3>
              <p className="text-sm text-[#64748B] mb-6">
                {tex.unlockDesc || 'Get all test modes, unlimited practice, and real exam simulation.'}
              </p>
              <GradientButton
                onClick={() => router.push(`/upgrade?lang=${lang}&plan=${suggestPlan}`)}
                className="mb-3">
                {(tex.unlockCta || 'Unlock from {price}').replace('{price}', plan.price)}
              </GradientButton>
              <button type="button" onClick={() => setShowLockModal(false)}
                className="text-sm text-[#94A3B8] hover:text-[#64748B]">
                {tex.back}
              </button>
            </div>
          </div>
        )}
      </main>
    );
  }

  if (!questions.length) {
    // Network failure takes precedence: don't pretend the language has no
    // content (the "try English" path would also fail offline and loop).
    if (networkError) {
      return (
        <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#F1F5F9] flex items-center justify-center"><LineIcon name="offline" size={30} color="#94A3B8" /></div>
            <h2 className="text-lg font-bold text-[#0B1C3D] mb-2">{tex.connectionProblem}</h2>
            <p className="text-sm text-[#64748B] mb-4">{tex.connectionProblemBody}</p>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => setReloadKey(k => k + 1)}
                className="bg-[#2563EB] text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#1D4ED8] transition">
                {tex.tryAgain}
              </button>
              <button type="button" onClick={() => router.push(`/category?state=${state}&lang=${lang}`)}
                className="bg-white text-[#0B1C3D] border border-[#E2E8F0] px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#F1F5F9] transition">
                {tex.back}
              </button>
            </div>
          </div>
        </main>
      );
    }
    const isRateLimited = !!loadError && /rate|too many/i.test(loadError);
    const canFallbackToEnglish = lang !== 'en' && !isRateLimited;
    const testUrl = `/test?state=${state}&category=${category}${subcategory ? `&subcategory=${subcategory}` : ''}&lang=en`;
    return (
      <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#F1F5F9] flex items-center justify-center"><LineIcon name={isRateLimited ? 'clock' : 'inbox'} size={30} color="#94A3B8" /></div>
          <h2 className="text-lg font-bold text-[#0B1C3D] mb-2">
            {isRateLimited
              ? (tex.tooManyRequests || 'Too many requests')
              : canFallbackToEnglish ? (tex.notYetInLanguage || tex.noQuestionsFound) : tex.noQuestionsFound}
          </h2>
          {isRateLimited && (
            <p className="text-sm text-[#64748B] mb-4">{loadError}</p>
          )}
          {canFallbackToEnglish && (
            <p className="text-sm text-[#64748B] mb-4">{tex.tryEnglishWhilePrepping || 'Try the English version in the meantime.'}</p>
          )}
          <div className="flex flex-col gap-2">
            {canFallbackToEnglish && (
              <button type="button" onClick={() => { saveLang('en'); window.location.href = testUrl; }}
                className="bg-[#2563EB] text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#1D4ED8] transition">
                {tex.tryInEnglish || 'Try in English'}
              </button>
            )}
            <button type="button" onClick={() => router.push(`/category?state=${state}&lang=${lang}`)}
              className={`px-6 py-3 rounded-xl font-semibold text-sm transition ${canFallbackToEnglish ? 'bg-white text-[#0B1C3D] border border-[#E2E8F0] hover:bg-[#F1F5F9]' : 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]'}`}>
              {tex.back}
            </button>
          </div>
        </div>
      </main>
    );
  }

  const q = questions[current];
  if (!q || !q.answers?.length) return null;
  const total = questions.length;
  const answered = userAnswersRef.current.length;
  const progress = (answered / total) * 100;
  const correctCount = score;
  const wrongCount = answered - correctCount;

  async function handleSelect(index) {
    if (showAnswer || submittingAnswer) return;
    setCheckError(false);
    setSelected(index);

    // If question already has reveal data (retry mode), score locally.
    // Otherwise call /api/test/check to verify with the server.
    const revealed = q.correctAnswerIndex != null;
    let correct;
    if (revealed) {
      correct = index === q.correctAnswerIndex;
    } else {
      setSubmittingAnswer(true);
      let networkFailed = false;
      try {
        let token = q.q_token;
        for (let attempt = 0; ; attempt++) {
          const res = await fetch('/api/test/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q_token: token, choice: index }),
          });
          const data = await res.json();
          if (data.ok) {
            correct = !!data.correct;
            setQuestions(prev => prev.map((qq, i) =>
              i === current
                ? {
                    ...qq,
                    q_token: token,
                    correctAnswerIndex: data.correct_answer ?? 0,
                    explanation: data.explanation || null,
                    manualSection: data.manual_section || null,
                    manualReference: data.manual_reference || null,
                  }
                : qq
            ));
            break;
          }
          if (res.status === 429) {
            // Protective rate limit (shared IP bursts). Fully retryable after
            // a pause — treat like a network blip, never score it wrong.
            networkFailed = true;
            break;
          }
          if (data.error === 'token_expired' && attempt === 0) {
            // Token aged past its 4h TTL mid-test (slow marathon, thawed
            // tab). Mint a fresh one for this cluster and retry once —
            // before this, every answer after expiry was silently counted
            // wrong with no correct answer shown.
            const fresh = await mintFreshToken(q);
            if (fresh) { token = fresh; continue; }
          }
          // Unverifiable (tampered/ancient token, question deleted). Accept
          // the selection unverified (-1, no key highlighted) so the test
          // can still be finished.
          correct = false;
          setQuestions(prev => prev.map((qq, i) =>
            i === current ? { ...qq, correctAnswerIndex: -1 } : qq
          ));
          break;
        }
      } catch {
        // Network blip (offline / dropped request). Retryable: do NOT score,
        // advance, or record an answer — that would silently mark a correct
        // answer wrong. Surface an inline message and let the user tap again.
        networkFailed = true;
      } finally {
        setSubmittingAnswer(false);
      }
      if (networkFailed) {
        setSelected(null);
        setCheckError(true);
        return;
      }
    }

    setShowAnswer(true);
    if (correct) setScore(s => s + 1);
    const updatedAnswers = [...userAnswersRef.current, index];
    userAnswersRef.current = updatedAnswers;
    setUserAnswers(updatedAnswers);
    const arr = correct ? tex.motivationalCorrect : tex.motivationalWrong;
    const msg = arr[Math.floor(Math.random() * arr.length)];
    setMotivationalMessage({ text: msg, phase: 'show' });
  }

  handleSelectRef.current = handleSelect;

  // Durable result hand-off. Order matters: write the result FIRST (both
  // storages — sessionStorage for the same-tab /result read, localStorage so
  // a closed-and-reopened browser can still show the review), and only then
  // clear the progress snapshot. The old clear-then-unguarded-write order
  // could destroy a finished test with nothing to show for it when setItem
  // threw (private mode, quota on RU/ZH marathons).
  function persistResultAndClearProgress({ finalScore, totalCount }) {
    const payload = JSON.stringify({
      savedAt: Date.now(),
      questions, userAnswers: userAnswersRef.current,
      elapsed, state, category, lang,
      score: finalScore, total: totalCount,
    });
    try { sessionStorage.setItem('testResults', payload); } catch { /* private mode */ }
    try { localStorage.setItem('dmvsos_last_result', payload); } catch { /* quota */ }
    progressDoneRef.current = true;
    latestSnapRef.current = null; // kill the pagehide flush before removal
    if (!isRetry) {
      // Retry mode never owned a snapshot; clearing here used to delete an
      // unrelated paused test's progress.
      try { localStorage.removeItem(PROGRESS_KEY); } catch { /* noop */ }
      try { localStorage.removeItem(LEGACY_PROGRESS_KEY); } catch { /* noop */ }
    }
    trackTestFinish({ state, category, lang, mode: testMode, score: finalScore, total: totalCount });
  }

  async function handleNext() {
    if (!hasFullAccess && total === freeLimit && current === freeLimit - 1) {
      setShowUpgradeBanner(true);
      return;
    }
    if (current + 1 < total) {
      const nextIndex = current + 1;
      const nextAnswer = userAnswersRef.current[nextIndex];
      setCurrent(nextIndex);
      if (nextAnswer !== undefined) {
        setSelected(nextAnswer);
        setShowAnswer(true);
      } else {
        setSelected(null);
        setShowAnswer(false); setShowManualQuote(false); setShowReport(false); setReportReason(""); setReportComment(""); setReportSent(false);
      }
    } else {
      // Use ref for answers  ·  guaranteed to include the last answer (no batching race)
      const allAnswers = userAnswersRef.current;
      const finalScore = allAnswers.reduce((acc, ans, i) => acc + (ans === questions[i]?.correctAnswerIndex ? 1 : 0), 0);
      persistResultAndClearProgress({ finalScore, totalCount: total });
      // Guard against double-fire from rapid Enter/click before router.push
      // finishes. First call wins, subsequent calls are no-ops.
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && !sessionSavedRef.current) {
        sessionSavedRef.current = true;
        const row = { user_id: session.user.id, state, category, score: finalScore, total, lang };
        const { error: insErr } = await supabase.from('test_sessions').insert(row);
        if (insErr) {
          console.error('[test] test_sessions insert failed', insErr.message || insErr.code || insErr);
          // Fallback: lang column may not exist yet
          const { lang: _lang, ...rowNoLang } = row;
          await supabase.from('test_sessions').insert(rowNoLang).catch(() => {});
        }
      }
      // state+category ride along so /result can compute the PASS/FAIL
      // verdict against the right state's pass mark even with empty storage
      // (it used to silently fall back to Washington's rules).
      router.push(`/result?score=${finalScore}&total=${total}&lang=${lang}&state=${encodeURIComponent(state)}&category=${encodeURIComponent(category)}`);
    }
  }
  handleNextRef.current = handleNext;

  return (
    <main className="min-h-dvh bg-[#F8FAFC] flex flex-col items-center justify-center px-6 pt-6 pb-[calc(env(safe-area-inset-bottom)+4rem)]">
      <div className="w-full max-w-md">

        {/* Header with nav */}
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={handleBack}
            className="text-sm text-[#94A3B8] hover:text-[#2563EB] transition font-medium">
            {tex.back}
          </button>
          <Link href="/" className="flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition">
            <Image src="/logo.png" alt="DMVSOS" width={24} height={24} className="rounded-md" />
            <span className="text-sm font-bold text-[#0B1C3D]">DMVSOS</span>
          </Link>
          <div className="w-12" />
        </div>

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#16A34A] inline-flex items-center gap-1"><CheckDot /> {correctCount}</span>
            <span className="text-sm text-[#DC2626] inline-flex items-center gap-1"><CrossDot /> {wrongCount}</span>
          </div>
          <div className="flex items-center gap-3">
            {hasTimer && (
              <span className={`text-sm font-medium ${remaining <= 60 ? 'text-[#DC2626]' : 'text-[#94A3B8]'}`}><LineIcon name="clock" size={13} color="currentColor" className="inline-block align-[-2px] mr-1" />{formatTime(remaining)}</span>
            )}
            <span className="text-sm font-medium text-[#94A3B8]">{current + 1} / {total}</span>
          </div>
        </div>

        <div className="w-full h-1.5 bg-[#E2E8F0] rounded-full mb-6">
          <div className="h-1.5 bg-[#2563EB] rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }} />
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-sm border border-[#E2E8F0] mb-5">

          {q.imageUrl && (
            <div className="relative w-full aspect-video mb-5">
              <Image src={q.imageUrl} alt="" fill
                className="rounded-xl border border-[#E2E8F0] object-contain"
                sizes="(max-width: 640px) 100vw, 640px" />
            </div>
          )}

          <p className="text-[17px] font-bold text-[#0B1C3D] leading-relaxed mb-3">
            {(q.question || '').replace(/^\d+\.\s*/, '')}
          </p>

          {lang !== 'en' && q.clusterCode && (
            <div className="mb-5">
              <button
                type="button"
                onClick={async () => {
                  if (!hasFullAccess) { setShowLockModal(true); return; }
                  const next = !showAltView;
                  setShowAltView(next);
                  if (next) await fetchAltView(q.clusterCode);
                }}
                className={
                  hasFullAccess
                    ? 'text-xs font-semibold inline-flex items-center gap-1.5 text-[#2563EB] hover:underline'
                    : 'group inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-gradient-to-r from-[#FEF3C7] to-[#FFEDD5] border border-[#FCD34D] text-[#92400E] hover:from-[#FDE68A] hover:to-[#FED7AA] hover:border-[#F59E0B] hover:-translate-y-0.5 hover:shadow-md transition-all duration-150'
                }
              >
                <span className="text-[10px] font-bold tracking-wide">EN</span>
                <span>{(
                  showAltView
                    ? (tex.hideOriginal || 'Hide {agency} original')
                    : hasFullAccess
                      ? (tex.viewOriginal || 'View {agency} original question')
                      : (tex.viewOriginalLocked || tex.viewOriginal || 'View {agency} original + more Pro features')
                ).replace('{agency}', agencyAbbrForState(state))}</span>
                {!hasFullAccess && (
                  <span className="text-[9px] font-extrabold uppercase tracking-wider ml-1 px-1.5 py-0.5 rounded bg-[#F59E0B] text-white shadow-sm">
                    Pro
                  </span>
                )}
                {fetchingAltView && <span className="inline-block w-3 h-3 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin ml-1" />}
              </button>
              {hasFullAccess && showAltView && altViewCache[q.clusterCode] && (
                <div className="mt-2 p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
                  {altViewCache[q.clusterCode].notFound ? (
                    <p className="text-xs text-[#94A3B8] italic">No English version available.</p>
                  ) : (
                    <>
                      <p className="text-[14px] font-semibold text-[#0B1C3D] leading-relaxed mb-2">
                        {(altViewCache[q.clusterCode].question || '').replace(/^\d+\.\s*/, '')}
                      </p>
                      <div className="flex flex-col gap-1">
                        {altViewCache[q.clusterCode].answers.map((a, i) => (
                          <div key={i} className="text-[13px] text-[#475569] leading-snug">
                            <span className="font-semibold mr-1.5 text-[#0B1C3D]">{['A','B','C','D'][i]}.</span>{a}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {q.answers.map((opt, i) => {
              let style = 'border border-[#E2E8F0] text-[#0B1C3D] bg-white';
              if (showAnswer) {
                if (hideExplanations) {
                  // Real exam mode: only highlight selected answer, don't reveal correct
                  if (i === selected) style = 'border border-[#2563EB] bg-[#EFF6FF] text-[#2563EB] font-semibold';
                  else style = 'border border-[#E2E8F0] text-[#94A3B8] bg-white opacity-60';
                } else {
                  if (i === q.correctAnswerIndex) style = 'border border-[#16A34A] bg-[#F0FDF4] text-[#16A34A] font-semibold';
                  else if (i === selected) style = 'border border-[#DC2626] bg-[#FEF2F2] text-[#DC2626]';
                  else style = 'border border-[#E2E8F0] text-[#94A3B8] bg-white opacity-60';
                }
              }
              const isPending = submittingAnswer && i === selected;
              return (
                <button key={i} type="button" onClick={() => handleSelect(i)}
                  disabled={submittingAnswer}
                  className={`w-full text-left px-4 py-3.5 rounded-xl text-sm transition-all ${style} ${!showAnswer && !submittingAnswer ? 'hover:border-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#2563EB]' : ''} ${submittingAnswer ? 'cursor-wait opacity-90' : ''}`}>
                  <span className="font-semibold mr-3 text-[#0B1C3D]">{['A', 'B', 'C', 'D'][i]}.</span>
                  {opt.replace(/^[A-DА-Га-гa-d]\.\s*/, '')}
                  {isPending && (
                    <span className="inline-block ml-2 w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin align-middle" />
                  )}
                </button>
              );
            })}
          </div>
          {checkError && (
            <p className="text-sm text-[#DC2626] mt-3 text-center">{tex.checkConnectionRetry}</p>
          )}
        </div>

        {showAnswer && q.answers[q.correctAnswerIndex] && !hideExplanations && (
          <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 mb-5">
            <p className="text-sm text-[#1E40AF] leading-relaxed">
              <CheckDot /> {tex.correct}: <strong>{q.answers[q.correctAnswerIndex].replace(/^[A-DА-Га-гa-d]\.\s*/, '')}</strong>
            </p>
            {q.explanation && (
              <p className="text-sm text-[#1E40AF]/80 leading-relaxed mt-2">
                {q.explanation}
              </p>
            )}
            {q.manualReference && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowManualQuote(v => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] bg-white border border-[#BFDBFE] rounded-full px-3 py-1.5 hover:bg-[#EFF6FF] hover:border-[#2563EB] transition-all"
                >
                  <LineIcon name="book" size={14} />
                  <span>
                    {q.manualSection || (tex.viewInManual || 'Driver Manual')}
                  </span>
                  <svg width="10" height="10" viewBox="0 0 12 12" className={`shrink-0 transition-transform ${showManualQuote ? 'rotate-180' : ''}`} style={{ fill: 'currentColor', opacity: 0.7 }} aria-hidden="true"><path d="M6 8L1 3h10z" /></svg>
                </button>
                {showManualQuote && (
                  <p className="mt-2 text-xs text-[#1E40AF] italic border-l-2 border-[#2563EB] pl-3 leading-relaxed">
                    &ldquo;{q.manualReference}&rdquo;
                  </p>
                )}
              </div>
            )}

            {/* Bug report — tiny link under explanation */}
            {q.q_token && !reportSent && !showReport && (
              <div className="mt-3 text-right">
                <button
                  type="button"
                  onClick={() => setShowReport(true)}
                  className="text-[11px] text-[#94A3B8] hover:text-[#DC2626] transition-colors"
                  title={tex.reportQuestion || 'Report a problem with this question'}
                >
                  <LineIcon name="flag" size={12} color="currentColor" className="inline-block align-[-1px] mr-1" />{tex.reportQuestion || 'Report'}
                </button>
              </div>
            )}

            {showReport && !reportSent && (
              <div className="mt-3 p-3 bg-white border border-[#FED7AA] rounded-xl">
                <p className="text-xs font-semibold text-[#9A3412] mb-2">
                  {tex.reportPrompt || 'What is wrong with this question?'}
                </p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    { key: 'wrong_answer',    label: tex.reportReasonWrong || 'Wrong answer' },
                    { key: 'bad_translation', label: tex.reportReasonTrans || 'Bad translation' },
                    { key: 'unclear',         label: tex.reportReasonUnclear || 'Unclear' },
                    { key: 'broken_image',    label: tex.reportReasonImage || 'Broken image' },
                    { key: 'other',           label: tex.reportReasonOther || 'Other' },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setReportReason(opt.key)}
                      className={`text-[11px] px-2 py-1 rounded-full border transition ${
                        reportReason === opt.key
                          ? 'bg-[#DC2626] border-[#DC2626] text-white font-semibold'
                          : 'bg-white border-[#FED7AA] text-[#9A3412] hover:border-[#DC2626]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={reportComment}
                  onChange={(e) => setReportComment(e.target.value.slice(0, 500))}
                  placeholder={tex.reportCommentPlaceholder || 'Optional: describe what is wrong...'}
                  className="w-full text-xs p-2 border border-[#FED7AA] rounded-lg resize-none focus:outline-none focus:border-[#DC2626]"
                  rows={2}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => { setShowReport(false); setReportReason(''); setReportComment(''); }}
                    className="flex-1 text-xs py-1.5 rounded-lg border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]"
                  >
                    {tex.cancel || 'Cancel'}
                  </button>
                  <button
                    type="button"
                    disabled={!reportReason || reportSubmitting}
                    onClick={() => submitReport(q.q_token)}
                    className={`flex-1 text-xs py-1.5 rounded-lg font-semibold transition ${
                      reportReason && !reportSubmitting
                        ? 'bg-[#DC2626] text-white hover:bg-[#B91C1C]'
                        : 'bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed'
                    }`}
                  >
                    {reportSubmitting ? (tex.sending || 'Sending...') : (tex.send || 'Send')}
                  </button>
                </div>
              </div>
            )}

            {reportSent && (
              <div className="mt-3 p-2 bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl text-center">
                <p className="text-xs text-[#065F46] font-semibold">
                  <CheckDot size={13} /> {tex.reportThanks || 'Thanks! We will check it.'}
                </p>
              </div>
            )}
          </div>
        )}

        {motivationalMessage && !hideExplanations && (
          <p className={`text-center text-base font-semibold mb-4 transition-opacity duration-300 ${motivationalMessage.phase === 'fade' ? 'opacity-0' : 'opacity-100'}`}>
            {motivationalMessage.text}
          </p>
        )}

        {/* Q18 pre-paywall nudge */}
        {!hasFullAccess && current === nudgeAt && showAnswer && (
          <div className="bg-[#FFF7ED] border border-[#FED7AA] rounded-xl px-4 py-3 mb-4 text-sm text-[#92400E] font-medium text-center">
            <LineIcon name="bell" size={13} color="currentColor" className="inline-block align-[-2px] mr-1" />{(tex.nudgeFreeLeft || '{n} {w} left in your free test').replace('{n}', freeLimit - current - 1).replace('{w}', pluralizeQuestions(freeLimit - current - 1, lang))}  ·  {tex.nudgeUnlockFrom || 'unlock all from'} {plan.price}
          </div>
        )}

        {!showUpgradeBanner && (
          <div className="flex gap-3">
            {current > 0 && (
              <button type="button" onClick={handlePrev}
                className="px-5 py-3.5 rounded-xl font-semibold text-base border border-[#E2E8F0] text-[#64748B] hover:border-[#2563EB] hover:text-[#2563EB] transition-all">
                {tex.prevQuestion}
              </button>
            )}
            {showAnswer && (
              <button type="button" onClick={handleNext}
                className="flex-1 bg-[#2563EB] text-white py-3.5 rounded-xl font-semibold text-base hover:bg-[#1D4ED8] transition-all">
                {current + 1 < total ? tex.next : tex.seeResults}
              </button>
            )}
          </div>
        )}

      </div>

      {/* Soft email capture overlay (Q10, anonymous) */}
      {showEmailCapture && !hasFullAccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl border border-[#E2E8F0] overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-[#2563EB] via-[#3B82F6] to-[#2563EB]" />
            <div className="p-6">
              {!emailSent ? (
                <>
                  <h2 className="text-lg font-bold text-[#0B1C3D] mb-1 text-center">
                    {tex.captureTitle || 'Save your progress'}
                  </h2>
                  <p className="text-sm text-[#64748B] mb-4 text-center">
                    {tex.captureDesc || "We'll send a magic link. No password, no spam."}
                  </p>
                  <form onSubmit={handleSubmitEmail} className="space-y-3">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder={tex.emailPlaceholder || 'you@email.com'}
                      required
                      autoFocus
                      className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm focus:border-[#2563EB] focus:outline-none"
                    />
                    {emailError && (
                      <p className="text-xs text-[#DC2626]">{emailError}</p>
                    )}
                    <button
                      type="submit"
                      disabled={emailSubmitting}
                      className="w-full py-3 rounded-xl font-bold text-white text-sm bg-[#2563EB] hover:bg-[#1D4ED8] transition disabled:opacity-60"
                    >
                      {emailSubmitting ? '…' : (tex.captureSubmit || 'Send link')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEmailCapture(false)}
                      className="w-full py-2 text-xs text-[#94A3B8] hover:text-[#64748B] transition"
                    >
                      {tex.captureLater || 'Maybe later'}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-[#EFF6FF] flex items-center justify-center"><LineIcon name="mail" size={26} /></div>
                  <h2 className="text-lg font-bold text-[#0B1C3D] mb-1 text-center">
                    {tex.captureSentTitle || 'Check your email'}
                  </h2>
                  <p className="text-sm text-[#64748B] mb-5 text-center">
                    {(tex.captureSentDesc || 'We sent a magic link to {email} — click it to save your progress and continue practicing on any device.').replace('{email}', emailInput)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowEmailCapture(false)}
                    className="w-full py-3 rounded-xl font-semibold text-sm bg-[#F1F5F9] text-[#0B1C3D] hover:bg-[#E2E8F0] transition"
                  >
                    {tex.continueTest || 'Continue test'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upgrade modal overlay */}
      {showUpgradeBanner && !hasFullAccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-[#E2E8F0] overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-[#F59E0B] via-[#FB923C] to-[#F59E0B]" />
            <div className="p-6">
              {/* Score-aware headline: tie the moment to the state's real pass
                  mark (factual mentor feedback, not fear copy). Below the mark →
                  "let's fix that"; at/above → "lock it in". */}
              {(() => {
                const pct = Math.round((score / freeLimit) * 100);
                const passPct = passPercentFor(state, category === 'cdl' ? 'cdl' : category === 'moto' ? 'motorcycle' : 'car') || 80;
                const belowPass = pct < passPct;
                const titleTpl = belowPass
                  ? (tex.upgradeModalTitleShort || 'Below the {agency} pass mark ({passPct}%) — let’s fix that')
                  : (tex.upgradeModalTitlePass || 'You’d pass this one. Lock it in for exam day.');
                return (
                  <h2 className="text-xl font-bold text-[#0B1C3D] mb-1 text-center">
                    {titleTpl.replace('{agency}', ag).replace('{passPct}', String(passPct))}
                  </h2>
                );
              })()}
              <p className="text-[#2563EB] font-bold text-sm mb-4 text-center">
                {(tex.upgradeScoreSoFar || 'Your score: {score}/{total}')
                  .replace('{score}', String(score))
                  .replace('{total}', String(freeLimit))
                  .replace('{percent}', String(Math.round((score / freeLimit) * 100)))}
              </p>
              {/* NOTE: no /manuals link here on purpose. The paywall is the buy
                  moment — advertising the free handbook at this exact point sent
                  buyers off to read the source instead (and violates the brand
                  rule: never pitch "from the manual"). */}

              {/* Highlighted plan card for current category */}
              <div className="flex justify-center mb-4">
                <div className="w-full max-w-[200px] border-2 rounded-xl p-4 text-center flex flex-col"
                  style={{
                    borderColor: isCdl ? '#F59E0B' : isMoto ? '#D97706' : '#2563EB',
                    background: isCdl ? '#FFFBEB' : isMoto ? '#FFF7ED' : '#EFF6FF',
                  }}>
                  {isCdl && <div className="text-[9px] font-bold text-[#0B1C3D] bg-[#F59E0B] rounded-full px-1.5 py-0.5 mb-1 mx-auto w-fit">{tex.planCdlBadge || 'Car tests included'}</div>}
                  {!isCdl && !isMoto && <div className="text-[9px] font-bold text-white bg-[#2563EB] rounded-full px-1.5 py-0.5 mb-1 mx-auto w-fit">{tex.planPopular}</div>}
                  <div className="h-[52px] flex items-center justify-center mb-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={PLAN_ART[plan.pass_type] || PLAN_ART.auto} alt="" aria-hidden="true" className="max-h-[48px] w-auto object-contain select-none pointer-events-none" />
                  </div>
                  <div className="text-xs font-bold mb-0.5" style={{ color: isCdl ? '#92400E' : isMoto ? '#D97706' : '#2563EB' }}>
                    {isCdl ? tex.planCdlPro : isMoto ? tex.planMotoPass : tex.planAutoPass}
                  </div>
                  <div className="text-2xl font-black text-[#0B1C3D] mb-0.5">{plan.price}</div>
                  <div className="text-[10px] text-[#64748B] mb-3">{tex.planDuration || '30-day access'}</div>
                  <GradientButton
                    onClick={modalCheckout}
                    variant={isCdl || isMoto ? 'gold' : 'blue'}
                    className={`text-sm ${modalBuyLoading ? 'pointer-events-none opacity-60' : ''}`}>
                    {modalBuyLoading ? '…' : (tex.getIt || 'Get it')}
                  </GradientButton>
                  {modalNotice?.type === 'owned' && (
                    <p className="text-[11px] text-[#B45309] mt-2 leading-snug">
                      {tex.alreadyOwnPass || 'You already have this pass.'}{' '}
                      <Link href={`/profile?lang=${lang}`} className="underline font-semibold">
                        {tex.planManage || 'Manage'}
                      </Link>
                    </p>
                  )}
                </div>
              </div>

              <p className="text-center text-xs text-[#94A3B8] mb-1">{tex.cancelAnytime}</p>
              <p className="text-center mb-3">
                <Link href={`/upgrade?lang=${lang}`} className="text-xs text-[#94A3B8] underline hover:text-[#64748B]">
                  {tex.seeAllPlans || 'See all plans'}
                </Link>
              </p>

              <button type="button" onClick={() => {
                const allAnswers = userAnswersRef.current;
                const finalScore = allAnswers.reduce((acc, ans, i) => acc + (ans === questions[i]?.correctAnswerIndex ? 1 : 0), 0);
                persistResultAndClearProgress({ finalScore, totalCount: questions.length });
                router.push(`/result?score=${finalScore}&total=${questions.length}&lang=${lang}&state=${encodeURIComponent(state)}&category=${encodeURIComponent(category)}`);
              }}
                className="w-full text-sm text-[#94A3B8] hover:text-[#64748B] transition text-center">
                {tex.seeResults}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Time's up modal */}
      {showTimeUp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-xl border border-[#E2E8F0] text-center">
            <h2 className="text-2xl font-bold text-[#0B1C3D] mb-4">{tex.timesUp}</h2>
            <button type="button" onClick={() => {
              const allAnswers = userAnswersRef.current;
              const finalScore = allAnswers.reduce((acc, ans, i) => acc + (ans === questions[i]?.correctAnswerIndex ? 1 : 0), 0);
              persistResultAndClearProgress({ finalScore, totalCount: questions.length });
              router.push(`/result?score=${finalScore}&total=${questions.length}&lang=${lang}&state=${encodeURIComponent(state)}&category=${encodeURIComponent(category)}`);
            }}
              className="w-full bg-[#2563EB] text-white py-3.5 rounded-xl font-semibold text-base hover:bg-[#1D4ED8] transition-all mb-3">
              {tex.seeResultsBtn}
            </button>
            <button type="button" onClick={() => {
              timeLimitRef.current += 10 * 60;
              setRemaining(r => r + 10 * 60);
              setShowTimeUp(false);
            }}
              className="w-full border border-[#E2E8F0] text-[#0B1C3D] py-3.5 rounded-xl font-semibold text-base hover:bg-[#F8FAFC] hover:border-[#2563EB] transition-all">
              {tex.addTime}
            </button>
          </div>
        </div>
      )}

      {/* Leave confirmation modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-[#E2E8F0] text-center">
            <p className="text-base font-semibold text-[#0B1C3D] mb-5">{tex.leaveConfirm}</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 py-3 rounded-xl border border-[#E2E8F0] text-[#0B1C3D] font-semibold text-sm hover:bg-[#F8FAFC] transition">
                {tex.back || 'Cancel'}
              </button>
              <button type="button" onClick={() => router.push('/')}
                className="flex-1 py-3 rounded-xl bg-[#DC2626] text-white font-semibold text-sm hover:bg-[#B91C1C] transition">
                {tex.home || 'Leave'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lock modal · also rendered here so the locked "View in English"
          button on the active test screen has somewhere to show its prompt
          (the mode-selection branch above renders the original copy). */}
      {showLockModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4"
          onClick={() => setShowLockModal(false)}>
          <div className="bg-white rounded-3xl p-7 w-full max-w-sm shadow-2xl text-center"
            onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#EFF6FF] flex items-center justify-center"><LineIcon name="globe" size={32} /></div>
            <h3 className="text-xl font-bold text-[#0B1C3D] mb-2">
              {tex.unlockTitle || 'Unlock Full Access'}
            </h3>
            <p className="text-sm text-[#64748B] mb-6">
              {tex.unlockDesc || 'Get all test modes, unlimited practice, and real exam simulation.'}
            </p>
            <GradientButton
              onClick={() => router.push(`/upgrade?lang=${lang}&plan=${suggestPlan}`)}
              className="mb-3">
              {(tex.unlockCta || 'Unlock from {price}').replace('{price}', plan.price)}
            </GradientButton>
            <button type="button" onClick={() => setShowLockModal(false)}
              className="text-sm text-[#94A3B8] hover:text-[#64748B]">
              {tex.back}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function Test() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#94A3B8] border-t-transparent rounded-full animate-spin" /></main>}>
      <TestContent />
    </Suspense>
  );
}