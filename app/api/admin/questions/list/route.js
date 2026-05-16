// Admin-only: list questions by state/category/language/subcategory.
// Replaces the prior client-side anon-key fetch so RLS on questions can be enabled.

import { checkAdminPassword } from '@/lib/adminAuth';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

export async function POST(request) {
  const pw = request.headers.get('x-admin-password');
  if (!checkAdminPassword(pw)) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const { state, category, language, subcategory } = await request.json();
    if (!state || !category || !language) {
      return Response.json({ error: 'state/category/language required' }, { status: 400 });
    }
    const params = new URLSearchParams({
      select: '*',
      state: 'eq.' + state,
      category: 'eq.' + category,
      language: 'eq.' + language,
      order: 'id.asc',
    });
    if (subcategory) params.set('subcategory', 'eq.' + subcategory);
    const r = await fetch(SUPA_URL + '/rest/v1/questions?' + params, { headers: H });
    if (!r.ok) return Response.json({ error: 'db ' + r.status, detail: await r.text() }, { status: 500 });
    const data = await r.json();
    return Response.json({ data });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
