// Admin-only: fetch all language variants of a question cluster.
// Used by admin's edit-all-languages flow and delete-confirmation flow.

import { checkAdminPassword } from '@/lib/adminAuth';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY };

export async function POST(request) {
  const pw = request.headers.get('x-admin-password');
  if (!checkAdminPassword(pw)) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const { cluster_code, state, category, columns } = await request.json();
    if (!cluster_code || !state || !category) {
      return Response.json({ error: 'cluster_code/state/category required' }, { status: 400 });
    }
    const sel = (typeof columns === 'string' && columns.length > 0) ? columns : '*';
    const params = new URLSearchParams({
      select: sel,
      cluster_code: 'eq.' + cluster_code,
      state: 'eq.' + state,
      category: 'eq.' + category,
    });
    const r = await fetch(SUPA_URL + '/rest/v1/questions?' + params, { headers: H });
    if (!r.ok) return Response.json({ error: 'db ' + r.status, detail: await r.text() }, { status: 500 });
    const data = await r.json();
    return Response.json({ data });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
