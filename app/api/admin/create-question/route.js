import { createClient } from '@supabase/supabase-js';
import { checkAdminPassword } from '@/lib/adminAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STATE_ABBR = {
  'alabama':'al','alaska':'ak','arizona':'az','arkansas':'ar','california':'ca',
  'colorado':'co','connecticut':'ct','delaware':'de','florida':'fl','georgia':'ga',
  'hawaii':'hi','idaho':'id','illinois':'il','indiana':'in','iowa':'ia','kansas':'ks',
  'kentucky':'ky','louisiana':'la','maine':'me','maryland':'md','massachusetts':'ma',
  'michigan':'mi','minnesota':'mn','mississippi':'ms','missouri':'mo','montana':'mt',
  'nebraska':'ne','nevada':'nv','new-hampshire':'nh','new-jersey':'nj','new-mexico':'nm',
  'new-york':'ny','north-carolina':'nc','north-dakota':'nd','ohio':'oh','oklahoma':'ok',
  'oregon':'or','pennsylvania':'pa','rhode-island':'ri','south-carolina':'sc',
  'south-dakota':'sd','tennessee':'tn','texas':'tx','utah':'ut','vermont':'vt',
  'virginia':'va','washington':'wa','west-virginia':'wv','wisconsin':'wi','wyoming':'wy',
};

const SUB_TOKEN = {
  general_knowledge: 'gk',
  air_brakes: 'ab',
  combination_vehicles: 'cv',
};

// Find next free numeric suffix in {state, category, subcategory} namespace
async function nextFreeClusterCode(state, category, subcategory) {
  const abbr = STATE_ABBR[state] || state;
  const tok = subcategory ? SUB_TOKEN[subcategory] : null;
  const prefix = category === 'cdl' && tok
    ? `${abbr}_cdl_${tok}_`
    : `${abbr}_${category}_`;

  let q = supabase
    .from('questions')
    .select('cluster_code')
    .eq('state', state)
    .eq('category', category)
    .eq('language', 'en')
    .like('cluster_code', `${prefix}%`);
  if (subcategory) q = q.eq('subcategory', subcategory);
  else if (category === 'cdl') q = q.is('subcategory', null);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const used = new Set();
  for (const r of data || []) {
    const m = r.cluster_code?.match(/_(\d+)$/);
    if (m) used.add(parseInt(m[1], 10));
  }
  let n = used.size > 0 ? Math.max(...used) + 1 : 1;
  while (used.has(n)) n++;
  return `${prefix}${String(n).padStart(3, '0')}`;
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return Response.json({ error: 'Bad JSON' }, { status: 400 });

    const {
      password, state, category, subcategory,
      question_text, option_a, option_b, option_c, option_d,
      correct_answer, explanation, image_url, manual_reference, manual_section,
    } = body;

    if (!checkAdminPassword(password)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Validate required
    if (!state || !category) return Response.json({ error: 'state + category required' }, { status: 400 });
    if (!question_text?.trim()) return Response.json({ error: 'question_text required' }, { status: 400 });
    for (const [k, v] of [['option_a', option_a], ['option_b', option_b], ['option_c', option_c], ['option_d', option_d]]) {
      if (!v?.trim()) return Response.json({ error: `${k} required` }, { status: 400 });
    }
    if (typeof correct_answer !== 'number' || correct_answer < 0 || correct_answer > 3) {
      return Response.json({ error: 'correct_answer must be 0-3' }, { status: 400 });
    }
    if (category === 'cdl' && !subcategory) {
      return Response.json({ error: 'CDL requires subcategory (general_knowledge | air_brakes | combination_vehicles)' }, { status: 400 });
    }

    // Generate unique cluster_code
    const cluster_code = await nextFreeClusterCode(state, category, subcategory);

    const row = {
      state,
      category,
      subcategory: subcategory || null,
      language: 'en',
      cluster_code,
      question_text:  question_text.trim(),
      option_a:       option_a.trim(),
      option_b:       option_b.trim(),
      option_c:       option_c.trim(),
      option_d:       option_d.trim(),
      correct_answer,
      explanation:    explanation?.trim() || null,
      image_url:      image_url?.trim() || null,
      manual_reference: manual_reference?.trim() || null,
      manual_section: manual_section?.trim() || null,
    };

    const { data, error } = await supabase
      .from('questions')
      .insert(row)
      .select('id,cluster_code')
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ ok: true, id: data.id, cluster_code: data.cluster_code });
  } catch (err) {
    console.error('create-question error:', err?.message || err);
    return Response.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
