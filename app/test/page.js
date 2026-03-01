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

  const { isPro, loading: authLoading } = useAuth();
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
  const startTimeRef = useRef(null);
  const timeLimitRef = useRef(0);

  // Time limits per category (in seconds)
  const categoryTimeLimit = { dmv: 25 * 60, car: 25 * 60, cdl: 35 * 60, moto: 20 * 60, motorcycle: 20 * 60 };
  const initialTime = categoryTimeLimit[category] || 25 * 60;

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

  // Load questions — does NOT depend on isPro
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
    const limits = { real: 40, extended: 80, marathon: Infinity };
    const limit = limits[mode] || 40;
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

  // Free user: auto-start with 20 questions
  useEffect(() => {
    if (!isPro && !authLoading && !testMode && allQuestions.length) {
      setQuestions(allQuestions.slice(0, 20));
      setTestMode('free');
    }
  }, [isPro, authLoading, testMode, allQuestions]);

  // Keyboard shortcuts: 1-4 to select answer, Enter/Space to advance
  // Must be before early returns to satisfy Rules of Hooks
  // Refs for keyboard shortcuts (must be before early returns for Rules of Hooks)
  const handleSelectRef = useRef(null);
  const handleNextRef = useRef(null);
  // Ref for synchronous answer tracking (avoids React state batching race condition)
  const userAnswersRef = useRef([]);
  useEffect(() => {
    if (!testMode || !questions.length) return;
    function onKeyDown(e) {
      if (showUpgradeBanner) return;
      const key = e.key;
      if (!showAnswer && ['1', '2', '3', '4'].includes(key)) {
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

  if (!isPro && !testMode && allQuestions.length) {
    return (
      <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 hourglass-spin">⏳</div>
          <p className="text-[#94A3B8]">{tex.loadingQuestions}</p>
        </div>
      </main>
    );
  }

  // Pro user: show mode selector
  if (isPro && !testMode && allQuestions.length) {
    const totalAvailable = allQuestions.length;
    const modes = [
      { id: 'real', icon: '🎯', label: tex.modeReal, desc: tex.modeRealDesc, count: Math.min(40, totalAvailable), color: '#2563EB', gradient: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)', time: `⏱ ${Math.floor(initialTime / 60)} ${tex.minLabel}` },
      { id: 'extended', icon: '📚', label: tex.modeExtended, desc: tex.modeExtendedDesc, count: Math.min(80, totalAvailable), color: '#7C3AED', gradient: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)' },
      { id: 'marathon', icon: '🏆', label: tex.modeMarathon, desc: tex.modeMarathonDesc, count: totalAvailable, color: '#D97706', gradient: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)' },
    ];
    return (
      <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 relative">
        <button type="button" onClick={() => router.push(`/category?state=${state}&lang=${lang}`)}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl">
          ✕
        </button>
        <div className="w-full max-w-md">
          <button type="button" onClick={() => router.push(`/category?state=${state}&lang=${lang}`)}
            className="text-sm text-[#94A3B8] hover:text-[#2563EB] transition mb-6">
            {tex.back}
          </button>
          <h2 className="text-xl font-bold text-[#1E293B] mb-2">{tex.chooseMode}</h2>
          <p className="text-sm text-[#94A3B8] mb-6">{totalAvailable} {tex.modeQuestions}</p>
          <div className="flex flex-col gap-3">
            {modes.map(m => (
              <button key={m.id} type="button" onClick={() => startWithMode(m.id)}
                className="rounded-2xl p-5 flex items-center gap-4 hover:shadow-lg transition-all text-left border-2 border-white/60 shadow-md"
                style={{ background: m.gradient }}>
                <span className="text-3xl">{m.icon}</span>
                <div className="flex-1">
                  <div className="font-bold text-[#1E293B]">{m.label}</div>
                  <div className="text-sm text-[#64748B] mt-0.5">{m.desc}</div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/70" style={{ color: m.color }}>
                    {m.count}
                  </span>
                  {m.time && (
                    <span className="text-[10px] font-medium text-[#94A3B8]">
                      {m.time}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Real exam mode toggle */}
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
        </div>
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
  const progress = (current / total) * 100;
  const answered = showAnswer ? current + 1 : current;
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
    if (!isPro && total === 20 && current === 19) {
      setShowUpgradeBanner(true);
      return;
    }
    if (current + 1 < total) {
      setCurrent((c) => c + 1);
      setSelected(null);
      setShowAnswer(false);
    } else {
      // Use ref for answers — guaranteed to include the last answer (no batching race)
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
          <button type="button" onClick={() => router.push(`/category?state=${state}&lang=${lang}`)}
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

        {showAnswer && !showUpgradeBanner && (
          <button type="button" onClick={handleNext}
            className="w-full bg-[#2563EB] text-white py-3.5 rounded-xl font-semibold text-base hover:bg-[#1D4ED8] transition-all">
            {current + 1 < total ? tex.next : tex.seeResults}
          </button>
        )}

      </div>

      {/* Upgrade modal overlay */}
      {showUpgradeBanner && !isPro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-[#E2E8F0] overflow-hidden text-center">
            {/* Gradient accent bar */}
            <div className="h-1.5 bg-gradient-to-r from-[#F59E0B] via-[#FB923C] to-[#F59E0B]" />
            <div className="p-8">
              <div className="text-4xl mb-3">👑</div>
              <h2 className="text-2xl font-bold text-[#0B1C3D] mb-2">{tex.upgradeTitle}</h2>
              <p className="text-[#475569] text-sm leading-relaxed mb-3">
                {tex.upgradeDesc}
              </p>
              {/* Current score */}
              <p className="text-[#2563EB] font-bold text-base mb-5">
                {(tex.upgradeScoreSoFar || 'Your score: {score}/20').replace('{score}', String(score))}
              </p>
              <ul className="text-left text-sm text-[#475569] space-y-2.5 mb-6">
                <li className="flex items-start gap-2"><span className="shrink-0">✅</span><span>{(tex.upgradeFeature1 || '✅ All 40 questions per test').replace(/^✅\s*/, '')}</span></li>
                <li className="flex items-start gap-2"><span className="shrink-0">✅</span><span>{(tex.upgradeFeature2 || '✅ All 50 states, 3 categories, 5 languages').replace(/^✅\s*/, '')}</span></li>
                <li className="flex items-start gap-2"><span className="shrink-0">✅</span><span>{(tex.upgradeFeature3 || '✅ Detailed explanations for every question').replace(/^✅\s*/, '')}</span></li>
              </ul>
              {/* Money-back guarantee badge */}
              <div className="flex items-center justify-center gap-1.5 mb-5">
                <span className="text-xs font-medium text-[#16A34A] bg-[#F0FDF4] px-3 py-1 rounded-full border border-[#BBF7D0]">
                  🛡️ {tex.guaranteeBadge || '30-day money-back guarantee'}
                </span>
              </div>
              <button type="button" onClick={() => router.push(`/upgrade?lang=${lang}`)}
                className="w-full bg-[#F59E0B] text-[#0B1C3D] py-4 rounded-xl font-bold text-base hover:bg-[#FBBF24] hover:-translate-y-0.5 hover:shadow-lg transition-all mb-3 animate-pulse">
                {tex.upgradeCta}
              </button>
              <button type="button" onClick={() => {
                const allAnswers = userAnswersRef.current;
                const finalScore = allAnswers.reduce((acc, ans, i) => acc + (ans === questions[i]?.correctAnswerIndex ? 1 : 0), 0);
                sessionStorage.setItem('testResults', JSON.stringify({ questions, userAnswers: allAnswers, elapsed, state, category, lang }));
                router.push(`/result?score=${finalScore}&total=${questions.length}&lang=${lang}`);
              }}
                className="text-sm text-[#94A3B8] hover:text-[#64748B] transition">
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