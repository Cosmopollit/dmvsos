'use client';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

// Finishes the magic-link checkout journey. The in-app-browser buy flow
// (/upgrade email form -> /api/checkout-intent -> Supabase magic link) lands
// the user on the bare origin in their REAL browser with a fresh session and
// user_metadata.checkout_intent stamped. This component consumes that intent
// once: clears it (so it can't re-fire on other devices or later logins) and
// routes to /upgrade with intent=checkout, whose auto-resume effect launches
// Stripe without another Buy click.
export default function CheckoutIntentResume() {
  const { user } = useAuth();
  const consumedRef = useRef(false);

  useEffect(() => {
    if (!user?.id || consumedRef.current) return;
    const ci = user.user_metadata?.checkout_intent;
    if (!ci?.plan) return;
    consumedRef.current = true;

    // Stale intents (older than 24h) are cleared but not acted on - nobody
    // expects a Stripe page to pop from a week-old email.
    const fresh = typeof ci.ts === 'number' && Date.now() - ci.ts < 24 * 60 * 60 * 1000;

    supabase.auth.updateUser({ data: { checkout_intent: null } })
      .catch(() => { /* clearing is best-effort; the 24h window caps replays */ })
      .finally(() => {
        if (!fresh) return;
        const lang = ci.lang || 'en';
        // Full navigation (not router.push): this component lives outside any
        // page, and /upgrade must mount fresh with the session resolved so its
        // auto-checkout effect fires.
        window.location.assign(`/upgrade?plan=${encodeURIComponent(ci.plan)}&lang=${encodeURIComponent(lang)}&intent=checkout`);
      });
  }, [user?.id, user?.user_metadata]);

  return null;
}
