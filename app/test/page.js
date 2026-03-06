'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';

function TestContent() {
  const router = useRouter();
  const params = useSearchParams();
  const state = params.get('state') || 'washington';
  const category = params.get('category') || 'car';
  const lang = params.get('lang') || getSavedLang();
  const isRetry = params.get('retry') === 'true';
  const tex = t[lang] || t.en;

  const { isPro, hasMoto, hasCdl, loading: authLoading } = useAuth();

  // Category-aware access: moto requires hasMoto, cdl requires hasCdl, car/dmv requires any isPro
  const hasFullAccess = ['moto', 'motorcycle'].includes(category) ? hasMoto
    : category === 'cdl' ? hasCdl
    : isPro;

  // Upgrade plan to suggest based on current category
  const suggestPlan = ['moto', 'motorcycle'].includes(category) ? 'moto_pass'
    : category === 'cdl' ? 'cdl_pass'
    : 'moto_pass'; // car → suggest moto_pass (cheapest, includes car)
  const [allQuestions, setAllQuestions] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [testMode, setTestMode] = useState(null); // null = not started, 'free' | 'real' | 'extended' | 'marathon'
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [userAnswers, setUserAnswers] = useState([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState(0);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  const [motivationalMessage, setMotivationalMessage] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showTimeUp, setShowTimeUp] = useState(false);
  const [hideExplanations, setHideExplanations] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockAnimKey, setLockAnimKey] = useState({});
  const startTimeRef = useRef(null);
  const timeLimitRef = useRef(0);

  // Time limits per category (in seconds)  ·  real exam simulation
  const categoryTimeLimit = { dmv: 60 * 60, car: 60 * 60, cdl: 60 * 60, moto: 60 * 60, motorcycle: 60 * 60 };
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
  }, [testMode, hasTimer]);

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
    const categoryMap = { dmv: 'car', cdl: 'cdl', moto: 'motorcycle' };
    const mappedCategory = categoryMap[category] || category;
    supabase
      .from('questions')
      .select('*')
      .eq('state', state)
      .eq('category', mappedCategory)
      .eq('language', lang)
      .then(({ data, error }) => {
        if (error || !data?.length) {
          setAllQuestions([]);
          setLoadingQuestions(false);
          return;
        }
        const strip = s => (s || '').replace(/^[A-DА-Га-гa-d]\.\s*/, '').trim();
        const mapped = data.map(row => {
          const answers = [row.option_a, row.option_b, row.option_c, row.option_d].filter(Boolean).map(strip);
          return {
            question: row.question_text || '',
            answers,
            correctAnswerIndex: row.correct_answer ?? 0,
            imageUrl: row.image_url || null,
            explanation: row.explanation || null,
            manualSection: row.manual_section || null,
            manualReference: row.manual_reference || null,
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
  }, [state, category, lang, isRetry]);

  function startWithMode(mode) {
    const realLimits = { dmv: 40, car: 40, cdl: 50, moto: 30, motorcycle: 30 };
    const limits = { free: 20, real: realLimits[category] || 40, extended: 80, marathon: Infinity };
    const limit = limits[mode] ?? 40;
    setQuestions(allQuestions.slice(0, Math.min(limit, allQuestions.length)));
    setCurrent(0);
    setScore(0);
    setUserAnswers([]);
    userAnswersRef.current = [];
    setSelected(null);
    setShowAnswer(false);
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
  }, [testMode, questions.length, showAnswer, current, showUpgradeBanner]);

  function handleBack() {
    if (hasFullAccess && testMode && testMode !== 'free') {
      setTestMode(null);
      setQuestions([]);
      setCurrent(0);
      setScore(0);
      setUserAnswers([]);
      userAnswersRef.current = [];
      setSelected(null);
      setShowAnswer(false);
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
      setShowAnswer(false);
    }
  }
  handlePrevRef.current = handlePrev;

  // Set translated page title
  useEffect(() => {
    if (tex.practiceTestTitle) document.title = tex.practiceTestTitle;
  }, [tex.practiceTestTitle]);

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
    const realCount = Math.min(({ dmv: 40, car: 40, cdl: 50, moto: 30, motorcycle: 30 })[category] || 40, totalAvailable);
    const modes = [
      ...(!hasFullAccess ? [{
        id: 'free',
        icon: '✏️',
        label: tex.modePractice || 'Quick Practice',
        desc: tex.modePracticeDesc || '20 questions  ·  always free',
        count: Math.min(20, totalAvailable),
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
      {
        id: 'extended',
        icon: '📚',
        label: tex.modeExtended,
        desc: tex.modeExtendedDesc,
        count: Math.min(80, totalAvailable),
        color: '#7C3AED',
        gradient: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)',
        locked: !hasFullAccess,
      },
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
          <a href="/" className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition">
            <Image src="/logo.png" alt="DMVSOS" width={28} height={28} className="rounded-lg" />
            <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
          </a>
          <div className="w-16" />
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
                      Guaranteed Pass · 99%
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
                {tex.unlockCta || 'Unlock from $9.99 →'}
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

  if (!questions.length) return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">📭</div>
        <h2 className="text-lg font-bold text-[#0B1C3D] mb-2">{tex.noQuestionsFound}</h2>
        <button type="button" onClick={() => router.push(`/category?state=${state}&lang=${lang}`)}
          className="mt-4 bg-[#2563EB] text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#1D4ED8] transition">
          {tex.back}
        </button>
      </div>
    </main>
  );

  const q = questions[current];
  if (!q || !q.answers?.length) return null;
  const total = questions.length;
  const answered = userAnswersRef.current.length;
  const progress = (answered / total) * 100;
  const correctCount = score;
  const wrongCount = answered - correctCount;

  function handleSelect(index) {
    if (showAnswer) return;
    setSelected(index);
    setShowAnswer(true);
    const correct = index === q.correctAnswerIndex;
    if (correct) setScore(s => s + 1);
    // Track answers both in state and ref (ref is synchronous, avoids race condition)
    const updatedAnswers = [...userAnswersRef.current, index];
    userAnswersRef.current = updatedAnswers;
    setUserAnswers(updatedAnswers);
    const arr = correct ? tex.motivationalCorrect : tex.motivationalWrong;
    const msg = arr[Math.floor(Math.random() * arr.length)];
    setMotivationalMessage({ text: msg, phase: 'show' });
  }

  handleSelectRef.current = handleSelect;

  async function handleNext() {
    if (!hasFullAccess && total === 20 && current === 19) {
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
        setShowAnswer(false);
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
          <a href="/" className="flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition">
            <Image src="/logo.png" alt="DMVSOS" width={24} height={24} className="rounded-md" />
            <span className="text-sm font-bold text-[#0B1C3D]">DMVSOS</span>
          </a>
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

          <p className="text-[17px] font-bold text-[#1E293B] leading-relaxed mb-6">
            {(q.question || '').replace(/^\d+\.\s*/, '')}
          </p>

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
              return (
                <button key={i} type="button" onClick={() => handleSelect(i)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl text-sm transition-all ${style} ${!showAnswer ? 'hover:border-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#2563EB]' : ''}`}>
                  <span className="font-semibold mr-3 text-[#0B1C3D]">{['A', 'B', 'C', 'D'][i]}.</span>
                  {opt.replace(/^[A-DА-Га-гa-d]\.\s*/, '')}
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
          </div>
        )}

        {motivationalMessage && !hideExplanations && (
          <p className={`text-center text-base font-semibold mb-4 transition-opacity duration-300 ${motivationalMessage.phase === 'fade' ? 'opacity-0' : 'opacity-100'}`}>
            {motivationalMessage.text}
          </p>
        )}

        {/* Q18 pre-paywall nudge */}
        {!hasFullAccess && current === 17 && showAnswer && (
          <div className="bg-[#FFF7ED] border border-[#FED7AA] rounded-xl px-4 py-3 mb-4 text-sm text-[#92400E] font-medium text-center">
            🔔 2 questions left in your free test  ·  unlock all from $9.99
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

      {/* Upgrade modal overlay */}
      {showUpgradeBanner && !hasFullAccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-[#E2E8F0] overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-[#F59E0B] via-[#FB923C] to-[#F59E0B]" />
            <div className="p-6">
              <h2 className="text-xl font-bold text-[#0B1C3D] mb-1 text-center">{tex.upgradeModalTitle || "You've used all 20 free questions"}</h2>
              <p className="text-[#2563EB] font-bold text-sm mb-4 text-center">
                {(tex.upgradeScoreSoFar || 'Your score: {score}/20').replace('{score}', String(score)).replace('{percent}', String(Math.round((score / 20) * 100)))}
              </p>

              {/* 2 compact category plan cards */}
              <div className="flex gap-2 mb-4">
                {/* Moto Pass */}
                <div className="flex-1 border-2 border-[#2563EB] rounded-xl p-3 text-center flex flex-col bg-[#EFF6FF]">
                  <div className="text-xl mb-0.5">🏍️</div>
                  <div className="text-xs font-bold text-[#2563EB] mb-0.5">Moto Pass</div>
                  <div className="text-lg font-black text-[#0B1C3D] mb-0.5">$9.99</div>
                  <div className="text-[10px] text-[#64748B] mb-2">Moto + Car · 30 days</div>
                  <button type="button" onClick={() => router.push(`/upgrade?lang=${lang}&plan=moto_pass`)}
                    className="mt-auto w-full py-1.5 rounded-lg text-xs font-bold bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition">
                    Get it
                  </button>
                </div>
                {/* CDL Pro */}
                <div className="flex-1 border-2 border-[#F59E0B] rounded-xl p-3 text-center flex flex-col">
                  <div className="text-xl mb-0.5">🚛</div>
                  <div className="text-xs font-bold text-[#92400E] mb-0.5">CDL Pro</div>
                  <div className="text-lg font-black text-[#0B1C3D] mb-0.5">$19.99</div>
                  <div className="text-[10px] text-[#64748B] mb-2">CDL + Car · 30 days</div>
                  <button type="button" onClick={() => router.push(`/upgrade?lang=${lang}&plan=cdl_pass`)}
                    className="mt-auto w-full py-1.5 rounded-lg text-xs font-semibold bg-[#F59E0B] text-[#0B1C3D] hover:bg-[#FBBF24] transition">
                    Get it
                  </button>
                </div>
              </div>

              <p className="text-center text-xs text-[#94A3B8] mb-3">One payment · 30 days access · No auto-renewal</p>

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