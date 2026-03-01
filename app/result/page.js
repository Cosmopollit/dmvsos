'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import Image from 'next/image';
import { t } from '@/lib/translations';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { getSavedLang } from '@/lib/lang';

function ResultContent() {
  const router = useRouter();
  const params = useSearchParams();
  const score = parseInt(params.get('score') || 0, 10);
  const total = Math.max(1, parseInt(params.get('total') || 3, 10));
  const percent = Math.round((score / total) * 100);
  const passed = total > 0 && score / total >= 0.7;

  const { user, isPro } = useAuth();

  const [testResults, setTestResults] = useState(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('testResults');
      setTestResults(raw ? JSON.parse(raw) : null);
    } catch {
      setTestResults(null);
    }
  }, []);

  const questions = testResults?.questions ?? [];
  const userAnswers = testResults?.userAnswers ?? [];
  const elapsed = testResults?.elapsed ?? 0;
  const state = testResults?.state ?? 'washington';
  const category = testResults?.category ?? 'car';
  const lang = testResults?.lang ?? getSavedLang();
  const wrongQuestions = questions.filter((q, i) => userAnswers[i] !== q.correctAnswerIndex);
  const tex = t[lang] || t.en;
  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
  }

  function stripQuestion(s) {
    return (s || '').replace(/^\d+\.\s*/, '');
  }
  function stripAnswer(s) {
    return (s || '').replace(/^[A-DА-Га-гa-d]\.\s*/, '');
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center p-6">
      <div className="w-full max-w-lg flex flex-col items-center gap-5">
        {/* Header with nav */}
        <div className="w-full flex items-center justify-between">
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

        {/* Result card */}
        <div className="bg-white rounded-2xl p-8 w-full shadow-sm border border-[#E2E8F0] text-center">
          <div className="text-5xl mb-4">{passed ? '🎉' : '😓'}</div>
          <div
            className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold mb-4 ${
              passed ? 'bg-[#F0FDF4] text-[#16A34A]' : 'bg-[#FEF2F2] text-[#DC2626]'
            }`}
          >
            {passed ? tex.passed : tex.notPassed}
          </div>
          <div className="text-5xl font-bold text-[#0B1C3D] mb-1">{percent}%</div>
          <p className="text-[#94A3B8] text-sm mb-2">
            {(tex.resultText || 'You answered {score} out of {total} correctly').replace(/\{score\}/g, String(score)).replace(/\{total\}/g, String(total))}
          </p>
          {elapsed > 0 && (
            <p className="text-[#94A3B8] text-sm mb-6">{tex.completedIn} {formatTime(elapsed)}</p>
          )}
          {elapsed === 0 && <div className="mb-6" />}
          <div className="w-full h-1.5 bg-[#E2E8F0] rounded-full mb-6">
            <div
              className={`h-1.5 rounded-full transition-all duration-700 ${
                passed ? 'bg-[#16A34A]' : 'bg-[#DC2626]'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Sign in to save results */}
        {!user && (
          <div className="bg-white rounded-2xl p-6 w-full shadow-sm border border-[#E2E8F0] text-center">
            <h3 className="text-lg font-bold text-[#0B1C3D] mb-1">💾 {tex.saveResults}</h3>
            <p className="text-sm text-[#94A3B8] mb-4">{tex.saveSubtext}</p>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full bg-white text-[#1E293B] border border-[#E2E8F0] py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-3 hover:bg-[#F8FAFC] hover:border-[#2563EB] transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/><path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/><path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/></svg>
              {tex.continueGoogle}
            </button>
          </div>
        )}

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
                        <img src={q.imageUrl} alt="" className="h-20 rounded-lg border border-[#E2E8F0] object-contain" />
                      </div>
                    )}
                    <div className="flex gap-2 items-start">
                      <span className="text-lg shrink-0">{correct ? '✅' : '❌'}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#1E293B]">
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
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Upgrade banner — hidden for Pro users */}
        {!isPro && <div className="bg-[#0B1C3D] rounded-2xl p-6 w-full border border-[#1e3a5f] shadow-sm">
          <p className="text-white font-semibold text-base mb-1">{tex.upgradeModalTitle}</p>
          <p className="text-[#94A3B8] text-sm mb-4">{tex.upgradeBannerDesc}</p>
          <button
            type="button"
            onClick={() => router.push(`/upgrade?lang=${lang}`)}
            className="w-full bg-[#F59E0B] text-[#0B1C3D] py-3 rounded-xl font-semibold text-sm hover:bg-[#FBBF24] transition-all"
          >
            {tex.upgradeCta}
          </button>
        </div>}

        {/* Buttons */}
        <button
          type="button"
          onClick={() => router.push(`/category?state=${state}&lang=${lang}`)}
          className="w-full bg-[#2563EB] text-white py-3.5 rounded-xl font-semibold text-base hover:bg-[#1D4ED8] transition-all"
        >
          {tex.tryAgain}
        </button>
        {wrongQuestions.length > 0 && (
          <button
            type="button"
            onClick={() => {
              sessionStorage.setItem('retryQuestions', JSON.stringify(wrongQuestions));
              router.push(`/test?state=${state}&category=${category}&lang=${lang}&retry=true`);
            }}
            className="w-full bg-white border border-[#E2E8F0] text-[#1E293B] py-3.5 rounded-xl font-semibold text-base hover:border-[#2563EB] hover:text-[#2563EB] hover:bg-[#F8FAFC] transition-all"
          >
            {tex.retryWrong} ({wrongQuestions.length})
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push('/')}
          className="w-full bg-white border border-[#E2E8F0] text-[#1E293B] py-3.5 rounded-xl font-semibold text-base hover:border-[#2563EB] hover:text-[#2563EB] hover:bg-[#F8FAFC] transition-all"
        >
          {tex.home}
        </button>

        {/* Manual link */}
        <a
          href={`/manuals/${state}`}
          className="block w-full text-center text-sm text-[#2563EB] hover:underline font-medium py-2"
        >
          {tex.studyManual || 'Study the driver manual'} →
        </a>
      </div>
    </main>
  );
}

export default function Result() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#94A3B8] border-t-transparent rounded-full animate-spin" /></main>}>
      <ResultContent />
    </Suspense>
  );
}
