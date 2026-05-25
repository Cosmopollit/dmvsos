import { createClient } from '@supabase/supabase-js';

// Server-side account deletion.
//
// The client can't delete its own auth.users row — that requires the
// service-role key. So we do it here: validate the caller's JWT,
// double-check the user_id from the request body matches the token,
// then call auth.admin.deleteUser().
//
// FK CASCADE (defined in migration 001) removes active_passes rows
// automatically. profiles is keyed by email and has no FK, so its
// row is orphaned — harmless for now, can be cleaned up later if it
// matters (purely cosmetic for the admin UI).

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function POST(req) {
  try {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return Response.json({ error: 'Missing token' }, { status: 401 });

    // Verify token + extract user_id from it (don't trust the client to
    // send the user_id — they could send someone else's).
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return Response.json({ error: 'Invalid session' }, { status: 401 });
    }
    const userId = userData.user.id;
    const email  = userData.user.email;

    // Delete the auth row. FK CASCADE cleans active_passes.
    const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteErr) {
      return Response.json({ error: deleteErr.message }, { status: 500 });
    }

    // Best-effort cleanup of profiles by email (no FK, so it dangles).
    if (email) {
      await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?email=ilike.${encodeURIComponent(email)}`,
        {
          method: 'DELETE',
          headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      ).catch(() => {}); // non-fatal
    }

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
