// Admin-only customers dashboard data + account deletion.
// Password gate via X-Admin-Password header (matches the rest of /admin).
//
// GET    -> list every user with: signup date, sign-in, providers, active
//           passes (type + days left), and recent practice activity
//           (which state/category they train, how many sessions).
// DELETE -> cascade-remove one user: test_sessions + active_passes (by
//           user_id) + profiles (by email) + the auth.users row.

import { createClient } from '@supabase/supabase-js';
import { checkAdminPassword } from '@/lib/adminAuth';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REST_H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' };

const supabaseAdmin = createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MAX_PAGES = 30;

function daysLeft(expiresAt) {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86400000) : 0;
}

export async function GET(req) {
  if (!checkAdminPassword(req.headers.get('x-admin-password'))) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    // 1. All auth.users (paginated).
    const users = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await fetch(`${SUPA_URL}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: REST_H });
      if (!r.ok) break;
      const d = await r.json();
      const batch = d.users || [];
      users.push(...batch);
      if (batch.length < 200) break;
    }

    // 2. Bulk-fetch passes, sessions, profiles (dataset is small).
    const [passesRes, sessionsRes, profilesRes] = await Promise.all([
      fetch(`${SUPA_URL}/rest/v1/active_passes?select=user_id,pass_type,expires_at,created_at&order=created_at.desc`, { headers: REST_H }),
      fetch(`${SUPA_URL}/rest/v1/test_sessions?select=user_id,state,category,score,total,created_at&order=created_at.desc&limit=2000`, { headers: REST_H }),
      fetch(`${SUPA_URL}/rest/v1/profiles?select=email,plan_type,plan_expires_at,is_pro,stripe_customer_id`, { headers: REST_H }),
    ]);
    const passes = passesRes.ok ? await passesRes.json() : [];
    const sessions = sessionsRes.ok ? await sessionsRes.json() : [];
    const profiles = profilesRes.ok ? await profilesRes.json() : [];

    const passByUser = new Map();
    for (const p of passes) {
      if (!passByUser.has(p.user_id)) passByUser.set(p.user_id, []);
      passByUser.get(p.user_id).push(p);
    }
    const sessByUser = new Map();
    for (const s of sessions) {
      if (!sessByUser.has(s.user_id)) sessByUser.set(s.user_id, []);
      sessByUser.get(s.user_id).push(s);
    }
    const profByEmail = new Map();
    for (const pr of profiles) profByEmail.set((pr.email || '').toLowerCase(), pr);

    const rows = users.map(u => {
      const email = (u.email || '').toLowerCase();
      const userPasses = (passByUser.get(u.id) || []).map(p => ({
        type: p.pass_type,
        expires_at: p.expires_at,
        daysLeft: daysLeft(p.expires_at),
      }));
      const userSessions = sessByUser.get(u.id) || [];
      const last = userSessions[0] || null;
      const prof = profByEmail.get(email) || null;

      // Legacy profile pass fallback (older buyers tracked in profiles).
      const legacyDays = prof?.plan_expires_at ? daysLeft(prof.plan_expires_at) : 0;
      const hasActive = userPasses.some(p => p.daysLeft > 0) || legacyDays > 0;

      return {
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        providers: (u.identities || []).map(i => i.provider),
        passes: userPasses,
        legacyPlan: prof?.plan_type || null,
        legacyDaysLeft: legacyDays,
        hasActive,
        stripeCustomer: !!prof?.stripe_customer_id,
        sessionCount: userSessions.length,
        lastSession: last
          ? { state: last.state, category: last.category, score: last.score, total: last.total, created_at: last.created_at }
          : null,
      };
    });

    // Sort: active-pass holders first, then by most recent signup.
    rows.sort((a, b) => {
      if (a.hasActive !== b.hasActive) return a.hasActive ? -1 : 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    return Response.json({ ok: true, count: rows.length, customers: rows });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  if (!checkAdminPassword(req.headers.get('x-admin-password'))) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const { user_id, email } = await req.json().catch(() => ({}));
    if (!user_id || typeof user_id !== 'string') {
      return Response.json({ ok: false, error: 'user_id required' }, { status: 400 });
    }

    // Cascade: child tables first, then the auth row. active_passes has an
    // FK CASCADE on auth.users delete, but we remove it explicitly anyway so
    // the result is deterministic regardless of FK config. profiles is keyed
    // by email (no FK) so it must be removed by email.
    await fetch(`${SUPA_URL}/rest/v1/test_sessions?user_id=eq.${user_id}`, { method: 'DELETE', headers: REST_H }).catch(() => {});
    await fetch(`${SUPA_URL}/rest/v1/active_passes?user_id=eq.${user_id}`, { method: 'DELETE', headers: REST_H }).catch(() => {});
    if (email) {
      await fetch(`${SUPA_URL}/rest/v1/profiles?email=ilike.${encodeURIComponent(email)}`, { method: 'DELETE', headers: REST_H }).catch(() => {});
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
    if (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
