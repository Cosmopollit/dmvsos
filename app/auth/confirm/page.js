'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';

// Email confirmation handler.
//
// Supabase email templates point here with:
//   /auth/confirm?token_hash=XXX&type=email&next=/test
//
// We use the `token_hash` flow (not PKCE) so the confirmation works in
// ANY browser, not just the one used to sign up. PKCE requires the
// pkce_code_verifier from localStorage, which is missing when the user
// opens the email link on a different device (~70% of real users).

function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = searchParams.get('lang') || getSavedLang();
  const tex = t[lang] || t.en;

  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type');
      if (!tokenHash || !type) {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage('Missing confirmation token. The link may be malformed.');
        }
        return;
      }

      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (cancelled) return;

      if (error) {
        setStatus('error');
        setErrorMessage(error.message || 'Verification failed.');
        return;
      }

      setStatus('success');
      // Brief delay so the user sees the success state before navigating.
      const next = searchParams.get('next');
      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/test';
      setTimeout(() => { router.replace(safeNext); }, 1200);
    })();
    return () => { cancelled = true; };
  }, [searchParams, router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-[#E2E8F0] p-8 text-center">
        <Link href={`/?lang=${lang}`} className="flex items-center gap-2 justify-center mb-6">
          <Image src="/logo.png" alt="DMVSOS" width={40} height={40} className="rounded-xl" />
          <span className="text-xl font-bold text-[#0B1C3D]">DMVSOS</span>
        </Link>

        {status === 'verifying' && (
          <>
            <div className="w-8 h-8 mx-auto mb-4 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[#64748B]">{tex.confirmingEmailMessage}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#DCFCE7] flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-[#1E293B] mb-2">{tex.confirmEmailSuccessTitle}</h1>
            <p className="text-sm text-[#64748B]">{tex.confirmEmailSuccessMessage}</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#FEE2E2] flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-[#1E293B] mb-2">{tex.confirmEmailErrorTitle}</h1>
            <p className="text-sm text-[#64748B] mb-1">{tex.confirmEmailErrorMessage}</p>
            {errorMessage && <p className="text-xs text-[#94A3B8] mb-4">{errorMessage}</p>}
            <Link
              href={`/login?lang=${lang}`}
              className="inline-block w-full bg-[#2563EB] text-white py-3 rounded-xl font-medium text-[15px] hover:bg-[#1D4ED8] transition-all mt-3"
            >
              {tex.signInTitle}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

export default function Confirm() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
        <div className="w-6 h-6 border-2 border-[#94A3B8] border-t-transparent rounded-full animate-spin" />
      </main>
    }>
      <ConfirmContent />
    </Suspense>
  );
}
