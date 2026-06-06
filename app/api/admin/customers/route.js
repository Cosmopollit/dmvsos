// Admin-only customers dashboard data + account deletion.
// Password gate via X-Admin-Password header (matches the rest of /admin).
//
// GET    -> list every user with: signup date, sign-in, providers, active
//           passes (type + days left), and recent practice activity
//           (which state/category they train, how many sessions).
// DELETE -> cascade-remove one user: test_sessions + active_passes (by
//           user_id) + profiles (by email) + the auth.users row.

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { checkAdminPassword } from '@/lib/adminAuth';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REST_H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' };

const supabaseAdmin = createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MAX_PAGES = 30;
const VALID_PASS_TYPES = new Set(['auto', 'moto', 'cdl']);
const DAY_MS = 86400000;

function daysLeft(expiresAt) {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / DAY_MS) : 0;
}

// Readable backup password (no ambiguous chars), capitalized so it passes
// any "needs a letter" rule. The customer mostly logs in via the emailed
// magic link; this is the fallback they can type on any device.
function genPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  return out.charAt(0).toUpperCase() + out.slice(1);
}

async function findUserByEmail(lowerEmail) {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await fetch(`${SUPA_URL}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: REST_H });
    if (!r.ok) break;
    const d = await r.json();
    const users = d.users || [];
    const hit = users.find(u => (u.email || '').toLowerCase() === lowerEmail);
    if (hit) return hit;
    if (users.length < 200) break;
  }
  return null;
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

// Manually add / grant a customer (they paid directly, off-Stripe).
// Creates or reuses the auth user, sets a backup password, grants the pass,
// syncs the profile, and emails them a one-click magic link to log in.
export async function POST(req) {
  if (!checkAdminPassword(req.headers.get('x-admin-password'))) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const passType = String(body.pass_type || '').trim();
    let days = parseInt(body.days, 10);
    if (!email || !email.includes('@')) {
      return Response.json({ ok: false, error: 'Valid email required' }, { status: 400 });
    }
    if (!VALID_PASS_TYPES.has(passType)) {
      return Response.json({ ok: false, error: 'pass_type must be auto, moto, or cdl' }, { status: 400 });
    }
    if (!Number.isFinite(days) || days < 1) days = 30;

    // 1. Find or create the auth user.
    let user = await findUserByEmail(email);
    let alreadyExisted = !!user;
    const password = genPassword();

    if (!user) {
      const cr = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: REST_H,
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: { source: 'admin_manual_grant', created_at: new Date().toISOString() },
        }),
      });
      if (!cr.ok) {
        return Response.json({ ok: false, error: 'create user failed: ' + (await cr.text()).slice(0, 200) }, { status: 500 });
      }
      user = await cr.json();
    } else {
      // Reset password so the admin always has a fresh credential to share.
      await fetch(`${SUPA_URL}/auth/v1/admin/users/${user.id}`, {
        method: 'PUT',
        headers: REST_H,
        body: JSON.stringify({ password, email_confirm: true }),
      }).catch(() => {});
    }

    const userId = user.id;
    const expiresAt = new Date(Date.now() + days * DAY_MS).toISOString();

    // 2. Grant / extend the pass (upsert by user_id + pass_type).
    await fetch(`${SUPA_URL}/rest/v1/active_passes?on_conflict=user_id,pass_type`, {
      method: 'POST',
      headers: { ...REST_H, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: userId, pass_type: passType, expires_at: expiresAt }),
    });

    // 3. Keep the legacy profile in sync (id = auth.users.id).
    const planExpRes = await fetch(`${SUPA_URL}/rest/v1/active_passes?user_id=eq.${userId}&select=expires_at&order=expires_at.desc&limit=1`, { headers: REST_H });
    const planRows = planExpRes.ok ? await planExpRes.json() : [];
    const maxExp = planRows[0]?.expires_at || expiresAt;
    const upd = await fetch(`${SUPA_URL}/rest/v1/profiles?email=ilike.${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: { ...REST_H, Prefer: 'return=representation' },
      body: JSON.stringify({ is_pro: true, plan_type: passType, plan_expires_at: maxExp }),
    });
    const updated = upd.ok ? await upd.json() : [];
    if (!updated.length) {
      await fetch(`${SUPA_URL}/rest/v1/profiles`, {
        method: 'POST',
        headers: REST_H,
        body: JSON.stringify({ id: userId, email, is_pro: true, plan_type: passType, plan_expires_at: maxExp }),
      }).catch(() => {});
    }

    // 4. Email the customer a one-click login link (sent via the configured
    //    SMTP / Resend). This is what "arrives" to them; the password above
    //    is the backup the admin can also hand over.
    let emailed = false;
    try {
      const ml = await fetch(`${SUPA_URL}/auth/v1/magiclink`, {
        method: 'POST',
        headers: REST_H,
        body: JSON.stringify({ email, options: { redirectTo: 'https://dmvsos.com/' } }),
      });
      emailed = ml.ok;
    } catch { emailed = false; }

    return Response.json({
      ok: true,
      email,
      password,
      pass_type: passType,
      days,
      expires_at: expiresAt,
      alreadyExisted,
      emailed,
    });
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
