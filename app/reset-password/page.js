'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';
import { normalizeEmail, suggestEmailFix } from '@/lib/emailHints';

// Step 1 of password reset: user enters their email, we ask Supabase
// to send a reset-link email. The link points to /auth/reset (Step 2)
// where the user picks a new password.
//
// We use Supabase's token_hash flow (configured via the email template
// in the dashboard) instead of the legacy PKCE link, so the reset works
// when the user opens the email on a different device than they're
// requesting it from.

function ResetRequestContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = searchParams.get('lang') || getSavedLang();
  const tex = t[lang] || t.en;

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const emailSuggestion = suggestEmailFix(email);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    // Same normalization as /login so the reset email targets the exact
    // identity the user signed up under (caps / trailing space safe).
    const emailNorm = normalizeEmail(email);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(emailNorm, {
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      if (err) { setError(err.message); return; }
      setSentTo(emailNorm);
    } catch { setError(tex.somethingWentWrong || 'Something went wrong'); }
    finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-[#E2E8F0] p-8">
        <Link href={`/?lang=${lang}`} className="flex items-center gap-2 justify-center mb-6">
          <Image src="/logo.png" alt="DMVSOS" width={40} height={40} className="rounded-xl" />
          <span className="text-xl font-bold text-[#0B1C3D]">DMVSOS</span>
        </Link>

        {sentTo ? (
          <>
            <h1 className="text-lg font-bold text-[#1E293B] text-center mb-2">{tex.resetEmailSentTitle}</h1>
            <p className="text-sm text-[#64748B] text-center mb-6">
              {(tex.resetEmailSentMessage || '').replace('{email}', sentTo)}
            </p>
            <button
              type="button"
              onClick={() => router.push(`/login?lang=${lang}`)}
              className="w-full bg-[#2563EB] text-white py-3 rounded-xl font-medium text-[15px] hover:bg-[#1D4ED8] transition-all"
            >
              {tex.backToSignIn || tex.signInTitle}
            </button>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-[#1E293B] text-center mb-2">{tex.resetPasswordTitle}</h1>
            <p className="text-sm text-[#94A3B8] text-center mb-6">{tex.resetPasswordSubtitle}</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={tex.emailPlaceholder}
                required
                className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm text-[#1E293B] placeholder-[#94A3B8] focus:border-[#2563EB] focus:outline-none transition"
              />
              {emailSuggestion && (
                <p className="text-xs text-[#64748B] -mt-1">
                  {tex.didYouMean}{' '}
                  <button
                    type="button"
                    onClick={() => setEmail(emailSuggestion)}
                    className="font-semibold text-[#2563EB] underline underline-offset-2"
                  >
                    {emailSuggestion}
                  </button>
                  ?
                </p>
              )}
              {error && <p className="text-xs text-[#DC2626]">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#2563EB] text-white py-3 rounded-xl font-medium text-[15px] hover:bg-[#1D4ED8] transition-all disabled:opacity-60"
              >
                {loading ? '...' : tex.sendResetLink}
              </button>
            </form>
            <button
              type="button"
              onClick={() => router.push(`/login?lang=${lang}`)}
              className="w-full mt-6 text-sm text-[#94A3B8] hover:text-[#2563EB] transition"
            >
              {tex.back}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

export default function ResetRequest() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
        <div className="w-6 h-6 border-2 border-[#94A3B8] border-t-transparent rounded-full animate-spin" />
      </main>
    }>
      <ResetRequestContent />
    </Suspense>
  );
}
