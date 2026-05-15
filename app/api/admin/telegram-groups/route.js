// Admin-only: fetch list of groups bot is in + recent keyword hits.
// Password gate via X-Admin-Password header (matches /admin pattern).

import { checkAdminPassword } from '@/lib/adminAuth';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const H = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
};

export async function GET(request) {
  const pw = request.headers.get('x-admin-password');
  if (!checkAdminPassword(pw)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const [groupsRes, hitsRes] = await Promise.all([
      fetch(`${SUPA_URL}/rest/v1/bot_groups?select=*&order=added_at.desc`, { headers: H }),
      fetch(`${SUPA_URL}/rest/v1/bot_keyword_hits?select=*&order=created_at.desc&limit=100`, { headers: H }),
    ]);
    const groups = groupsRes.ok ? await groupsRes.json() : [];
    const hits = hitsRes.ok ? await hitsRes.json() : [];

    // Aggregate keyword stats
    const kwCounts = {};
    const stateCounts = {};
    for (const h of hits) {
      kwCounts[h.matched_keyword] = (kwCounts[h.matched_keyword] || 0) + 1;
      if (h.matched_state) stateCounts[h.matched_state] = (stateCounts[h.matched_state] || 0) + 1;
    }
    const topKeywords = Object.entries(kwCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const topStates = Object.entries(stateCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    return Response.json({
      ok: true,
      groups,
      hits,
      stats: {
        active_groups: groups.filter(g => !g.removed_at && g.enabled).length,
        total_replies: groups.reduce((s, g) => s + (g.reply_count || 0), 0),
        topKeywords,
        topStates,
      },
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
