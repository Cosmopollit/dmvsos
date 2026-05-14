import { createClient } from '@supabase/supabase-js';
import { checkAdminPassword } from '@/lib/adminAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── config ────────────────────────────────────────────────────────────────

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const ALL_LANGS = ['ru', 'es', 'zh', 'ua'];
const LANG_NAMES = {
  ru: 'Russian',
  es: 'Spanish',
  zh: 'Chinese (Simplified)',
  ua: 'Ukrainian',
};

const hasCyrillic = (s) => /[Ѐ-ӿ]/.test(s || '');
const hasCJK      = (s) => /[一-鿿]/.test(s || '');

// Quality gate: returns true if translated row passes language plausibility check.
function passesQualityGate(translated, lang, enText) {
  const blob = `${translated.question_text || ''} ${translated.option_a || ''} ${translated.option_b || ''} ${translated.option_c || ''} ${translated.option_d || ''}`;
  if (lang === 'ru' || lang === 'ua') return hasCyrillic(blob);
  if (lang === 'zh') return hasCJK(blob);
  if (lang === 'es') return translated.question_text && translated.question_text !== enText;
  return false;
}

// ─── Anthropic helpers ─────────────────────────────────────────────────────

const TOOL_SCHEMA = {
  name: 'submit_translation',
  description: 'Submit the translation for a single DMV test question.',
  input_schema: {
    type: 'object',
    properties: {
      question_text: { type: 'string' },
      option_a:      { type: 'string' },
      option_b:      { type: 'string' },
      option_c:      { type: 'string' },
      option_d:      { type: 'string' },
      explanation:   { type: ['string', 'null'] },
    },
    required: ['question_text', 'option_a', 'option_b', 'option_c', 'option_d'],
  },
};

function buildPrompt(en, langName) {
  return `Translate this US DMV/DOL test question from English to ${langName}, then call the submit_translation tool with the result.

Rules:
- Translate naturally; for road signs and traffic terms use standard ${langName} traffic vocabulary.
- Do NOT translate: DMV, CDL, BAC, mph, ft, psi, abbreviations like ABS/CDL, URLs, proper nouns.
- If explanation is null in input, return null.
- Preserve meaning exactly — wrong-answer options must remain plausible distractors.

Input:
Question: ${en.question_text}
A: ${en.option_a}
B: ${en.option_b}
C: ${en.option_c}
D: ${en.option_d}
Explanation: ${en.explanation || 'null'}`;
}

async function callAnthropic(prompt, maxTokens = 2048) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: maxTokens,
      tools: [TOOL_SCHEMA],
      tool_choice: { type: 'tool', name: TOOL_SCHEMA.name },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const toolUse = data.content?.find(b => b.type === 'tool_use');
  if (!toolUse) throw new Error('No tool_use in response');
  return toolUse.input;
}

async function translateOne(en, lang) {
  const prompt = buildPrompt(en, LANG_NAMES[lang]);
  const out = await callAnthropic(prompt);
  if (!out?.question_text) throw new Error('Missing question_text in tool output');
  return out;
}

// ─── DB upsert ─────────────────────────────────────────────────────────────

async function fetchTranslationRow(en, lang) {
  let q = supabase
    .from('questions')
    .select('id')
    .eq('cluster_code', en.cluster_code)
    .eq('state', en.state)
    .eq('category', en.category)
    .eq('language', lang)
    .limit(1);
  if (en.subcategory) q = q.eq('subcategory', en.subcategory);
  else if (en.category === 'cdl') q = q.is('subcategory', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

async function upsertTranslation(en, lang, translated) {
  const existing = await fetchTranslationRow(en, lang);
  const payload = {
    question_text:  translated.question_text,
    option_a:       translated.option_a,
    option_b:       translated.option_b,
    option_c:       translated.option_c,
    option_d:       translated.option_d,
    explanation:    translated.explanation || null,
    translation_stale_at: null,
  };

  if (existing) {
    const { error } = await supabase.from('questions').update(payload).eq('id', existing.id);
    if (error) throw new Error(error.message);
    return { action: 'updated', id: existing.id };
  }

  // Create new row inheriting all metadata from EN
  const insertRow = {
    state:            en.state,
    category:         en.category,
    subcategory:      en.subcategory ?? null,
    language:         lang,
    cluster_code:     en.cluster_code,
    correct_answer:   en.correct_answer,
    image_url:        en.image_url ?? null,
    manual_reference: en.manual_reference ?? null,
    manual_section:   en.manual_section ?? null,
    manual_version:   en.manual_version ?? null,
    ...payload,
  };
  const { data, error } = await supabase.from('questions').insert(insertRow).select('id').single();
  if (error) throw new Error(error.message);
  return { action: 'inserted', id: data.id };
}

// ─── handler ───────────────────────────────────────────────────────────────

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'Bad JSON' }, { status: 400 }); }

  const { password, cluster_code, state, category, subcategory, langs } = body;
  if (!checkAdminPassword(password)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!cluster_code || !state || !category) {
    return Response.json({ error: 'cluster_code, state, category required' }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set on server' }, { status: 500 });
  }

  // Fetch EN row (source of truth)
  let q = supabase
    .from('questions')
    .select('id,state,category,subcategory,language,cluster_code,question_text,option_a,option_b,option_c,option_d,explanation,correct_answer,image_url,manual_reference,manual_section,manual_version')
    .eq('cluster_code', cluster_code)
    .eq('state', state)
    .eq('category', category)
    .eq('language', 'en')
    .limit(1);
  if (subcategory) q = q.eq('subcategory', subcategory);
  else if (category === 'cdl') q = q.is('subcategory', null);
  const { data: enRows, error: enErr } = await q;
  if (enErr) return Response.json({ error: enErr.message }, { status: 500 });
  if (!enRows?.length) return Response.json({ error: 'EN row not found for cluster' }, { status: 404 });

  const en = enRows[0];
  const targetLangs = Array.isArray(langs) && langs.length > 0
    ? langs.filter(l => ALL_LANGS.includes(l))
    : ALL_LANGS;

  // Parallel translation
  const results = await Promise.all(targetLangs.map(async (lang) => {
    try {
      const translated = await translateOne(en, lang);
      if (!passesQualityGate(translated, lang, en.question_text)) {
        return { lang, ok: false, error: 'failed_quality_gate' };
      }
      const r = await upsertTranslation(en, lang, translated);
      return { lang, ok: true, action: r.action };
    } catch (err) {
      return { lang, ok: false, error: err.message.slice(0, 200) };
    }
  }));

  const success = results.filter(r => r.ok).length;
  const errors  = results.filter(r => !r.ok);
  return Response.json({
    ok: true,
    cluster_code,
    success,
    total: results.length,
    results,
    errors: errors.length > 0 ? errors : undefined,
  });
}
