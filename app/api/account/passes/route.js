import { createClient } from '@supabase/supabase-js';

// Return the caller's active passes — but searching by email, not just
// by the current session's user_id.
//
// Why: with Supabase you can end up with multiple auth.users rows
// sharing one email (typical case: Google OAuth user starts a new
// session via email/password). Pro passes are foreign-keyed to user_id,
// so the alternate user_id can't see them. This endpoint walks every
// auth.users row with the same email, unions their active_passes, and
// returns the result so AuthContext can grant Pro regardless of which
// auth row the user is currently signed in under.
//
// Falls back to the legacy profiles row (matched by email) if there's
// no active_passes hit but a legacy plan is still alive.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REST_H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const MAX_PAGES = 20;

export async function GET(req) {
  try {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return Response.json({ error: 'Missing token' }, { status: 401 });

    // Validate the caller's session, extract their email.
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user?.email) {
      return Response.json({ error: 'Invalid session' }, { status: 401 });
    }
    const email = userData.user.email.toLowerCase();

    // Find every auth.users.id that shares this email. The caller's own
    // user_id is always included (they're authenticated via a valid JWT).
    // Other matching user_ids are included ONLY if their email is
    // confirmed — otherwise an attacker who signs up with the victim's
    // email (creating an unconfirmed auth.users row) would, after the
    // victim later signs in with Google, gain the ability to see passes
    // via this endpoint if/when they ever got a session. Limiting to
    // confirmed accounts closes that path.
    const userIds = new Set([userData.user.id]);
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      const users = data?.users || [];
      for (const u of users) {
        if (u.id === userData.user.id) continue;
        if ((u.email || '').toLowerCase() !== email) continue;
        if (!u.email_confirmed_at) continue;
        userIds.add(u.id);
      }
      if (users.length < 200) break;
    }
    // A genuine duplicate-account event is very rare after the collision
    // detection on /login — surface it so we notice if Step B starts
    // failing or someone gets through a race.
    if (userIds.size > 1) {
      console.warn(`[passes] cross-account union for ${email}: ${userIds.size} confirmed user_ids`);
    }

    // Union active_passes across all the matching user_ids.
    const ids = [...userIds];
    let activePasses = [];
    if (ids.length > 0) {
      const r = await fetch(
        `${SB}/rest/v1/active_passes?select=user_id,pass_type,expires_at&user_id=in.(${ids.join(',')})`,
        { headers: REST_H }
      );
      if (r.ok) activePasses = await r.json();
    }

    // Legacy profile fallback (subscription/one-time pre-migration users
    // whose Pro status is still in profiles.plan_type rather than
    // active_passes).
    const profR = await fetch(
      `${SB}/rest/v1/profiles?select=plan_type,plan_expires_at&email=ilike.${encodeURIComponent(email)}&limit=1`,
      { headers: REST_H }
    );
    let legacyProfile = null;
    if (profR.ok) {
      const rows = await profR.json();
      legacyProfile = rows?.[0] || null;
    }

    return Response.json({
      email,
      user_ids: ids,
      active_passes: activePasses,
      legacy_profile: legacyProfile,
    });
  } catch (err) {
    return Response.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
