'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = searchParams.get('lang') || 'en';
  const tex = t[lang] || t.en;

  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: false,
      },
    });
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-[#E2E8F0] p-8">
        <a href="/" className="flex items-center gap-2 justify-center mb-6">
          <img src="/logo.png" alt="DMVSOS" className="w-10 h-10 rounded-xl" />
          <span className="text-xl font-bold text-[#0B1C3D]">
            DMV<span className="text-[#2563EB]">SOS</span>
          </span>
        </a>
        <h1 className="text-lg font-bold text-[#1E293B] text-center mb-2">{tex.signInTitle}</h1>
        <p className="text-sm text-[#94A3B8] text-center mb-6">Save your progress and access all tests</p>
        <button
          onClick={handleGoogleSignIn}
          type="button"
          className="w-full bg-white text-[#1E293B] border border-[#E2E8F0] py-3 rounded-xl font-medium text-[15px] flex items-center justify-center gap-3 mb-3 hover:bg-[#F8FAFC] hover:border-[#2563EB] transition-all"
        >
          {tex.continueGoogle}
        </button>
        <button
          type="button"
          className="w-full bg-black text-white py-3 rounded-xl font-medium text-[15px] flex items-center justify-center gap-3 hover:bg-[#1a1a1a] transition-all"
        >
          {tex.continueApple}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/?lang=${lang}`)}
          className="w-full mt-6 text-sm text-[#94A3B8] hover:text-[#2563EB] transition"
        >
          {tex.back}
        </button>
      </div>
    </main>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">Loading…</div>}>
      <LoginContent />
    </Suspense>
  );
}
