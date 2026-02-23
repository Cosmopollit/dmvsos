'use client';

export default function Error({ reset }) {
  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">😵</div>
        <h1 className="text-2xl font-bold text-[#0B1C3D] mb-2">Something went wrong</h1>
        <p className="text-sm text-[#94A3B8] mb-6">An unexpected error occurred. Please try again.</p>
        <button
          onClick={() => reset()}
          className="bg-[#2563EB] text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#1D4ED8] transition"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
