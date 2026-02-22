'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';

function ResultContent() {
  const router = useRouter();
  const params = useSearchParams();
  const score = parseInt(params.get('score') || 0, 10);
  const total = Math.max(1, parseInt(params.get('total') || 3, 10));
  const percent = Math.round((score / total) * 100);
  const passed = total > 0 && score / total >= 0.7;

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

  function stripQuestion(s) {
    return (s || '').replace(/^\d+\.\s*/, '');
  }
  function stripAnswer(s) {
    return (s || '').replace(/^[A-D]\.\s*/, '');
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
            {passed ? 'PASSED' : 'NOT PASSED'}
          </div>
          <div className="text-5xl font-bold text-[#0B1C3D] mb-1">{percent}%</div>
          <p className="text-[#94A3B8] text-sm mb-6">
            You answered {score} out of {total} questions correctly
          </p>
          <div className="w-full h-1.5 bg-[#E2E8F0] rounded-full mb-6">
            <div
              className={`h-1.5 rounded-full transition-all duration-700 ${
                passed ? 'bg-[#16A34A]' : 'bg-[#DC2626]'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Question-by-question review */}
        {questions.length > 0 && (
          <div className="bg-white rounded-2xl p-6 w-full shadow-sm border border-[#E2E8F0]">
            <h2 className="text-lg font-bold text-[#0B1C3D] mb-4">Question review</h2>
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
                            Correct: <strong>{stripAnswer(correctText)}</strong>
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
          <p className="text-white font-semibold text-base mb-1">Want more questions? Upgrade to Pro</p>
          <p className="text-[#94A3B8] text-sm mb-4">Get access to all 50 states, all categories, 4 languages</p>
          <button
            type="button"
            onClick={() => router.push('/upgrade')}
            className="w-full bg-[#F59E0B] text-[#0B1C3D] py-3 rounded-xl font-semibold text-sm hover:bg-[#FBBF24] transition-all"
          >
            Upgrade $39/mo
          </button>
        </div>

        {/* Buttons */}
        <button
          type="button"
          onClick={() => router.push('/category')}
          className="w-full bg-[#2563EB] text-white py-3.5 rounded-xl font-semibold text-base hover:bg-[#1D4ED8] transition-all"
        >
          🔄 Try Again
        </button>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="w-full bg-white border border-[#E2E8F0] text-[#1E293B] py-3.5 rounded-xl font-semibold text-base hover:border-[#2563EB] hover:text-[#2563EB] hover:bg-[#F8FAFC] transition-all"
        >
          Home
        </button>
      </div>
    </main>
  );
}

export default function Result() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">Loading…</div>}>
      <ResultContent />
    </Suspense>
  );
}
