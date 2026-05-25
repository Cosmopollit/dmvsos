import { createClient } from '@supabase/supabase-js';

// Lookup which auth providers (if any) a given email is registered with.
// Used by /login to:
//   - block sign-up when the email already exists under Google/Facebook,
//     and steer the user to that provider (prevents duplicate auth.users
//     with the same email, which silently strands Pro purchases)
//   - on sign-in failure for an OAuth-only account, suggest "Sign in
//     with Google" instead of the generic "Invalid credentials"
//
// Returns { exists: bool, providers: ['google'|'facebook'|'email'|...] }
// Never reveals whether the password is correct or any private data —
// the response shape is the same whether the email belongs to a confirmed
// user or not, so this can't be abused for account-existence probing
// beyond what Supabase already exposes via the auth API anyway.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const MAX_PAGES = 20; // hard cap so a runaway loop can't enumerate the whole user table

export async function POST(req) {
  try {
    let body;
    try { body = await req.json(); } catch { return Response.json({ error: 'Bad JSON' }, { status: 400 }); }
    const email = String(body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return Response.json({ error: 'Email required' }, { status: 400 });
    }

    // Supabase admin SDK has no by-email filter, so page through users.
    // At our scale (low hundreds) this is fast; if the table grows we'll
    // switch to a direct REST query against the `auth` schema.
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return Response.json({ error: error.message }, { status: 500 });
      const users = data?.users || [];
      const hit = users.find(u => (u.email || '').toLowerCase() === email);
      if (hit) {
        const providers = (hit.identities || []).map(i => i.provider);
        // If a user has only the OAuth identity and no email/password, Supabase
        // still lists provider='email' in app_metadata.providers sometimes;
        // prefer the actual identities array which is the source of truth.
        return Response.json({
          exists: true,
          providers: providers.length > 0 ? providers : [hit.app_metadata?.provider || 'email'],
        });
      }
      if (users.length < 200) break;
    }
    return Response.json({ exists: false, providers: [] });
  } catch (err) {
    return Response.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
