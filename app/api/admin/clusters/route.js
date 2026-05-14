import { createClient } from '@supabase/supabase-js';
import { checkAdminPassword } from '@/lib/adminAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LANGS = ['ru', 'es', 'zh', 'ua'];
const hasCyrillic = (s) => /[Ѐ-ӿ]/.test(s || '');
const hasCJK      = (s) => /[一-鿿]/.test(s || '');

function langStatus(row, lang, enText) {
  if (!row) return 'missing';
  if (row.translation_stale_at) return 'stale';
  const text = `${row.question_text || ''} ${row.option_a || ''} ${row.option_b || ''} ${row.option_c || ''} ${row.option_d || ''}`;
  if (lang === 'ru' || lang === 'ua') return hasCyrillic(text) ? 'ok' : 'fallback';
  if (lang === 'zh') return hasCJK(text) ? 'ok' : 'fallback';
  if (lang === 'es') return row.question_text === enText ? 'fallback' : 'ok';
  return 'ok';
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'Bad JSON' }, { status: 400 }); }

  const { password, state, category, subcategory, page = 0, pageSize = 50, search = '', filter = '' } = body;

  if (!checkAdminPassword(password)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!state || !category) return Response.json({ error: 'state and category required' }, { status: 400 });

  // Fetch EN clusters for this state/cat/sub
  let enQuery = supabase
    .from('questions')
    .select('id,cluster_code,state,category,subcategory,question_text,option_a,option_b,option_c,option_d,correct_answer,image_url,manual_section,quality_score,quality_issues,translation_stale_at', { count: 'exact' })
    .eq('state', state)
    .eq('category', category)
    .eq('language', 'en')
    .not('cluster_code', 'is', null)
    .order('cluster_code', { ascending: true });

  if (subcategory) enQuery = enQuery.eq('subcategory', subcategory);
  else if (category === 'cdl') enQuery = enQuery.is('subcategory', null);

  // Server-side search on EN text or cluster_code
  if (search.trim()) {
    const s = search.trim().replace(/[%]/g, '');
    enQuery = enQuery.or(`cluster_code.ilike.%${s}%,question_text.ilike.%${s}%`);
  }

  const { data: enRows, error: enErr, count: totalEn } = await enQuery.range(
    page * pageSize,
    page * pageSize + pageSize - 1
  );
  if (enErr) return Response.json({ error: enErr.message }, { status: 500 });

  const enRowList = enRows || [];
  const clusterCodes = enRowList.map(r => r.cluster_code);

  // Fetch all non-EN rows for these clusters in one query
  let translations = [];
  if (clusterCodes.length > 0) {
    const { data, error } = await supabase
      .from('questions')
      .select('id,cluster_code,language,question_text,option_a,option_b,option_c,option_d,quality_score,quality_issues,translation_stale_at,subcategory')
      .eq('state', state)
      .eq('category', category)
      .in('cluster_code', clusterCodes)
      .in('language', LANGS);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    translations = data || [];
  }

  // Group translations by (cluster_code, lang)
  const trByCluster = new Map();
  for (const t of translations) {
    if (subcategory && t.subcategory !== subcategory) continue;
    const map = trByCluster.get(t.cluster_code) || {};
    map[t.language] = t;
    trByCluster.set(t.cluster_code, map);
  }

  // Build cluster rows
  const clusters = enRowList.map((en) => {
    const tMap = trByCluster.get(en.cluster_code) || {};
    const langStatuses = {};
    for (const l of LANGS) langStatuses[l] = langStatus(tMap[l], l, en.question_text);

    return {
      cluster_code:   en.cluster_code,
      state:          en.state,
      category:       en.category,
      subcategory:    en.subcategory,
      en_id:          en.id,
      en_text:        en.question_text,
      en_correct:     ['A','B','C','D'][en.correct_answer] || '?',
      image_url:      en.image_url || null,
      manual_section: en.manual_section || null,
      quality_score:  en.quality_score,
      quality_issues: en.quality_issues || [],
      en_stale:       en.translation_stale_at != null,
      lang_status:    langStatuses,
    };
  });

  // Apply client-side filter (cannot push to DB without view)
  let filtered = clusters;
  if (filter) {
    if (filter === 'has_fallback') filtered = clusters.filter(c => LANGS.some(l => c.lang_status[l] === 'fallback'));
    else if (filter === 'has_missing') filtered = clusters.filter(c => LANGS.some(l => c.lang_status[l] === 'missing'));
    else if (filter === 'has_stale') filtered = clusters.filter(c => c.en_stale || LANGS.some(l => c.lang_status[l] === 'stale'));
    else if (filter === 'low_quality') filtered = clusters.filter(c => c.quality_score != null && c.quality_score <= 3);
    else if (filter === 'unverified') filtered = clusters.filter(c => c.quality_score == null);
    else if (filter === 'has_issues') filtered = clusters.filter(c => (c.quality_issues || []).length > 0);
  }

  return Response.json({
    ok: true,
    page,
    pageSize,
    totalEn: totalEn ?? 0,
    returned: filtered.length,
    clusters: filtered,
  });
}
