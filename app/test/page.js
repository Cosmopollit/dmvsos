'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';

function TestContent() {
  const router = useRouter();
  const params = useSearchParams();
  const state = params.get('state') || 'washington';
  const category = params.get('category') || 'car';
  const lang = params.get('lang') || getSavedLang();
  const tex = t[lang] || t.en;

  const [isPro, setIsPro] = useState(null); // null = loading, true/false = resolved
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

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  useEffect(() => {
    if (!testMode || testMode === null) return;
    const interval = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(interval);
  }, [testMode]);

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

  // Auth check — runs once
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null;
      if (!u?.email) {
        setIsPro(false);
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_pro')
        .eq('email', u.email)
        .single();
      setIsPro(profile?.is_pro ?? false);
    });
  }, []);

  // Load questions — does NOT depend on isPro
  useEffect(() => {
    const isRetry = params.get('retry') === 'true';
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
        const mapped = data.map(row => ({
          question: row.question_text,
          answers: [row.option_a, row.option_b, row.option_c, row.option_d].filter(Boolean).map(strip),
          correctAnswerIndex: row.correct_answer,
          imageUrl: null,
        }));
        setAllQuestions(mapped.sort(() => Math.random() - 0.5));
        setLoadingQuestions(false);
      });
  }, [state, category, lang]);

  function startWithMode(mode) {
    const limits = { real: 40, extended: 80, marathon: Infinity };
    const limit = limits[mode] || 40;
    setQuestions(allQuestions.slice(0, Math.min(limit, allQuestions.length)));
    setCurrent(0);
    setScore(0);
    setUserAnswers([]);
    setSelected(null);
    setShowAnswer(false);
    setElapsed(0);
    setTestMode(mode);
  }

  // Wait for both auth and questions to load
  const loading = loadingQuestions || isPro === null;

  if (loading) return (
    <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">⏳</div>
        <p className="text-[#94A3B8]">Loading questions...</p>
      </div>
    </main>
  );

  // Free user: auto-start with 20 questions
  useEffect(() => {
    if (!isPro && isPro !== null && !testMode && allQuestions.length) {
      setQuestions(allQuestions.slice(0, 20));
      setTestMode('free');
    }
  }, [isPro, testMode, allQuestions]);

  if (!isPro && !testMode && allQuestions.length) {
    return (
      <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-[#94A3B8]">Loading questions...</p>
        </div>
      </main>
    );
  }

  // Pro user: show mode selector
  if (isPro && !testMode && allQuestions.length) {
    const totalAvailable = allQuestions.length;
    const modes = [
      { id: 'real', icon: '🎯', label: tex.modeReal, desc: tex.modeRealDesc, count: Math.min(40, totalAvailable), color: '#2563EB', gradient: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)' },
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
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/70" style={{ color: m.color }}>
                  {m.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!questions.length) return (
    <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
      <p className="text-[#94A3B8]">No questions found.</p>
    </main>
  );

  const q = questions[current];
  if (!q) return null;
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
    const arr = correct ? tex.motivationalCorrect : tex.motivationalWrong;
    const msg = arr[Math.floor(Math.random() * arr.length)];
    setMotivationalMessage({ text: msg, phase: 'show' });
  }

  async function handleNext() {
    if (!isPro && total === 20 && current === 19) {
      setShowUpgradeBanner(true);
      return;
    }
    if (current + 1 < total) {
      setUserAnswers((prev) => [...prev, selected]);
      setCurrent((c) => c + 1);
      setSelected(null);
      setShowAnswer(false);
    } else {
      const finalScore = score + (selected === q.correctAnswerIndex ? 1 : 0);
      const finalUserAnswers = [...userAnswers, selected];
      const langParam = new URLSearchParams(window.location.search).get('lang') || 'en';
      sessionStorage.setItem(
        'testResults',
        JSON.stringify({ questions, userAnswers: finalUserAnswers, elapsed, state, category, lang: langParam })
      );
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await supabase.from('test_sessions').insert({
          user_id: session.user.id,
          state,
          category,
          score: finalScore,
          total,
        });
      }
      router.push(`/result?score=${finalScore}&total=${total}&lang=${lang}`);
    }
  }

  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${window.location.pathname}?${window.location.search}`
      }
    });
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => router.push(`/category?state=${state}&lang=${lang}`)}
              className="text-sm text-[#94A3B8] hover:text-[#2563EB] transition">
              {tex.back}
            </button>
            <button type="button" onClick={() => { if (window.confirm(tex.leaveConfirm)) router.push('/'); }}
              className="text-[#94A3B8] hover:text-[#2563EB] transition p-0.5"
              title="Home"
              aria-label="Home">
              🏠
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#16A34A]">✅ {correctCount}</span>
            <span className="text-sm text-[#DC2626]">❌ {wrongCount}</span>
            <span className="text-sm text-[#94A3B8]">⏱ {formatTime(elapsed)}</span>
            <span className="text-sm font-medium text-[#94A3B8]">{current + 1} / {total}</span>
          </div>
        </div>

        <div className="w-full h-1.5 bg-[#E2E8F0] rounded-full mb-6">
          <div className="h-1.5 bg-[#2563EB] rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }} />
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-sm border border-[#E2E8F0] mb-5">

          {q.imageUrl && (
            <img src={q.imageUrl} alt="Question"
              className="w-full rounded-xl mb-5 border border-[#E2E8F0]" />
          )}

          <p className="text-[17px] font-bold text-[#1E293B] leading-relaxed mb-6">
            {(q.question || '').replace(/^\d+\.\s*/, '')}
          </p>

          <div className="flex flex-col gap-2.5">
            {q.answers.map((opt, i) => {
              let style = 'border border-[#E2E8F0] text-[#1E293B] bg-white';
              if (showAnswer) {
                if (i === q.correctAnswerIndex) style = 'border border-[#16A34A] bg-[#F0FDF4] text-[#16A34A] font-semibold';
                else if (i === selected) style = 'border border-[#DC2626] bg-[#FEF2F2] text-[#DC2626]';
                else style = 'border border-[#E2E8F0] text-[#94A3B8] bg-white opacity-60';
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

        {showAnswer && (
          <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 mb-5">
            <p className="text-sm text-[#1E40AF] leading-relaxed">
              ✅ {tex.correct}: <strong>{q.answers[q.correctAnswerIndex].replace(/^[A-DА-Га-гa-d]\.\s*/, '')}</strong>
            </p>
          </div>
        )}

        {motivationalMessage && (
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
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl border border-[#E2E8F0] text-center">
            <h2 className="text-2xl font-bold text-[#0B1C3D] mb-2">{tex.upgradeTitle}</h2>
            <p className="text-[#475569] text-sm leading-relaxed mb-4">
              {tex.upgradeDesc}
            </p>
            <p className="text-[#2563EB] font-semibold text-sm mb-5">{tex.upgradePassRate || '99% pass rate after full preparation'}</p>
            <ul className="text-left text-sm text-[#475569] space-y-2 mb-6">
              <li>{tex.upgradeFeature1 || '✅ All 40 questions per test'}</li>
              <li>{tex.upgradeFeature2 || '✅ All 50 states, 3 categories, 4 languages'}</li>
            </ul>
            <button type="button" onClick={() => router.push(`/upgrade?lang=${lang}`)}
              className="w-full bg-[#F59E0B] text-[#0B1C3D] py-4 rounded-xl font-bold text-base hover:bg-[#FBBF24] hover:-translate-y-0.5 hover:shadow-lg transition-all mb-3">
              {tex.upgradeCta}
            </button>
            <button onClick={handleGoogleSignIn}
              className="text-sm text-[#2563EB] hover:underline">
              {tex.continueGoogle}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function Test() {
  return (
    <Suspense>
      <TestContent />
    </Suspense>
  );
}