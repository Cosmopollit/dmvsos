'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';
import SupportFooter from '@/app/components/SupportFooter';

// OAuth provider availability. Toggle each flag to true ONLY after the
// matching provider is fully configured in Supabase Dashboard →
// Authentication → Providers, with the correct callback URL whitelisted.
//
// Until configured, the button is hidden so users don't click into a
// dead-end OAuth flow. Google is currently the only working third-party
// provider (71% of historical signups come through it).
//
// Apple setup:    requires an Apple Developer account ($99/yr), a
//                 Services ID, a Key ID, and a signed JWT secret. See
//                 https://supabase.com/docs/guides/auth/social-login/auth-apple
// Facebook setup: requires a Facebook App at developers.facebook.com,
//                 App ID + App Secret pasted into Supabase, plus the
//                 callback URL added to the App's Valid OAuth Redirect
//                 URIs list. Privacy Policy URL must point to /privacy.
const ENABLE_APPLE_OAUTH = false;
const ENABLE_FACEBOOK_OAUTH = true;

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

const FacebookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="white" className="shrink-0">
    <path d="M18 9a9 9 0 1 0-10.406 8.89v-6.29H5.309V9h2.285V7.017c0-2.258 1.344-3.505 3.4-3.505.985 0 2.015.176 2.015.176v2.215h-1.135c-1.118 0-1.467.694-1.467 1.406V9h2.496l-.399 2.6h-2.097v6.29A9.003 9.003 0 0 0 18 9z"/>
  </svg>
);

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = searchParams.get('lang') || getSavedLang();
  const tex = t[lang] || t.en;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [awaitingConfirmEmail, setAwaitingConfirmEmail] = useState('');
  const [resendStatus, setResendStatus] = useState('idle'); // 'idle' | 'sending' | 'sent'

  // After login Supabase redirects here with ?code=... — we hand it
  // straight to Supabase JS SDK on the home page, which auto-exchanges
  // the code (`detectSessionInUrl: true` is on by default).
  //
  // We previously routed through a custom /auth/callback handler that
  // pushed users to /test, but that path is not in Supabase's Redirect
  // URL whitelist for this project and any OAuth attempt silently
  // failed: the OAuth flow completed cosmetically (user lands on
  // /test) but no session cookie was set. Reverted to plain
  // window.location.origin which IS whitelisted by default.
  //
  // If we want to land users on /test after sign-in later, the right
  // fix is to (a) whitelist dmvsos.com/auth/callback in Supabase
  // Dashboard → Auth → URL Configuration, then (b) route through it.
  function authRedirectTo() {
    return window.location.origin;
  }

  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: authRedirectTo(),
        skipBrowserRedirect: false,
      },
    });
  }

  async function handleAppleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: authRedirectTo(),
        skipBrowserRedirect: false,
      },
    });
  }

  async function handleFacebookSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        redirectTo: authRedirectTo(),
        skipBrowserRedirect: false,
      },
    });
  }

  async function handleEmailAuth(e) {
    e.preventDefault();
    setEmailLoading(true);
    setEmailError('');
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: authRedirectTo() },
        });
        if (error) { setEmailError(error.message); return; }
        // When Supabase has email confirmation on, signUp returns a user
        // but no session — the user must click the link in their inbox
        // before they can sign in. Show a "check your email" panel
        // instead of redirecting into /test, where they'd see the free
        // tier and assume their paid pass (if any) was lost.
        if (!data?.session) {
          setAwaitingConfirmEmail(email);
          setResendStatus('idle');
          return;
        }
        // Confirmation disabled in dashboard — session is live immediately.
        const next = searchParams.get('next');
        const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/test';
        router.push(safeNext);
        return;
      }
      // Sign-in path
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setEmailError(error.message); return; }
      const next = searchParams.get('next');
      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/test';
      router.push(safeNext);
    } catch { setEmailError(tex.somethingWentWrong || 'Something went wrong'); }
    finally { setEmailLoading(false); }
  }

  async function handleResendConfirm() {
    if (!awaitingConfirmEmail) return;
    setResendStatus('sending');
    try {
      await supabase.auth.resend({
        type: 'signup',
        email: awaitingConfirmEmail,
        options: { emailRedirectTo: authRedirectTo() },
      });
      setResendStatus('sent');
    } catch { setResendStatus('idle'); }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-[#E2E8F0] p-8">
        <Link href="/" className="flex items-center gap-2 justify-center mb-6">
          <Image src="/logo.png" alt="DMVSOS" width={40} height={40} className="rounded-xl" />
          <span className="text-xl font-bold text-[#0B1C3D]">
            DMVSOS
          </span>
        </Link>
        {awaitingConfirmEmail ? (
          <>
            <h1 className="text-lg font-bold text-[#1E293B] text-center mb-2">{tex.checkYourEmailTitle}</h1>
            <p className="text-sm text-[#64748B] text-center mb-6">
              {(tex.confirmEmailSentTo || '').replace('{email}', awaitingConfirmEmail)}
            </p>
            <button
              type="button"
              onClick={handleResendConfirm}
              disabled={resendStatus === 'sending'}
              className="w-full bg-[#2563EB] text-white py-3 rounded-xl font-medium text-[15px] hover:bg-[#1D4ED8] transition-all disabled:opacity-60 mb-3"
            >
              {resendStatus === 'sending' ? '...' : tex.resendConfirmEmail}
            </button>
            {resendStatus === 'sent' && (
              <p className="text-xs text-[#16A34A] text-center mb-3">{tex.confirmEmailResent}</p>
            )}
            <button
              type="button"
              onClick={() => {
                setAwaitingConfirmEmail('');
                setResendStatus('idle');
                setIsSignUp(false);
                setPassword('');
                setEmailError('');
              }}
              className="w-full text-sm text-[#94A3B8] hover:text-[#2563EB] transition"
            >
              {tex.back}
            </button>
          </>
        ) : (<>
        <h1 className="text-lg font-bold text-[#1E293B] text-center mb-2">{tex.signInTitle}</h1>
        <p className="text-sm text-[#94A3B8] text-center mb-6">{tex.signInSubtitle || 'Save your progress and access all tests'}</p>
        <button
          onClick={handleGoogleSignIn}
          type="button"
          className="w-full bg-white text-[#1E293B] border border-[#E2E8F0] py-3 rounded-xl font-medium text-[15px] flex items-center justify-center gap-3 mb-3 hover:bg-[#F8FAFC] hover:border-[#2563EB] transition-all"
        >
          <GoogleIcon />
          {tex.continueGoogle}
        </button>
        {ENABLE_APPLE_OAUTH && (
          <button
            type="button"
            onClick={handleAppleSignIn}
            className="w-full bg-black text-white py-3 rounded-xl font-medium text-[15px] flex items-center justify-center gap-3 mb-3 hover:bg-[#1a1a1a] transition-all"
          >
            <AppleIcon />
            {tex.continueApple}
          </button>
        )}
        {ENABLE_FACEBOOK_OAUTH && (
          <button
            type="button"
            onClick={handleFacebookSignIn}
            className="w-full bg-[#1877F2] text-white py-3 rounded-xl font-medium text-[15px] flex items-center justify-center gap-3 mb-3 hover:bg-[#166FE5] transition-all"
          >
            <FacebookIcon />
            {tex.continueFacebook}
          </button>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-[#E2E8F0]" />
          <span className="text-xs text-[#94A3B8]">{tex.orContinueWith}</span>
          <div className="flex-1 h-px bg-[#E2E8F0]" />
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailAuth} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={tex.emailPlaceholder}
            required
            className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm text-[#1E293B] placeholder-[#94A3B8] focus:border-[#2563EB] focus:outline-none transition"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={tex.passwordPlaceholder}
            required
            minLength={6}
            className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm text-[#1E293B] placeholder-[#94A3B8] focus:border-[#2563EB] focus:outline-none transition"
          />
          {emailError && <p className="text-xs text-[#DC2626]">{emailError}</p>}
          <button
            type="submit"
            disabled={emailLoading}
            className="w-full bg-[#2563EB] text-white py-3 rounded-xl font-medium text-[15px] hover:bg-[#1D4ED8] transition-all disabled:opacity-60"
          >
            {emailLoading ? '...' : (isSignUp ? tex.createAccount : tex.signInTitle)}
          </button>
          <button
            type="button"
            onClick={() => { setIsSignUp(!isSignUp); setEmailError(''); }}
            className="w-full text-xs text-[#94A3B8] hover:text-[#2563EB] transition"
          >
            {isSignUp ? tex.hasAccount : tex.noAccount}
          </button>
        </form>

        <button
          type="button"
          onClick={() => router.push(`/?lang=${lang}`)}
          className="w-full mt-6 text-sm text-[#94A3B8] hover:text-[#2563EB] transition"
        >
          {tex.back}
        </button>
        </>)}
      </div>
      <SupportFooter lang={lang} />
    </main>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}><div className="w-6 h-6 border-2 border-[#94A3B8] border-t-transparent rounded-full animate-spin" /></main>}>
      <LoginContent />
    </Suspense>
  );
}
