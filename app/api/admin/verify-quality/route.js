import { createClient } from '@supabase/supabase-js';
import { checkAdminPassword } from '@/lib/adminAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Default to Haiku for quality grading — structured tool task, 3× cheaper,
// much higher throughput, rarely overloaded. Pass `?model=sonnet` query or
// `model: 'sonnet'` in request body to upgrade per call.
const HAIKU_MODEL  = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MODEL = HAIKU_MODEL;

// ─── Sonnet tool schema ────────────────────────────────────────────────────

const TOOL = {
  name: 'submit_verification',
  description: 'Submit DMV question quality + correctness verification',
  input_schema: {
    type: 'object',
    properties: {
      correctness_verdict: {
        type: 'string',
        enum: ['correct', 'wrong', 'ambiguous', 'invalid'],
        description: 'correct = correct_answer index points at the right option; wrong = a different option is the correct one; ambiguous = multiple options could be correct; invalid = question itself is broken/nonsense',
      },
      correctness_evidence: {
        type: 'string',
        description: '1-2 sentence justification, optionally citing a manual section if provided',
      },
      quality_score: {
        type: 'integer',
        minimum: 1,
        maximum: 5,
        description: '5 = eligible for real DMV-style test (all 4 options plausible, tests real knowledge); 1 = trash (obviously nonsense distractors, trivia, broken)',
      },
      quality_issues: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['absurd_distractor', 'multiple_correct', 'trivia_question', 'wordplay', 'vague_correct', 'non_state_specific'],
        },
        description: 'List of detected quality problems',
      },
      absurd_distractors: {
        type: 'array',
        items: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
        description: 'Which specific options (A/B/C/D) are obviously absurd, if any',
      },
      decision: {
        type: 'string',
        enum: ['keep', 'fix_distractors', 'rewrite', 'delete'],
      },
      reasoning: { type: 'string', description: '1-2 sentence reason for the decision' },
    },
    required: ['correctness_verdict', 'quality_score', 'quality_issues', 'decision', 'reasoning'],
  },
};

// ─── Prompt builder ────────────────────────────────────────────────────────

function buildPrompt(en, manualText) {
  const correctLetter = ['A', 'B', 'C', 'D'][en.correct_answer] || '?';
  const manualBlock = manualText
    ? `\nMANUAL REFERENCE (state-specific driver handbook excerpt):\n"""\n${manualText.slice(0, 2000)}\n"""\n`
    : '';

  return `You are auditing a US DMV/DOL knowledge test question for correctness AND quality. The question is for state=${en.state}, category=${en.category}${en.subcategory ? `, subcategory=${en.subcategory}` : ''}.

QUESTION:
${en.question_text}

OPTIONS:
A) ${en.option_a}
B) ${en.option_b}
C) ${en.option_c}
D) ${en.option_d}

DECLARED CORRECT ANSWER: ${correctLetter}
${en.explanation ? `\nEXPLANATION (current):\n${en.explanation}` : ''}
${manualBlock}
Evaluate two things and call submit_verification:

1) CORRECTNESS — is option ${correctLetter} actually correct?
   • "correct" — the declared answer matches DMV reality / the manual
   • "wrong" — a different option is the real answer
   • "ambiguous" — multiple options could be defended as correct
   • "invalid" — question itself is broken / not answerable

2) QUALITY (1-5) — is this a real-exam-grade question?
   ★★★★★ (5) = real DMV format: all 4 options plausible to a non-driver, tests an actual rule, no word tricks
   ★★★★  (4) = solid, one option slightly weak
   ★★★   (3) = OK but noticeable issues (vague correct, weak distractor)
   ★★    (2) = serious problems (absurd distractor, trivia, wordplay)
   ★     (1) = trash, should not be in a test

   Flag specific issues:
   - absurd_distractor: option is so obviously wrong nobody picks it ("Honk and proceed", "It doesn't matter")
   - multiple_correct: more than one option could be argued correct
   - trivia_question: tests memorization of manual section number, year, etc. — not knowledge
   - wordplay: depends on English idiom or wordplay (won't translate)
   - vague_correct: correct answer is too general or hand-wavy
   - non_state_specific: question claims state-specificity but the rule is universal

3) DECISION:
   - keep — quality ≥4 and correctness = correct
   - fix_distractors — correctness = correct but has absurd_distractor (rewrite those options only)
   - rewrite — quality ≤3 OR correctness=wrong/ambiguous (whole question needs work)
   - delete — correctness = invalid (broken beyond repair)

Be strict but fair. This is for a real test prep platform serving people preparing for the actual DMV exam.`;
}

// ─── Verdict normalizer ───────────────────────────────────────────────────
// Anthropic's tool-use occasionally leaks raw XML tags into string values
// (e.g. `keep</decision>\n<parameter name="reasoning">...`) or omits a
// required enum field. Strip tag-bleed, then validate enums — throw if we
// can't recover, so callClaude's retry loop gets another shot.

const DECISION_ENUM = ['keep', 'fix_distractors', 'rewrite', 'delete'];
const CORRECTNESS_ENUM = ['correct', 'wrong', 'ambiguous', 'invalid'];

function stripTagBleed(s) {
  if (typeof s !== 'string') return s;
  const lt = s.indexOf('<');
  return (lt >= 0 ? s.slice(0, lt) : s).trim();
}

function normalizeVerdict(v) {
  if (!v || typeof v !== 'object') throw new Error('verdict not an object');
  v.decision = stripTagBleed(v.decision);
  v.correctness_verdict = stripTagBleed(v.correctness_verdict);
  if (!Array.isArray(v.quality_issues)) v.quality_issues = [];
  if (!Array.isArray(v.absurd_distractors)) v.absurd_distractors = [];
  if (!DECISION_ENUM.includes(v.decision)) {
    throw new Error(`malformed verdict: decision=${JSON.stringify(v.decision)}`);
  }
  if (!CORRECTNESS_ENUM.includes(v.correctness_verdict)) {
    throw new Error(`malformed verdict: correctness_verdict=${JSON.stringify(v.correctness_verdict)}`);
  }
  if (!Number.isInteger(v.quality_score) || v.quality_score < 1 || v.quality_score > 5) {
    throw new Error(`malformed verdict: quality_score=${JSON.stringify(v.quality_score)}`);
  }
  return v;
}

// ─── Sonnet caller ─────────────────────────────────────────────────────────

async function callClaude(prompt, model = DEFAULT_MODEL, maxTokens = 2048) {
  let lastErr = null;
  // Sonnet pricing: $3/M in, $15/M out · Haiku: $1/M in, $5/M out
  const isSonnet = model.includes('sonnet');
  const priceIn  = isSonnet ? 3 : 1;
  const priceOut = isSonnet ? 15 : 5;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          tools: [TOOL],
          tool_choice: { type: 'tool', name: TOOL.name },
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (r.status === 429) {
        const wait = parseInt(r.headers.get('retry-after') || '20', 10);
        // Cap wait at 30s — we'd rather fail and let the caller retry whole cluster
        await new Promise((res) => setTimeout(res, Math.min(wait, 30) * 1000));
        lastErr = new Error(`rate_limited (attempt ${attempt})`);
        continue;
      }
      if (r.status === 529) {
        await new Promise((res) => setTimeout(res, 30000));
        lastErr = new Error(`overloaded (attempt ${attempt})`);
        continue;
      }
      if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);

      const data = await r.json();
      const tu = data.content?.find((b) => b.type === 'tool_use');
      if (!tu) throw new Error('No tool_use in response');
      const verdict = normalizeVerdict(tu.input);
      const inputTok = data.usage?.input_tokens || 0;
      const outputTok = data.usage?.output_tokens || 0;
      const cost = (inputTok / 1e6) * priceIn + (outputTok / 1e6) * priceOut;
      return { verdict, cost, model };
    } catch (e) {
      lastErr = e;
      if (attempt === 4) break;
      await new Promise((res) => setTimeout(res, 2000 * attempt));
    }
  }
  throw lastErr || new Error('callClaude exhausted all retries');
}

// ─── Handler ───────────────────────────────────────────────────────────────
//
// POST /api/admin/verify-quality
//
// Body shapes:
//   { password, cluster_code, state, category, subcategory? }
//     → verify one cluster, return verdict + persist quality_score etc.
//   { password, question_id }
//     → verify one specific EN row by id
//
// Returns: { ok, verdict: {...}, cost }

export async function POST(req) {
  try {
    let body;
    try { body = await req.json(); } catch { return Response.json({ error: 'Bad JSON' }, { status: 400 }); }

    const { password, cluster_code, state, category, subcategory, question_id, model: modelArg } = body;
    const model = modelArg === 'sonnet' ? SONNET_MODEL
                : modelArg === 'haiku'  ? HAIKU_MODEL
                : DEFAULT_MODEL;
    if (!checkAdminPassword(password)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });

    // Fetch EN row
    let en;
    if (question_id) {
      const { data, error } = await supabase
        .from('questions')
        .select('id,state,category,subcategory,cluster_code,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,manual_reference,manual_section')
        .eq('id', question_id)
        .eq('language', 'en')
        .single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      en = data;
    } else {
      if (!cluster_code || !state || !category) {
        return Response.json({ error: 'cluster_code + state + category required' }, { status: 400 });
      }
      let q = supabase
        .from('questions')
        .select('id,state,category,subcategory,cluster_code,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,manual_reference,manual_section')
        .eq('cluster_code', cluster_code)
        .eq('state', state)
        .eq('category', category)
        .eq('language', 'en')
        .limit(1);
      if (subcategory) q = q.eq('subcategory', subcategory);
      else if (category === 'cdl') q = q.is('subcategory', null);
      const { data, error } = await q;
      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!data?.length) return Response.json({ error: 'EN row not found' }, { status: 404 });
      en = data[0];
    }

    // Call Claude (Haiku by default, Sonnet on demand)
    const prompt = buildPrompt(en, en.manual_reference);
    const result = await callClaude(prompt, model);
    if (!result?.verdict) {
      return Response.json({ error: 'Claude returned no verdict' }, { status: 502 });
    }
    const { verdict, cost } = result;

    // Persist to DB
    const { error: updateError } = await supabase
      .from('questions')
      .update({
        quality_score:        verdict.quality_score,
        quality_issues:       verdict.quality_issues || [],
        quality_verified_at:  new Date().toISOString(),
      })
      .eq('id', en.id);
    if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

    return Response.json({ ok: true, verdict, cost, model: result.model, en_id: en.id });
  } catch (err) {
    console.error('verify-quality error:', err?.message || err);
    return Response.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
