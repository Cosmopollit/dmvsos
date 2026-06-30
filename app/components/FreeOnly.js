'use client';
import { useAuth } from '@/lib/AuthContext';

// Renders its children only for users who have NOT paid. Used to hide upsell
// cards and free-tier copy ("Unlock Full Access", "start free", "20 free
// questions") from someone who already bought a pass.
//
// Shown by default (during the brief auth-loading window, for SSR, and for
// crawlers) so free users + Google see the CTA immediately; it hides once
// `isPro` resolves true. A paid user may see a sub-second flash before it
// disappears — acceptable, and far better than the upsell staying up.
export default function FreeOnly({ children }) {
  const { isPro } = useAuth();
  if (isPro) return null;
  return children;
}
