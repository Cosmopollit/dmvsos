'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';

function TestContent() {
  const router = useRouter();
  const params = useSearchParams();
  const state = params.get('state') || 'washington';
  const category = params.get('category') || 'car';
  const lang = params.get('lang') || 'en';
  const langFolder = lang === 'zh' ? 'cn' : lang;
  const tex = t[lang] || t.en;

  const [user, setUser] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [userAnswers, setUserAnswers] = useState([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/data/${langFolder}/${state}.json`)
      .then(r => r.json())
      .then(d => {
        const categoryMap = { dmv: 'car', cdl: 'cdl', moto: 'motorcycle' };
        const mappedCategory = categoryMap[category] || category;
        const test = d[mappedCategory]?.[0];
        if (test) {
          const all = test.questions;
          setQuestions(user ? all : all.slice(0, 20));
        }
        setLoading(false);
      });
  }, [state, category, user, lang]);

  if (loading) return (
    <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">⏳</div>
        <p className="text-[#94A3B8]">Loading questions...</p>
      </div>
    </main>
  );

  if (!questions.length) return (
    <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
      <p className="text-[#94A3B8]">No questions found.</p>
    </main>
  );

  const q = questions[current];
  const total = questions.length;
  const progress = (current / total) * 100;

  function handleSelect(index) {
    if (showAnswer) return;
    setSelected(index);
    setShowAnswer(true);
    if (index === q.correctAnswerIndex) setScore(s => s + 1);
  }

  function handleNext() {
    if (!user && current === 19) {
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
      sessionStorage.setItem(
        'testResults',
        JSON.stringify({ questions, userAnswers: finalUserAnswers })
      );
      router.push(`/result?score=${finalScore}&total=${total}`);
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
          <button type="button" onClick={() => router.push('/category')}
            className="text-sm text-[#94A3B8] hover:text-[#2563EB] transition">
            {tex.back}
          </button>
          <span className="text-sm font-medium text-[#94A3B8]">{current + 1} / {total}</span>
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
                  {opt.replace(/^[A-D]\.\s*/, '')}
                </button>
              );
            })}
          </div>
        </div>

        {showAnswer && (
          <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 mb-5">
            <p className="text-sm text-[#1E40AF] leading-relaxed">
              ✅ {tex.correct}: <strong>{q.answers[q.correctAnswerIndex]}</strong>
            </p>
          </div>
        )}

        {showAnswer && !(showUpgradeBanner && !user && current === 19) && (
          <button type="button" onClick={handleNext}
            className="w-full bg-[#2563EB] text-white py-3.5 rounded-xl font-semibold text-base hover:bg-[#1D4ED8] transition-all">
            {current + 1 < total ? tex.next : tex.seeResults}
          </button>
        )}

      </div>

      {/* Upgrade modal overlay */}
      {showUpgradeBanner && !user && current === 19 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl border border-[#E2E8F0] text-center">
            <h2 className="text-2xl font-bold text-[#0B1C3D] mb-2">{tex.upgradeTitle}</h2>
            <p className="text-[#475569] text-sm leading-relaxed mb-4">
              {tex.upgradeDesc}
            </p>
            <p className="text-[#2563EB] font-semibold text-sm mb-5">99% pass rate after full preparation</p>
            <ul className="text-left text-sm text-[#475569] space-y-2 mb-6">
              <li>✅ All 40 questions per test</li>
              <li>✅ All 50 states, 3 categories, 4 languages</li>
            </ul>
            <button type="button" onClick={() => router.push('/upgrade')}
              className="w-full bg-[#F59E0B] text-[#0B1C3D] py-4 rounded-xl font-bold text-base hover:bg-[#FBBF24] hover:-translate-y-0.5 hover:shadow-lg transition-all mb-3">
              {tex.upgradeCta}
            </button>
            <button onClick={handleGoogleSignIn}
              className="text-sm text-[#2563EB] hover:underline">
              Continue with Google to sign in
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