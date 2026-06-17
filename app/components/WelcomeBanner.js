'use client';

/**
 * Sticky welcome banner shown to newly-signed-up or freshly-converted-to-Pro
 * users. Two visual variants pulled from one component:
 *
 *   "pro"     — Pro pass just activated. Premium gradient, congrats vibe.
 *   "welcome" — Fresh signup, no Pro yet. Lighter intro, points to the
 *               free 20 questions and the test.
 *
 * Dismissal sticks per-user via localStorage. Once dismissed, the banner
 * stays gone until the user clears storage or signs in on a new device.
 *
 * Placement: drop near the top of /, /test, and any post-auth landing.
 * The component returns null when there is nothing to show, so it is safe
 * to mount unconditionally.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';

export default function WelcomeBanner() {
  const { user, isPro, loading } = useAuth();
  const [dismissed, setDismissed] = useState(true); // start hidden, flip after we check storage
  const [variant, setVariant] = useState(null);
  const [lang, setLang] = useState('en');
  // Gate render on `ready` so the banner stays hidden during the entire auth
  // settle window — not just on first paint. Without it, supabase's
  // onAuthStateChange occasionally fires a second time with a fresh user
  // object reference, triggering the effect again and producing a 1-frame
  // flash where dismissed briefly resolves to false before the localStorage
  // re-check sets it back to true.
  const [ready, setReady] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- one-shot client-only auth-settle gating after mount */
  useEffect(() => {
    if (loading) return;
    if (!user) { setReady(true); return; }

    setLang(getSavedLang());
    const v = isPro ? 'pro' : 'welcome';
    const storageKey = `dmvsos_wb_${v}_${user.id}`;
    const wasDismissed = typeof window !== 'undefined' && localStorage.getItem(storageKey);
    setVariant(v);
    setDismissed(!!wasDismissed);
    setReady(true);
    // Depend on user.id (stable) instead of user (new reference each
    // onAuthStateChange tick). isPro change still re-runs and re-checks
    // dismissed against the new storage key (welcome → pro).
  }, [user?.id, isPro, loading]);

  if (!ready || !user || !variant || dismissed) return null;

  const tex = t[lang] || t.en;
  const isPremium = variant === 'pro';

  // Display name: prefer first part of full_name, fall back to email prefix
  // (stripped of any +suffix alias and of any dot-separators).
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
  const emailPrefix = (user.email || '').split('@')[0].split('+')[0].replace(/[._-]+/g, ' ').trim();
  const firstName = fullName.split(' ')[0] || emailPrefix.split(' ')[0] || '';

  function handleDismiss() {
    const storageKey = `dmvsos_wb_${variant}_${user.id}`;
    if (typeof window !== 'undefined') localStorage.setItem(storageKey, '1');
    setDismissed(true);
  }

  // CTA goes to the home state-selector (pick state → category → test), NOT a
  // param-less /test which drops the user into a defaulted, unselected test.
  function goToSelector() {
    const el = typeof document !== 'undefined' && document.getElementById('state-selector');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    else if (typeof window !== 'undefined') window.location.href = '/#state-selector';
  }

  // Copy with safe fallbacks — translations.js can ship keys later without
  // breaking the build.
  const proTitle = tex.welcomeBannerProTitle
    || (lang === 'ru' ? 'Pro доступ активирован'
       : lang === 'ua' ? 'Pro доступ активовано'
       : lang === 'es' ? 'Pro activado'
       : lang === 'zh' ? 'Pro 已激活'
       : 'Pro access unlocked');

  const proBody = tex.welcomeBannerProBody
    || (lang === 'ru' ? 'Все 50 штатов, 5 языков, marathon mode. 30 дней без ограничений.'
       : lang === 'ua' ? 'Усі 50 штатів, 5 мов, режим marathon. 30 днів без обмежень.'
       : lang === 'es' ? 'Los 50 estados, 5 idiomas, modo marathon. 30 días sin límites.'
       : lang === 'zh' ? '全部50州，5种语言，marathon模式。30天无限制。'
       : 'All 50 states, 5 languages, marathon mode. 30 days, no limits.');

  const proCta = tex.welcomeBannerProCta
    || (lang === 'ru' ? 'Начать тренировку'
       : lang === 'ua' ? 'Почати тренування'
       : lang === 'es' ? 'Empezar a practicar'
       : lang === 'zh' ? '开始练习'
       : 'Start practicing');

  const welcomeTitle = tex.welcomeBannerWelcomeTitle
    || (lang === 'ru' ? 'Добро пожаловать в DMVSOS'
       : lang === 'ua' ? 'Ласкаво просимо до DMVSOS'
       : lang === 'es' ? 'Bienvenido a DMVSOS'
       : lang === 'zh' ? '欢迎来到 DMVSOS'
       : 'Welcome to DMVSOS');

  const welcomeBody = tex.welcomeBannerWelcomeBody
    || (lang === 'ru' ? '20 вопросов бесплатно. Без карты, без подписки.'
       : lang === 'ua' ? '20 запитань безкоштовно. Без картки, без підписки.'
       : lang === 'es' ? '20 preguntas gratis. Sin tarjeta, sin suscripción.'
       : lang === 'zh' ? '20题免费。无需信用卡，无订阅。'
       : '20 questions free. No card, no subscription.');

  const welcomeCta = tex.welcomeBannerWelcomeCta
    || (lang === 'ru' ? 'Начать первый тест'
       : lang === 'ua' ? 'Почати перший тест'
       : lang === 'es' ? 'Empezar tu primer test'
       : lang === 'zh' ? '开始你的第一个测试'
       : 'Start your first test');

  // ── Pro celebration ─────────────────────────────────────────────────────
  if (isPremium) {
    return (
      <div className="relative w-full overflow-hidden animate-wb-fade-in"
           style={{
             background: 'linear-gradient(135deg, #0B1C3D 0%, #1E3A8A 50%, #F59E0B 130%)',
             boxShadow: '0 10px 25px -10px rgba(11, 28, 61, 0.25)',
           }}>
        {/* Subtle glow ring */}
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-20"
             style={{ background: 'radial-gradient(circle, #F59E0B 0%, transparent 70%)' }} />

        <div className="relative max-w-3xl mx-auto px-5 py-4 sm:py-5 flex items-center gap-4">
          <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center"
               style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
            <span className="text-2xl sm:text-3xl">🎉</span>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-white text-sm sm:text-base font-bold tracking-tight">
              {firstName ? `${firstName}, ${proTitle.toLowerCase()}` : proTitle}
            </p>
            <p className="text-white/80 text-xs sm:text-sm mt-0.5 truncate">
              {proBody}
            </p>
          </div>

          <button
            type="button"
            onClick={goToSelector}
            className="hidden sm:inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all hover:scale-[1.03]"
            style={{ background: '#F59E0B', color: '#0B1C3D' }}>
            {proCta}
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">
            ✕
          </button>
        </div>

        <style jsx>{`
          @keyframes wb-fade-in {
            from { opacity: 0; transform: translateY(-8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .animate-wb-fade-in {
            animation: wb-fade-in 0.4s ease-out;
          }
        `}</style>
      </div>
    );
  }

  // ── Signup welcome ──────────────────────────────────────────────────────
  return (
    <div className="relative w-full overflow-hidden animate-wb-fade-in"
         style={{
           background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)',
           borderBottom: '1px solid #E2E8F0',
         }}>
      <div className="max-w-3xl mx-auto px-5 py-4 sm:py-5 flex items-center gap-4">
        <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center bg-white shadow-sm border border-[#E2E8F0]">
          <span className="text-2xl sm:text-3xl">👋</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[#0B1C3D] text-sm sm:text-base font-bold tracking-tight">
            {firstName ? `${welcomeTitle}, ${firstName}` : welcomeTitle}
          </p>
          <p className="text-[#475569] text-xs sm:text-sm mt-0.5 truncate">
            {welcomeBody}
          </p>
        </div>

        <button
          type="button"
          onClick={goToSelector}
          className="hidden sm:inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all hover:scale-[1.03]"
          style={{ background: '#2563EB', color: 'white' }}>
          {welcomeCta}
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-[#475569] hover:bg-white/60 transition-colors">
          ✕
        </button>
      </div>

      <style jsx>{`
        @keyframes wb-fade-in {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-wb-fade-in {
          animation: wb-fade-in 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}
