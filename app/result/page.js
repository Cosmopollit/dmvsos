'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function ResultContent() {
  const router = useRouter();
  const params = useSearchParams();
  const score = parseInt(params.get('score') || 0);
  const total = parseInt(params.get('total') || 3);
  const percent = Math.round((score / total) * 100);
  const passed = percent >= 70;

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">

        {/* Result card */}
        <div className="bg-white rounded-2xl p-8 shadow-lg border border-[#E2E8F0] text-center mb-5">

          {/* Emoji */}
          <div className="text-6xl mb-4">
            {passed ? '🎉' : '😓'}
          </div>

          {/* Status */}
          <div className={`inline-block px-4 py-1 rounded-full text-sm font-bold mb-4 ${
            passed ? 'bg-[#F0FDF4] text-[#16A34A]' : 'bg-[#FEF2F2] text-[#DC2626]'
          }`}>
            {passed ? 'PASSED' : 'NOT PASSED'}
          </div>

          {/* Score */}
          <div className="text-6xl font-bold text-[#0B1C3D] mb-1">{percent}%</div>
          <p className="text-[#94A3B8] text-sm mb-6">
            You answered {score} out of {total} questions correctly
          </p>

          {/* Progress bar */}
          <div className="w-full h-3 bg-[#E2E8F0] rounded-full mb-8">
            <div className={`h-3 rounded-full transition-all duration-700 ${passed ? 'bg-[#16A34A]' : 'bg-[#DC2626]'}`}
              style={{ width: `${percent}%` }} />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-[#F0FDF4] rounded-xl p-3">
              <div className="text-2xl font-bold text-[#16A34A]">{score}</div>
              <div className="text-xs text-[#94A3B8] mt-1">Correct</div>
            </div>
            <div className="bg-[#FEF2F2] rounded-xl p-3">
              <div className="text-2xl font-bold text-[#DC2626]">{total - score}</div>
              <div className="text-xs text-[#94A3B8] mt-1">Wrong</div>
            </div>
            <div className="bg-[#EFF6FF] rounded-xl p-3">
              <div className="text-2xl font-bold text-[#2563EB]">{total}</div>
              <div className="text-xs text-[#94A3B8] mt-1">Total</div>
            </div>
          </div>

          {/* Message */}
          <p className="text-sm text-[#94A3B8] leading-relaxed">
            {passed
              ? 'Great job! You are ready for the real DMV test. Keep practicing to stay sharp.'
              : 'Don\'t give up! Review the questions and try again. You can do it!'}
          </p>

        </div>

        {/* Buttons */}
        <button onClick={() => router.push('/test')}
          className="w-full bg-[#2563EB] text-white py-4 rounded-xl font-semibold text-base hover:bg-[#1D4ED8] hover:-translate-y-0.5 hover:shadow-lg transition-all mb-3">
          🔄 Try Again
        </button>

        <button onClick={() => router.push('/category')}
          className="w-full bg-white border-2 border-[#E2E8F0] text-[#1E293B] py-4 rounded-xl font-semibold text-base hover:border-[#2563EB] hover:text-[#2563EB] transition-all mb-3">
          Choose Another Test
        </button>

        <button onClick={() => router.push('/')}
          className="w-full text-sm text-[#94A3B8] hover:text-[#2563EB] transition py-2">
          ← Back to Home
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