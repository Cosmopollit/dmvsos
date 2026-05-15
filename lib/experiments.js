// Lightweight A/B experiment framework. No third-party SDK.
//
// How it works:
//   1. Each experiment lists its variants + traffic split.
//   2. variantFor(name, key) deterministically hashes a stable key
//      (user id, anon cookie, etc.) into a variant — same user always
//      gets the same variant for the life of the experiment.
//   3. logExposure() fires a fetch to /api/experiment/expose so we can
//      compute lift in Supabase. Idempotent per (user, experiment, day).
//
// Add a new experiment by appending to EXPERIMENTS below.
// Read it via `useExperiment('hero_copy')` in any client component.

import { useEffect, useState } from 'react';

export const EXPERIMENTS = {
  // Active experiments. status: 'running' | 'paused' | 'shipped' | 'killed'.
  hero_copy: {
    status: 'running',
    description: 'Test "Pass first try" vs "$50 retake" pain framing on hero',
    variants: { control: 0.5, retake_pain: 0.5 },
    primary_metric: 'signup',
  },
  pricing_anchor: {
    status: 'running',
    description: '$19.99/$29.99/$49.99 (current) vs $24.99/$34.99/$54.99',
    variants: { control: 0.5, higher: 0.5 },
    primary_metric: 'purchase',
  },
  free_questions_cap: {
    status: 'paused',
    description: 'Free wall at 20 vs 30 vs 50 questions',
    variants: { q20: 0.34, q30: 0.33, q50: 0.33 },
    primary_metric: 'signup_to_purchase',
  },
};

// FNV-1a 32-bit hash → uniform [0, 1)
function hash01(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h / 0xffffffff;
}

export function variantFor(experimentName, stableKey) {
  const exp = EXPERIMENTS[experimentName];
  if (!exp || exp.status !== 'running' || !stableKey) {
    return Object.keys(exp?.variants || { control: 1 })[0];
  }
  const x = hash01(`${experimentName}:${stableKey}`);
  let acc = 0;
  for (const [variant, weight] of Object.entries(exp.variants)) {
    acc += weight;
    if (x < acc) return variant;
  }
  return Object.keys(exp.variants)[0];
}

// Anonymous-but-stable identifier for non-logged-in visitors.
export function getAnonId() {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\s*)dmvsos_anon=([^;]+)/);
  if (m) return m[1];
  const id = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now());
  document.cookie = `dmvsos_anon=${id}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax`;
  return id;
}

let exposedThisSession = new Set();
function logExposure(experiment, variant, stableKey) {
  const key = `${experiment}:${variant}:${stableKey}`;
  if (exposedThisSession.has(key)) return;
  exposedThisSession.add(key);
  fetch('/api/experiment/expose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ experiment, variant, key: stableKey }),
    keepalive: true,
  }).catch(() => {});
}

// React hook — returns the assigned variant and fires exposure once.
export function useExperiment(name, userId) {
  const [variant, setVariant] = useState(() => Object.keys(EXPERIMENTS[name]?.variants || { control: 1 })[0]);

  useEffect(() => {
    const stableKey = userId || getAnonId();
    if (!stableKey) return;
    const v = variantFor(name, stableKey);
    setVariant(v);
    logExposure(name, v, stableKey);
  }, [name, userId]);

  return variant;
}
