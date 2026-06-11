// Admin CRUD for the per-state DMV document guide (state_documents table).
// Password gate via X-Admin-Password header (matches the rest of /admin).
//
// GET  -> every state row (drafts included) so the editor can show progress.
// POST -> upsert one state's row. Publishing requires an official_url, so we
//         never publish unverified legal requirements.

import { createClient } from '@supabase/supabase-js';
import { checkAdminPassword } from '@/lib/adminAuth';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SLUG_RE = /^[a-z-]{3,40}$/;

export async function GET(req) {
  if (!checkAdminPassword(req.headers.get('x-admin-password'))) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const { data, error } = await supabaseAdmin
    .from('state_documents')
    .select('*')
    .order('state', { ascending: true });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, rows: data || [] });
}

export async function POST(req) {
  if (!checkAdminPassword(req.headers.get('x-admin-password'))) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'bad json' }, { status: 400 }); }

  const state = String(body.state || '').trim().toLowerCase();
  if (!SLUG_RE.test(state)) {
    return Response.json({ ok: false, error: 'invalid state slug' }, { status: 400 });
  }

  const status = body.status === 'published' ? 'published' : 'draft';
  const officialUrl = (body.official_url || '').trim();

  // Guardrail: never publish legal requirements without a source link.
  if (status === 'published' && !officialUrl) {
    return Response.json(
      { ok: false, error: 'official_url required to publish' },
      { status: 400 },
    );
  }

  // Normalize doc_groups to [{ group, accepts:[], note }].
  const docGroups = Array.isArray(body.doc_groups)
    ? body.doc_groups
        .map((g) => ({
          group: String(g?.group || '').trim(),
          accepts: Array.isArray(g?.accepts) ? g.accepts.map((a) => String(a).trim()).filter(Boolean) : [],
          note: String(g?.note || '').trim() || undefined,
        }))
        .filter((g) => g.group)
    : [];

  const row = {
    state,
    agency: (body.agency || '').trim() || null,
    official_url: officialUrl || null,
    real_id_note: (body.real_id_note || '').trim() || null,
    doc_groups: docGroups,
    needs_translation: body.needs_translation !== false,
    status,
    updated_at: new Date().toISOString(),
    updated_by: 'admin',
  };

  const { error } = await supabaseAdmin
    .from('state_documents')
    .upsert(row, { onConflict: 'state' });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, state, status });
}
