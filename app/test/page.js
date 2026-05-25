'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { t } from '@/lib/translations';
import { getSavedLang, saveLang } from '@/lib/lang';
import { flags } from '@/lib/flags';
import { agencyAbbrForState } from '@/lib/agencies';
import { examRulesFor } from '@/lib/exam-rules';
import { planForCategory } from '@/lib/plans';

const langs = [
  { label: 'EN', flag: flags.us, code: 'en' },
  { label: 'RU', flag: flags.ru, code: 'ru' },
  { label: 'ES', flag: flags.es, code: 'es' },
  { label: 'ZH', flag: flags.cn, code: 'zh' },
  { label: 'UA', flag: flags.ua, code: 'ua' },
];

function TestContent() {
  const router = useRouter();
  const params = useSearchParams();
  const state = params.get('state') || 'washington';
  const category = params.get('category') || 'car';
  const subcategory = params.get('subcategory') || null;
  const [lang, setLangState] = useState(params.get('lang') || getSavedLang());
  const [showLangMenu, setShowLangMenu] = useState(false);
  const currentLang = langs.find(l => l.code === lang) || langs[0];
  function switchLang(code) { setLangState(code); saveLang(code); setShowLangMenu(false); }

  // Per-question English reference view — lets non-English learners study in
  // their language and tap to see the canonical EN original on any question.
  // Only useful when the test lang is non-EN (an EN test doesn't need a
  // translation toggle). Cached by [clusterCode] so toggling is free.
  const [altViewCache, setAltViewCache] = useState({}); // { [clusterCode]: {question, answers, notFound?} }
  const [showAltView, setShowAltView] = useState(false);
  const [fetchingAltView, setFetchingAltView] = useState(false);
  const isRetry = params.get('retry') === 'true';
  const tex = t[lang] || t.en;

  const { isPro, hasCar, hasMoto, hasCdl, loading: authLoading } = useAuth();

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
    startTimeRef.current = Date.now();
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
            setLoadError(`Too many requests. Try again in ~${mins} min.`);
          } else {
            setLoadError(error || 'Failed to load questions.');
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
        setAllQuestions(mapped);
        setLoadingQuestions(false);
      })
      .catch(() => {
        setAllQuestions([]);
        setLoadingQuestions(false);
      });
  }, [state, category, lang, isRetry, subcategory]);

  // Close the alt view when moving between questions
  useEffect(() => { setShowAltView(false); }, [current]);

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
    setQuestions(allQuestions.slice(0, Math.min(limit, allQuestions.length)));
    setCurrent(0);
    setScore(0);
    setUserAnswers([]);
    userAnswersRef.current = [];
    setSelected(null);
    setShowAnswer(false); setShowManualQuote(false); setShowReport(false); setReportReason(""); setReportComment(""); setReportSent(false);
    setElapsed(0);
    setTestMode(mode);
  }

  // Keyboard shortcuts: 1-4 to select answer, Enter/Space to advance
  // Must be before early returns to satisfy Rules of Hooks
  // Refs for keyboard shortcuts (must be before early returns for Rules of Hooks)
  const handleSelectRef = useRef(null);
  const handleNextRef = useRef(null);
  const handlePrevRef = useRef(null);
  // Ref for synchronous answer tracking (avoids React state batching race condition)
  const userAnswersRef = useRef([]);
  useEffect(() => {
    if (!testMode || !questions.length) return;
    function onKeyDown(e) {
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
    if (localStorage.getItem('dmvsos_email_seen')) return;
    // Trigger at Q10 (0-indexed = 9). For moto where freeLimit=5, skip.
    if (freeLimit < 20) return;
    if (current === 9 && showAnswer) {
      setShowEmailCapture(true);
      localStorage.setItem('dmvsos_email_seen', '1');
    }
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
        <div className="text-4xl mb-4 hourglass-spin">⏳</div>
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
        icon: '✏️',
        label: tex.modePractice || 'Quick Practice',
        desc: isMoto
          ? `${freeLimit} ${tex.modeQuestions || 'questions'}  ·  always free`
          : (tex.modePracticeDesc || '20 questions  ·  always free'),
        count: Math.min(freeLimit, totalAvailable),
        color: '#16A34A',
        gradient: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
        locked: false,
      }] : []),
      {
        id: 'real',
        icon: '🎯',
        label: tex.modeReal,
        desc: tex.modeRealDesc,
        count: realCount,
        color: '#2563EB',
        gradient: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
        time: `⏱ 60 ${tex.minLabel}`,
        locked: !hasFullAccess,
      },
      // Extended only for car/cdl — moto exam is short, 80q doesn't make sense
      ...(!isMoto ? [{
        id: 'extended',
        icon: '📚',
        label: tex.modeExtended,
        desc: tex.modeExtendedDesc,
        count: Math.min(80, totalAvailable),
        color: '#7C3AED',
        gradient: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)',
        locked: !hasFullAccess,
      }] : []),
      {
        id: 'marathon',
        icon: '🏆',
        label: tex.modeMarathon,
        desc: tex.modeMarathonDesc,
        count: totalAvailable,
        color: '#D97706',
        gradient: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)',
        locked: !hasFullAccess,
      },
    ];

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
              <span>{currentLang.flag}</span><span>{currentLang.label}</span><span className="text-[#94A3B8] text-[10px] ml-0.5">▾</span>
            </button>
            {showLangMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-lg z-50 py-1 min-w-[90px]">
                {langs.map(l => (
                  <button key={l.code} type="button" onMouseDown={() => switchLang(l.code)}
                    className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-[#F8FAFC] transition-colors ${lang === l.code ? 'text-[#2563EB]' : 'text-[#64748B]'}`}>
                    <span>{l.flag}</span> <span>{l.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="w-full max-w-md mt-12">
          <div className="text-center mb-5">
            <h2 className="text-xl font-bold text-[#1E293B] mb-1">{tex.chooseMode}</h2>
            <p className="text-sm text-[#94A3B8]">{totalAvailable} {tex.modeQuestions}</p>
          </div>

          <div className="flex flex-col gap-3">
            {modes.map(m => {
              if (!m.locked) {
                // Unlocked card
                return (
                  <button key={m.id} type="button" onClick={() => startWithMode(m.id)}
                    className="rounded-2xl p-5 flex items-center gap-4 hover:shadow-lg transition-all text-left border-2 border-white/60 shadow-md"
                    style={{ background: m.gradient }}>
                    <span className="text-3xl">{m.icon}</span>
                    <div className="flex-1">
                      <div className="font-bold text-[#1E293B]">{m.label}</div>
                      <div className="text-sm text-[#64748B] mt-0.5">{m.desc}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/70" style={{ color: m.color }}>
                        {m.count} {tex.modeQuestions}
                      </span>
                      {!hasFullAccess && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#16A34A]">
                          {tex.freeLabel}
                        </span>
                      )}
                    </div>
                  </button>
                );
              }

              // Locked card  ·  interactive lock on hover, click opens upgrade modal
              return (
                <button
                  key={m.id}
                  type="button"
                  onMouseEnter={() => setLockAnimKey(k => ({ ...k, [m.id]: (k[m.id] || 0) + 1 }))}
                  onClick={() => setShowLockModal(true)}
                  className="rounded-2xl pt-5 px-5 pb-8 flex items-center gap-4 text-left border-2 border-white/40 shadow-md transition-all hover:shadow-lg relative overflow-hidden cursor-pointer"
                  style={{ background: m.gradient, opacity: 0.85 }}>
                  {/* Dimming overlay */}
                  <div className="absolute inset-0 bg-white/30 pointer-events-none rounded-2xl" />
                  <span className="text-3xl relative" style={{ filter: 'grayscale(0.3)' }}>{m.icon}</span>
                  <div className="flex-1 relative">
                    <div className="font-bold text-[#1E293B]">{m.label}</div>
                    <div className="text-sm text-[#64748B] mt-0.5">{m.desc}</div>
                    {m.time && (
                      <div className="text-[11px] text-[#94A3B8] mt-1">{m.time}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0 relative">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/70 text-[#94A3B8]">
                      {m.count} {tex.modeQuestions}
                    </span>
                    {/* Animated lock */}
                    <span
                      key={lockAnimKey[m.id] || 0}
                      className={lockAnimKey[m.id] ? 'lock-animate' : ''}
                      style={{ fontSize: 20, lineHeight: 1 }}>
                      🔒
                    </span>
                  </div>
                  {/* Guaranteed pass badge — shimmer bottom strip */}
                  <div className="badge-shimmer absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1.5 py-1.5 rounded-b-2xl">
                    <span style={{ fontSize: 11 }}>🛡️</span>
                    <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: '#92400E' }}>
                      CDL Pro · 99%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

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
                <div className="text-sm font-semibold text-[#1E293B]">{tex.hideExplanations}</div>
                <div className="text-xs text-[#64748B] mt-0.5">{tex.hideExplanationsDesc}</div>
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
              <div className="text-5xl mb-3">🔓</div>
              <h3 className="text-xl font-bold text-[#0B1C3D] mb-2">
                {tex.unlockTitle || 'Unlock Full Access'}
              </h3>
              <p className="text-sm text-[#64748B] mb-6">
                {tex.unlockDesc || 'Get all test modes, unlimited practice, and real exam simulation.'}
              </p>
              <button
                type="button"
                onClick={() => router.push(`/upgrade?lang=${lang}&plan=${suggestPlan}`)}
                className="w-full py-3.5 rounded-2xl font-bold text-white text-base mb-3 btn-pulse"
                style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)' }}>
                {tex.unlockCta || `Unlock from ${plan.price} →`}
              </button>
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
    const isRateLimited = !!loadError && /rate|too many/i.test(loadError);
    const canFallbackToEnglish = lang !== 'en' && !isRateLimited;
    const testUrl = `/test?state=${state}&category=${category}${subcategory ? `&subcategory=${subcategory}` : ''}&lang=en`;
    return (
      <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">{isRateLimited ? '⏳' : '📭'}</div>
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
                {tex.tryInEnglish || 'Try in English 🇺🇸'}
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
    setSelected(index);

    // If question already has reveal data (retry mode), score locally.
    // Otherwise call /api/test/check to verify with the server.
    const revealed = q.correctAnswerIndex != null;
    let correct;
    if (revealed) {
      correct = index === q.correctAnswerIndex;
    } else {
      setSubmittingAnswer(true);
      try {
        const res = await fetch('/api/test/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q_token: q.q_token, choice: index }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'check failed');
        correct = !!data.correct;
        setQuestions(prev => prev.map((qq, i) =>
          i === current
            ? {
                ...qq,
                correctAnswerIndex: data.correct_answer ?? 0,
                explanation: data.explanation || null,
                manualSection: data.manual_section || null,
                manualReference: data.manual_reference || null,
              }
            : qq
        ));
      } catch {
        // Network/rate-limit fallback: accept selection, mark as incorrect.
        // -1 means no answer key is shown highlighted (no false-positive).
        correct = false;
        setQuestions(prev => prev.map((qq, i) =>
          i === current ? { ...qq, correctAnswerIndex: -1 } : qq
        ));
      } finally {
        setSubmittingAnswer(false);
      }
    }

    setShowAnswer(true);
    if (correct) setScore(s => s + 1);
    const updatedAnswers = [...userAnswersRef.current, index];
    userAnswersRef.current = updatedAnswers;
    setUserAnswers(updatedAnswers);
    const arr = correct ? tex.motivationalCorrect : tex.motivationalWrong;
    // eslint-disable-next-line react-hooks/purity -- inside event handler, not render path
    const msg = arr[Math.floor(Math.random() * arr.length)];
    setMotivationalMessage({ text: msg, phase: 'show' });
  }

  handleSelectRef.current = handleSelect;

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
      const langParam = new URLSearchParams(window.location.search).get('lang') || 'en';
      sessionStorage.setItem(
        'testResults',
        JSON.stringify({ questions, userAnswers: allAnswers, elapsed, state, category, lang: langParam })
      );
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const row = { user_id: session.user.id, state, category, score: finalScore, total, lang };
        const { error: insErr } = await supabase.from('test_sessions').insert(row);
        if (insErr) {
          // Fallback: lang column may not exist yet
          const { lang: _lang, ...rowNoLang } = row;
          await supabase.from('test_sessions').insert(rowNoLang).catch(() => {});
        }
      }
      router.push(`/result?score=${finalScore}&total=${total}&lang=${lang}`);
    }
  }
  handleNextRef.current = handleNext;

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
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
            <span className="text-sm text-[#16A34A]">✅ {correctCount}</span>
            <span className="text-sm text-[#DC2626]">❌ {wrongCount}</span>
          </div>
          <div className="flex items-center gap-3">
            {hasTimer && (
              <span className={`text-sm font-medium ${remaining <= 60 ? 'text-[#DC2626]' : 'text-[#94A3B8]'}`}>⏱ {formatTime(remaining)}</span>
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

          <p className="text-[17px] font-bold text-[#1E293B] leading-relaxed mb-3">
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
                {!hasFullAccess && <span className="text-[12px] leading-none">✨</span>}
                <span>🇺🇸</span>
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
              let style = 'border border-[#E2E8F0] text-[#1E293B] bg-white';
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
        </div>

        {showAnswer && q.answers[q.correctAnswerIndex] && !hideExplanations && (
          <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 mb-5">
            <p className="text-sm text-[#1E40AF] leading-relaxed">
              ✅ {tex.correct}: <strong>{q.answers[q.correctAnswerIndex].replace(/^[A-DА-Га-гa-d]\.\s*/, '')}</strong>
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
                  <span className="text-sm">📖</span>
                  <span>
                    {q.manualSection || (tex.viewInManual || 'Driver Manual')}
                  </span>
                  <span className="text-[10px] opacity-70">{showManualQuote ? '▲' : '▼'}</span>
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
                  🐛 {tex.reportQuestion || 'Report'}
                </button>
              </div>
            )}

            {showReport && !reportSent && (
              <div className="mt-3 p-3 bg-white border border-[#FED7AA] rounded-xl">
                <p className="text-xs font-semibold text-[#9A3412] mb-2">
                  🐛 {tex.reportPrompt || 'What is wrong with this question?'}
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
                  ✅ {tex.reportThanks || 'Thanks! We will check it.'}
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
            🔔 {(tex.nudgeFreeLeft || '{n} questions left in your free test').replace('{n}', freeLimit - current - 1)}  ·  {tex.nudgeUnlockFrom || 'unlock all from'} {plan.price}
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
                  <div className="text-4xl text-center mb-3">📨</div>
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
              <h2 className="text-xl font-bold text-[#0B1C3D] mb-1 text-center">{tex.upgradeModalTitle || `20 done. The actual DMV looks just like this.`}</h2>
              <p className="text-[#2563EB] font-bold text-sm mb-3 text-center">
                {(tex.upgradeScoreSoFar || 'Your score: {score}/20').replace('{score}', String(score)).replace('{percent}', String(Math.round((score / 20) * 100)))}
              </p>

              {/* Body — explains weird questions, links to official handbook */}
              <p className="text-sm text-[#475569] mb-4 text-center leading-relaxed">
                {tex.upgradeModalBody1 || "If a question looks weird, that's how the DMV asks it. We work from your state's "}
                <Link
                  href="/manuals"
                  target="_blank"
                  className="text-[#2563EB] underline hover:text-[#1D4ED8]"
                >
                  {tex.upgradeModalBodyLink || 'official driver handbook'}
                </Link>
                {tex.upgradeModalBody2 || ' — same source as the real test.'}
              </p>

              {/* Highlighted plan card for current category */}
              <div className="flex justify-center mb-4">
                <div className="w-full max-w-[200px] border-2 rounded-xl p-4 text-center flex flex-col"
                  style={{
                    borderColor: isCdl ? '#F59E0B' : isMoto ? '#D97706' : '#2563EB',
                    background: isCdl ? '#FFFBEB' : isMoto ? '#FFF7ED' : '#EFF6FF',
                  }}>
                  {isCdl && <div className="text-[9px] font-bold text-[#0B1C3D] bg-[#F59E0B] rounded-full px-1.5 py-0.5 mb-1 mx-auto w-fit">{tex.planGuaranteedBadge}</div>}
                  {!isCdl && !isMoto && <div className="text-[9px] font-bold text-white bg-[#2563EB] rounded-full px-1.5 py-0.5 mb-1 mx-auto w-fit">{tex.planPopular}</div>}
                  <div className="text-3xl mb-1">{plan.icon}</div>
                  <div className="text-xs font-bold mb-0.5" style={{ color: isCdl ? '#92400E' : isMoto ? '#D97706' : '#2563EB' }}>
                    {isCdl ? tex.planCdlPro : isMoto ? tex.planMotoPass : tex.planAutoPass}
                  </div>
                  <div className="text-2xl font-black text-[#0B1C3D] mb-0.5">{plan.price}</div>
                  <div className="text-[10px] text-[#64748B] mb-3">{tex.planDuration || '30-day access'}</div>
                  <button type="button" onClick={() => router.push(`/upgrade?lang=${lang}&plan=${suggestPlan}`)}
                    className="w-full py-2 rounded-lg text-sm font-bold text-white transition"
                    style={{ background: isCdl ? '#0B1C3D' : isMoto ? '#D97706' : '#2563EB' }}>
                    {tex.getIt || 'Get it'}
                  </button>
                </div>
              </div>

              <p className="text-center text-xs text-[#94A3B8] mb-3">{tex.cancelAnytime}</p>

              <button type="button" onClick={() => {
                const allAnswers = userAnswersRef.current;
                const finalScore = allAnswers.reduce((acc, ans, i) => acc + (ans === questions[i]?.correctAnswerIndex ? 1 : 0), 0);
                sessionStorage.setItem('testResults', JSON.stringify({ questions, userAnswers: allAnswers, elapsed, state, category, lang }));
                router.push(`/result?score=${finalScore}&total=${questions.length}&lang=${lang}`);
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
              sessionStorage.setItem('testResults', JSON.stringify({ questions, userAnswers: allAnswers, elapsed, state, category, lang }));
              router.push(`/result?score=${finalScore}&total=${questions.length}&lang=${lang}`);
            }}
              className="w-full bg-[#2563EB] text-white py-3.5 rounded-xl font-semibold text-base hover:bg-[#1D4ED8] transition-all mb-3">
              {tex.seeResultsBtn}
            </button>
            <button type="button" onClick={() => {
              timeLimitRef.current += 10 * 60;
              setRemaining(r => r + 10 * 60);
              setShowTimeUp(false);
            }}
              className="w-full border border-[#E2E8F0] text-[#1E293B] py-3.5 rounded-xl font-semibold text-base hover:bg-[#F8FAFC] hover:border-[#2563EB] transition-all">
              {tex.addTime}
            </button>
          </div>
        </div>
      )}

      {/* Leave confirmation modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-[#E2E8F0] text-center">
            <p className="text-base font-semibold text-[#1E293B] mb-5">{tex.leaveConfirm}</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 py-3 rounded-xl border border-[#E2E8F0] text-[#1E293B] font-semibold text-sm hover:bg-[#F8FAFC] transition">
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
            <div className="text-5xl mb-3">🌐</div>
            <h3 className="text-xl font-bold text-[#0B1C3D] mb-2">
              {tex.unlockTitle || 'Unlock Full Access'}
            </h3>
            <p className="text-sm text-[#64748B] mb-6">
              {tex.unlockDesc || 'Get all test modes, unlimited practice, and real exam simulation.'}
            </p>
            <button
              type="button"
              onClick={() => router.push(`/upgrade?lang=${lang}&plan=${suggestPlan}`)}
              className="w-full py-3.5 rounded-2xl font-bold text-white text-base mb-3 btn-pulse"
              style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)' }}>
              {tex.unlockCta || `Unlock from ${plan.price} →`}
            </button>
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