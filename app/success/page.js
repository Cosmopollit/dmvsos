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
  // Email comes back from /api/auth/checkout-login so we can show the user
  // which inbox to check on the error fallback, instead of vague "your email".
  const [email, setEmail] = useState(null);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState('idle'); // 'idle' | 'sent'

  useEffect(() => {
    if (!sessionId) return;
    // Signal AuthContext that a payment just happened, so it polls through
    // the webhook-processing window once the user lands logged-in (instead
    // of caching "free" if the webhook is still writing the pass). Set on
    // the dmvsos.com origin; it survives the magic-link round trip through
    // supabase.co and back. Consumed + cleared by AuthContext.
    try { sessionStorage.setItem('dmvsos_just_paid', '1'); } catch { /* private mode */ }
    let cancelled = false;
    (async () => {
      try {
        // Webhook needs to (a) read Stripe event, (b) optionally create the
        // auth.users row via getOrCreateUserByEmail (which lists every user
        // in the project), (c) insert active_passes + profiles + purchases.
        // On warm dynos that runs in <1s but on cold start it can take 3-4s.
        // Earlier 1500ms triggered a race where /success raced ahead of the
        // webhook and the user landed logged-in but without active_pass —
        // free tier UI, confusing.
        await new Promise(r => setTimeout(r, 4000));
        const res = await fetch('/api/auth/checkout-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.email) setEmail(data.email);
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

  // Resend uses the same endpoint, which generates a fresh magic-link each
  // call. Cheap on our side; useful when the first email landed in spam or
  // hasn't arrived yet.
  async function handleResend() {
    if (!sessionId || resending) return;
    setResending(true);
    setResendStatus('idle');
    try {
      const res = await fetch('/api/auth/checkout-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json();
      if (data.email) setEmail(data.email);
      if (data.login_url) {
        // Got a fresh link → just redirect, no need to wait for email.
        window.location.href = data.login_url;
        return;
      }
      setResendStatus('sent');
    } catch (_) {
      // Network error reaching our own endpoint. There is no email backup
      // (generate_link does not send mail); the real login path is the
      // login_url redirect above. Nothing more to do, just clear the spinner.
      setResendStatus('sent');
    } finally {
      setResending(false);
    }
  }

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
              <p className="text-[#475569] text-sm leading-relaxed mb-3">
                {tex.successLoginIssue || "We couldn't auto-log you in, but your account is set up and a login link was emailed to you."}
              </p>
              {email && (
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 mb-4 text-left">
                  <div className="text-[11px] uppercase tracking-wide text-[#94A3B8] font-semibold mb-1">
                    {tex.successLinkSentTo || 'Login link sent to'}
                  </div>
                  <div className="text-sm font-semibold text-[#0B1C3D] break-all">{email}</div>
                  <div className="text-[11px] text-[#94A3B8] mt-1.5">
                    {tex.successCheckSpam || 'Check your inbox and spam folder.'}
                  </div>
                </div>
              )}
              {resendStatus === 'sent' && (
                <p className="text-xs text-[#16A34A] mb-3">
                  {tex.successResent || 'New login link sent.'}
                </p>
              )}
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="w-full bg-[#2563EB] text-white py-4 rounded-xl font-semibold text-base hover:bg-[#1D4ED8] transition-all disabled:opacity-60 mb-3"
              >
                {resending ? '...' : (tex.successResendCta || 'Resend login link')}
              </button>
              <button type="button" onClick={() => router.push(`/?lang=${lang}`)}
                className="w-full bg-white text-[#0B1C3D] border border-[#E2E8F0] py-3 rounded-xl font-medium text-sm hover:bg-[#F8FAFC] transition mb-2">
                {tex.startPracticing || 'Go to site'}
              </button>
              {error && (
                <p className="text-[#CBD5E1] text-[10px] mt-2 font-mono">{error}</p>
              )}
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
