'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function TestContent() {
  const router = useRouter();
  const params = useSearchParams();
  const state = params.get('state') || 'washington';
  const category = params.get('category') || 'car';

  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/data/${state}.json`)
      .then(r => r.json())
      .then(d => {
        const test = d[category]?.[0];
        if (test) setQuestions(test.questions.slice(0, 20));
        setLoading(false);
      });
  }, [state, category]);

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
    if (current + 1 < total) {
      setCurrent(c => c + 1);
      setSelected(null);
      setShowAnswer(false);
    } else {
      const finalScore = score + (selected === q.correctAnswerIndex ? 1 : 0);
      router.push(`/result?score=${finalScore}&total=${total}`);
    }
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">

        <div className="flex items-center justify-between mb-4">
          <button onClick={() => router.push('/category')}
            className="text-sm text-[#94A3B8] hover:text-[#2563EB] transition">
            ← Back
          </button>
          <span className="text-sm font-medium text-[#94A3B8]">{current + 1} / {total}</span>
        </div>

        <div className="w-full h-2 bg-[#E2E8F0] rounded-full mb-8">
          <div className="h-2 bg-[#2563EB] rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }} />
        </div>

        <div className="bg-white rounded-2xl p-7 shadow-lg border border-[#E2E8F0] mb-5">

          {q.imageUrl && (
            <img src={q.imageUrl} alt="Question"
              className="w-full rounded-xl mb-5 border border-gray-100" />
          )}

          <p className="text-[18px] font-bold text-[#1E293B] leading-relaxed mb-6">
            {q.question}
          </p>

          <div className="flex flex-col gap-3">
            {q.answers.map((opt, i) => {
              let style = 'border-2 border-[#E2E8F0] text-[#1E293B] bg-white';
              if (showAnswer) {
                if (i === q.correctAnswerIndex) style = 'border-2 border-[#16A34A] bg-[#F0FDF4] text-[#16A34A] font-semibold';
                else if (i === selected) style = 'border-2 border-[#DC2626] bg-[#FEF2F2] text-[#DC2626]';
                else style = 'border-2 border-[#E2E8F0] text-[#94A3B8] bg-white opacity-50';
              }
              return (
                <button key={i} onClick={() => handleSelect(i)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all ${style} ${!showAnswer ? 'hover:border-[#2563EB] hover:text-[#2563EB]' : ''}`}>
                  <span className="font-bold mr-3">{['A', 'B', 'C', 'D'][i]}.</span>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        {showAnswer && (
          <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 mb-5">
            <p className="text-sm text-[#1E40AF] leading-relaxed">
              ✅ Correct answer: <strong>{q.answers[q.correctAnswerIndex]}</strong>
            </p>
          </div>
        )}

        {showAnswer && (
          <button onClick={handleNext}
            className="w-full bg-[#2563EB] text-white py-4 rounded-xl font-semibold text-base hover:bg-[#1D4ED8] hover:-translate-y-0.5 hover:shadow-lg transition-all">
            {current + 1 < total ? 'Next Question →' : 'See Results →'}
          </button>
        )}

      </div>
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