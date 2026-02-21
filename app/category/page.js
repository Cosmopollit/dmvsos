'use client';
import { useRouter } from 'next/navigation';

const categories = [
  {
    id: 'dmv',
    icon: '🚗',
    title: 'Car (DMV)',
    desc: 'Standard driver license test',
    questions: 40,
    time: '25 min',
    color: '#2563EB',
    bg: '#EFF6FF',
  },
  {
    id: 'cdl',
    icon: '🚛',
    title: 'Truck (CDL)',
    desc: 'Commercial driver license test',
    questions: 50,
    time: '35 min',
    color: '#16A34A',
    bg: '#F0FDF4',
  },
  {
    id: 'moto',
    icon: '🏍️',
    title: 'Motorcycle',
    desc: 'Motorcycle license test',
    questions: 30,
    time: '20 min',
    color: '#D97706',
    bg: '#FFFBEB',
  },
];

export default function Category() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">

      <div className="text-center mb-10">
        <span className="text-2xl font-bold text-[#0B1C3D]">
          DMV<span className="text-[#2563EB]">SOS</span>
        </span>
        <h2 className="text-xl font-bold text-[#1E293B] mt-4 mb-1">Choose your test</h2>
        <p className="text-sm text-[#94A3B8]">Select the license type you are preparing for</p>
      </div>

      <div className="w-full max-w-md flex flex-col gap-4">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => router.push('/test')}
            className="bg-white border-2 border-[#E2E8F0] rounded-2xl p-5 flex items-center gap-5 hover:border-[#2563EB] hover:-translate-y-0.5 hover:shadow-lg transition-all text-left"
          >
            <div className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl flex-shrink-0"
              style={{ background: cat.bg }}>
              {cat.icon}
            </div>

            <div className="flex-1">
              <div className="font-bold text-[#1E293B] text-lg">{cat.title}</div>
              <div className="text-sm text-[#94A3B8] mb-2">{cat.desc}</div>
              <div className="flex gap-3">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ background: cat.bg, color: cat.color }}>
                  {cat.questions} questions
                </span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ background: cat.bg, color: cat.color }}>
                  ⏱ {cat.time}
                </span>
              </div>
            </div>

            <div className="text-[#94A3B8] text-xl">→</div>
          </button>
        ))}
      </div>

      <button onClick={() => router.push('/')}
        className="mt-8 text-sm text-[#94A3B8] hover:text-[#2563EB] transition">
        ← Back
      </button>

    </main>
  );
}