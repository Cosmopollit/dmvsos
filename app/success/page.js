'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';
import { trackPurchase } from '@/lib/gtag';
import GradientButton from '@/app/components/GradientButton';

function SuccessContent() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get('session_id');
  // Pass type + kind ride in on the Stripe success_url so we can attribute the
  // conversion value without a round trip. Absent for legacy/subscription buys.
  const purchasePt = params.get('pt');
  const purchaseKind = params.get('k') || 'new';
  const lang = getSavedLang();
  const tex = t[lang] || t.en;

  const [status, setStatus] = useState(sessionId ? 'logging-in' : 'redirect');
  const [error, setError] = useState(null);
  // Email comes back from /api/auth/checkout-login so we can show the user
  // which inbox to check on the error fallback, instead of vague "your email".
  const [email, setEmail] = useState(null);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState('idle'); // 'idle' | 'sent'

  // Fire the GA4 `purchase` conversion once, on mount — before the ~4s login
  // redirect below. gtag sends via sendBeacon, so it flushes even as the page
  // navigates away. Deduped per session_id so a manual /success reload can't
  // double-count (GA4 also dedupes by transaction_id as a backstop).
  useEffect(() => {
    if (!sessionId || !purchasePt) return;
    const key = `dmvsos_purchase_tracked_${sessionId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { /* private mode: GA4 still dedupes by transaction_id */ }
    trackPurchase({ transactionId: sessionId, passType: purchasePt, kind: purchaseKind });
  }, [sessionId, purchasePt, purchaseKind]);

  useEffect(() => {
    if (!sessionId) {
      // No Stripe session in the URL: nothing to confirm here. This page
      // used to show "Payment successful! Welcome to Pro" to any direct
      // visitor, which was a lie. Send them home instead.
      router.replace(`/?lang=${lang}`);
      return;
    }
    // Signal AuthContext that a payment just happened, so it polls through
    // the webhook-processing window once the user lands logged-in (instead
    // of caching "free" if the webhook is still writing the pass). Set on
    // the dmvsos.com origin; it survives the magic-link round trip through
    // supabase.co and back. Consumed + cleared by AuthContext.
    try { sessionStorage.setItem('dmvsos_just_paid', '1'); } catch { /* private mode */ }
    let cancelled = false;
    // Delayed methods (Klarna, Cash App, bank debits) redirect here while
    // the payment is still settling (202 pending from checkout-login).
    // Cash App usually clears in seconds, so poll a few times before
    // settling into the pending screen.
    const PENDING_RETRY_MS = [8000, 20000, 40000];
    (async () => {
      // Webhook needs to (a) read Stripe event, (b) optionally create the
      // auth.users row via getOrCreateUserByEmail (which lists every user
      // in the project), (c) insert active_passes + profiles + purchases.
      // On warm dynos that runs in <1s but on cold start it can take 3-4s.
      // Earlier 1500ms triggered a race where /success raced ahead of the
      // webhook and the user landed logged-in but without active_pass —
      // free tier UI, confusing.
      await new Promise(r => setTimeout(r, 4000));
      for (let attempt = 0; ; attempt++) {
        let res, data;
        try {
          res = await fetch('/api/auth/checkout-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId }),
          });
          data = await res.json();
        } catch (e) {
          if (cancelled) return;
          setError(e.message);
          setStatus('error');
          return;
        }
        if (cancelled) return;
        if (data.email) setEmail(data.email);
        if (data.login_url) {
          // Redirect to Supabase verify URL - lands user logged-in on dmvsos.com
          window.location.href = data.login_url;
          return;
        }
        if (res.status === 202 && data.pending) {
          setStatus('pending');
          if (attempt < PENDING_RETRY_MS.length) {
            await new Promise(r => setTimeout(r, PENDING_RETRY_MS[attempt]));
            if (cancelled) return;
            continue;
          }
          // Still settling: access activates via the async webhook, and
          // never-signed-in buyers get an email from the recovery cron.
          return;
        }
        if (res.status === 410) {
          setStatus('expired');
          return;
        }
        setError(data.error || 'login failed');
        setStatus('error');
        return;
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, router, lang]);

  // Retry uses the same endpoint, which generates a fresh login link each
  // call. On failure we say so honestly — there is no email fallback here,
  // the real login path is the login_url redirect (or /login by email).
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
      if (res.status === 202 && data.pending) {
        setStatus('pending');
        return;
      }
      if (res.status === 410) {
        setStatus('expired');
        return;
      }
      setResendStatus('failed');
    } catch (_) {
      setResendStatus('failed');
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
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#0B1C3D] mb-3">
            {status === 'pending'
              ? (tex.successPendingTitle || 'Payment is processing')
              : (tex.paymentSuccess || 'Payment successful!')}
          </h1>

          {status === 'logging-in' && (
            <>
              {/* ACCESS GRANTED — the closing beat of the free-tier "open the
                  bank" game. The access meter fills to 100% (it really did:
                  the pass is now active), then the page logs the buyer in and
                  everything downstream is the clean paid product. */}
              <div className="rounded-xl overflow-hidden border border-[#1E3A5F] text-left mb-4"
                style={{ background: '#081226', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }}>
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#12233F]">
                  <span className="w-2 h-2 rounded-full bg-[#22C55E]" aria-hidden="true" />
                  <span className="text-[10px] tracking-widest text-[#7DD3FC] uppercase">DMVSOS QUESTION BANK</span>
                </div>
                <div className="px-4 py-4">
                  <div className="text-[13px] font-bold text-[#4ADE80] mb-3">
                    &gt; {tex.termAccessGranted || 'ACCESS GRANTED'}<span className="term-caret">_</span>
                  </div>
                  <div className="h-1.5 rounded bg-[#12233F] overflow-hidden mb-1.5">
                    <div className="term-scan-bar h-full rounded bg-[#22C55E]" />
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#94A3B8]">{tex.termBankUnlocked || 'Full question bank unlocked'}</span>
                    <span className="text-[#4ADE80] font-bold">100%</span>
                  </div>
                </div>
              </div>
              <p className="text-[#475569] text-sm leading-relaxed mb-2">
                {tex.successLoggingIn || 'Setting up your account...'}
              </p>
              <div className="inline-block w-6 h-6 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin mt-1"></div>
            </>
          )}

          {status === 'redirect' && (
            <>
              <p className="text-[#475569] text-sm leading-relaxed mb-2">
                {tex.successLoggingIn || 'Setting up your account...'}
              </p>
              <div className="inline-block w-6 h-6 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin mt-2"></div>
            </>
          )}

          {status === 'pending' && (
            <>
              <p className="text-[#475569] text-sm leading-relaxed mb-4">
                {tex.successPendingBody || 'Your payment method is confirming the payment. Access activates automatically as soon as it clears. If you are new here, we will email you a sign-in link.'}
              </p>
              <div className="inline-block w-6 h-6 border-2 border-[#F59E0B] border-t-transparent rounded-full animate-spin mb-4"></div>
              <button type="button" onClick={() => router.push(`/?lang=${lang}`)}
                className="w-full bg-white text-[#0B1C3D] border border-[#E2E8F0] py-3 rounded-xl font-medium text-sm hover:bg-[#F8FAFC] transition">
                {tex.startPracticing || 'Go to site'}
              </button>
            </>
          )}

          {status === 'expired' && (
            <>
              <p className="text-[#475569] text-sm leading-relaxed mb-6">
                {tex.successSessionExpired || 'This confirmation link has expired. Sign in with your email to access your account.'}
              </p>
              <GradientButton onClick={() => router.push(`/login?lang=${lang}`)} className="mb-3">
                {tex.successSignInCta || 'Sign in with email'}
              </GradientButton>
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
              {resendStatus === 'failed' && (
                <p className="text-xs text-[#DC2626] mb-3">
                  {tex.successResendFailed || "Couldn't get a sign-in link. Try again in a minute, or sign in with your email."}
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
              <button type="button" onClick={() => router.push(`/login?lang=${lang}`)}
                className="w-full bg-white text-[#0B1C3D] border border-[#E2E8F0] py-3 rounded-xl font-medium text-sm hover:bg-[#F8FAFC] transition mb-2">
                {tex.successSignInCta || 'Sign in with email'}
              </button>
              {error && (
                <p className="text-[#94A3B8] text-[10px] mt-2 font-mono">{error}</p>
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
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#94A3B8] border-t-transparent rounded-full animate-spin" /></div>}>
      <SuccessContent />
    </Suspense>
  );
}
