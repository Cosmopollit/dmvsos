'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
    <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
    <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
    <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
    <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
  </svg>
);

const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="white" className="shrink-0">
    <path d="M13.4 9.3c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.7-3.2.7-.6 0-1.6-.7-2.7-.7-1.4 0-2.7.8-3.4 2-1.4 2.5-.4 6.2 1 8.2.7 1 1.5 2 2.5 2 1 0 1.4-.6 2.6-.6 1.2 0 1.6.6 2.6.6 1.1 0 1.8-.9 2.5-1.9.8-1.1 1.1-2.2 1.1-2.2s-2-.8-2-3.3zM11.5 3c.6-.7 1-1.6.8-2.5-.8 0-1.8.5-2.3 1.2-.5.6-1 1.5-.8 2.4.9.1 1.8-.4 2.3-1.1z"/>
  </svg>
);

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
          <GoogleIcon />
          {tex.continueGoogle}
        </button>
        <button
          type="button"
          className="w-full bg-black text-white py-3 rounded-xl font-medium text-[15px] flex items-center justify-center gap-3 hover:bg-[#1a1a1a] transition-all"
        >
          <AppleIcon />
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
