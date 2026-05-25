'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';

// Step 2 of password reset.
//
// The user lands here from the reset-link email:
//   /auth/reset?token_hash=XXX&type=recovery
//
// 1. Call verifyOtp({ type: 'recovery', token_hash }) — this creates
//    a short-lived session scoped to letting the user change their
//    password. Same token_hash flow as /auth/confirm so it works
//    cross-browser.
// 2. Show a "set new password" form.
// 3. On submit, call supabase.auth.updateUser({ password }), then
//    redirect to /test (the user is now signed in with the new
//    password).

function ResetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = searchParams.get('lang') || getSavedLang();
  const tex = t[lang] || t.en;

  // Lifecycle: 'verifying' → ('form' | 'error') → ('updating' | 'success')
  const [phase, setPhase] = useState('verifying');
  const [verifyError, setVerifyError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type') || 'recovery';
      if (!tokenHash) {
        if (!cancelled) {
          setPhase('error');
          setVerifyError('Missing reset token. The link may be malformed.');
        }
        return;
      }

      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (cancelled) return;

      if (error) {
        setPhase('error');
        setVerifyError(error.message || 'Reset link is invalid or expired.');
        return;
      }
      setPhase('form');
    })();
    return () => { cancelled = true; };
  }, [searchParams]);

  async function handleUpdate(e) {
    e.preventDefault();
    setFormError('');
    if (password !== confirmPassword) {
      setFormError(tex.passwordsMustMatch);
      return;
    }
    if (password.length < 6) {
      setFormError(tex.passwordTooShort);
      return;
    }
    setPhase('updating');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { setPhase('form'); setFormError(error.message); return; }
      setPhase('success');
      setTimeout(() => { router.replace(`/test?lang=${lang}`); }, 1200);
    } catch { setPhase('form'); setFormError(tex.somethingWentWrong || 'Something went wrong'); }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-[#E2E8F0] p-8">
        <Link href={`/?lang=${lang}`} className="flex items-center gap-2 justify-center mb-6">
          <Image src="/logo.png" alt="DMVSOS" width={40} height={40} className="rounded-xl" />
          <span className="text-xl font-bold text-[#0B1C3D]">DMVSOS</span>
        </Link>

        {phase === 'verifying' && (
          <div className="text-center">
            <div className="w-8 h-8 mx-auto mb-4 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[#64748B]">{tex.verifyingResetLink}</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#FEE2E2] flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-[#1E293B] mb-2">{tex.resetLinkInvalidTitle}</h1>
            <p className="text-sm text-[#64748B] mb-1">{tex.resetLinkInvalidMessage}</p>
            {verifyError && <p className="text-xs text-[#94A3B8] mb-4">{verifyError}</p>}
            <Link
              href={`/reset-password?lang=${lang}`}
              className="inline-block w-full bg-[#2563EB] text-white py-3 rounded-xl font-medium text-[15px] hover:bg-[#1D4ED8] transition-all mt-3"
            >
              {tex.requestNewResetLink}
            </Link>
          </div>
        )}

        {(phase === 'form' || phase === 'updating') && (
          <>
            <h1 className="text-lg font-bold text-[#1E293B] text-center mb-2">{tex.setNewPasswordTitle}</h1>
            <p className="text-sm text-[#94A3B8] text-center mb-6">{tex.setNewPasswordSubtitle}</p>
            <form onSubmit={handleUpdate} className="space-y-3">
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={tex.newPasswordPlaceholder}
                required
                minLength={6}
                className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm text-[#1E293B] placeholder-[#94A3B8] focus:border-[#2563EB] focus:outline-none transition"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder={tex.confirmNewPasswordPlaceholder}
                required
                minLength={6}
                className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm text-[#1E293B] placeholder-[#94A3B8] focus:border-[#2563EB] focus:outline-none transition"
              />
              {formError && <p className="text-xs text-[#DC2626]">{formError}</p>}
              <button
                type="submit"
                disabled={phase === 'updating'}
                className="w-full bg-[#2563EB] text-white py-3 rounded-xl font-medium text-[15px] hover:bg-[#1D4ED8] transition-all disabled:opacity-60"
              >
                {phase === 'updating' ? '...' : tex.updatePasswordButton}
              </button>
            </form>
          </>
        )}

        {phase === 'success' && (
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#DCFCE7] flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-[#1E293B] mb-2">{tex.passwordUpdatedTitle}</h1>
            <p className="text-sm text-[#64748B]">{tex.passwordUpdatedMessage}</p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function Reset() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
        <div className="w-6 h-6 border-2 border-[#94A3B8] border-t-transparent rounded-full animate-spin" />
      </main>
    }>
      <ResetContent />
    </Suspense>
  );
}
