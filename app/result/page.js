'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
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

  const { user } = useAuth();

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

  const [email, setEmail] = useState('');
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  async function handleSaveResults(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setEmailLoading(true);
    await supabase.auth.signInWithOtp({ email: email.trim() });
    setEmailLoading(false);
    setEmailSubmitted(true);
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

        {/* Email capture for guests */}
        {!user && (
          <div className="bg-white rounded-2xl p-6 w-full shadow-sm border border-[#E2E8F0]">
            <h3 className="text-lg font-bold text-[#0B1C3D] mb-1">💾 {tex.saveResults}</h3>
            <p className="text-sm text-[#94A3B8] mb-4">{tex.saveSubtext}</p>
            {emailSubmitted ? (
              <p className="text-[#16A34A] font-medium text-sm">{tex.checkEmail}</p>
            ) : (
              <form onSubmit={handleSaveResults} className="flex flex-col gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                  required
                  disabled={emailLoading}
                />
                <button
                  type="submit"
                  disabled={emailLoading}
                  className="w-full bg-[#2563EB] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#1D4ED8] transition disabled:opacity-60"
                >
                  {emailLoading ? '…' : tex.saveBtn}
                </button>
              </form>
            )}
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
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Upgrade banner */}
        <div className="bg-[#0B1C3D] rounded-2xl p-6 w-full border border-[#1e3a5f] shadow-sm">
          <p className="text-white font-semibold text-base mb-1">{tex.upgradeModalTitle}</p>
          <p className="text-[#94A3B8] text-sm mb-4">{tex.upgradeBannerDesc}</p>
          <button
            type="button"
            onClick={() => router.push(`/upgrade?lang=${lang}`)}
            className="w-full bg-[#F59E0B] text-[#0B1C3D] py-3 rounded-xl font-semibold text-sm hover:bg-[#FBBF24] transition-all"
          >
            {tex.upgradeCta}
          </button>
        </div>

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
