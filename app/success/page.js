'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';

function SuccessContent() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get('session_id');
  const lang = getSavedLang();
  const tex = t[lang] || t.en;

  const [status, setStatus] = useState(sessionId ? 'logging-in' : 'no-session');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        // Webhook needs ~1-2s to write active_pass. Small delay avoids race.
        await new Promise(r => setTimeout(r, 1500));
        const res = await fetch('/api/auth/checkout-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.login_url) {
          // Redirect to Supabase verify URL - lands user logged-in on dmvsos.com
          window.location.href = data.login_url;
        } else {
          setError(data.error || 'login failed');
          setStatus('error');
        }
      } catch (e) {
        if (cancelled) return;
        setError(e.message);
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
      <div className="w-full max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 mb-8 hover:opacity-90 transition">
          <Image src="/logo.png" alt="DMVSOS" width={40} height={40} className="rounded-xl" />
          <span className="text-[26px] font-bold text-[#0B1C3D] tracking-tight">DMVSOS</span>
        </Link>

        <div className="bg-white rounded-2xl p-8 shadow-lg border border-[#E2E8F0] mb-6">
          <div className="w-16 h-16 bg-[#F0FDF4] rounded-full flex items-center justify-center mx-auto mb-5">
            <span className="text-4xl text-[#16A34A]">✓</span>
          </div>
          <h1 className="text-xl font-bold text-[#0B1C3D] mb-3">
            {tex.paymentSuccess || 'Payment successful!'}
          </h1>

          {status === 'logging-in' && (
            <>
              <p className="text-[#475569] text-sm leading-relaxed mb-2">
                {tex.successLoggingIn || 'Setting up your account...'}
              </p>
              <div className="inline-block w-6 h-6 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin mt-2"></div>
            </>
          )}

          {status === 'no-session' && (
            <>
              <p className="text-[#475569] text-sm leading-relaxed mb-6">
                {tex.welcomePro || 'Welcome to DMVSOS Pro! You now have access to all tests.'}
              </p>
              <button type="button" onClick={() => router.push(`/?lang=${lang}`)}
                className="w-full bg-[#2563EB] text-white py-4 rounded-xl font-semibold text-base hover:bg-[#1D4ED8] hover:-translate-y-0.5 hover:shadow-lg transition-all mb-3">
                {tex.startPracticing || 'Start practicing'}
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <p className="text-[#475569] text-sm leading-relaxed mb-2">
                {tex.successLoginIssue || "We couldn't auto-log you in. Check your email for a login link from Supabase, or sign in with Google using the same email you paid with."}
              </p>
              {error && (
                <p className="text-[#94A3B8] text-xs mb-4 font-mono">{error}</p>
              )}
              <button type="button" onClick={() => router.push(`/?lang=${lang}`)}
                className="w-full bg-[#2563EB] text-white py-4 rounded-xl font-semibold text-base hover:bg-[#1D4ED8] transition-all mb-3">
                {tex.startPracticing || 'Go to site'}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function Success() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-[#64748B]">Loading...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
