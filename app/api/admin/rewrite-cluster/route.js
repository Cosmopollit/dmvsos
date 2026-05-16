import { createClient } from '@supabase/supabase-js';
import { checkAdminPassword } from '@/lib/adminAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SONNET_MODEL = 'claude-sonnet-4-6';
const LETTERS = ['A', 'B', 'C', 'D'];

// ─── Tool schemas ──────────────────────────────────────────────────────────

// Full rewrite: new question + new 4 options + new correct + new explanation
const REWRITE_TOOL = {
  name: 'submit_rewrite',
  description: 'Submit a fully rewritten DMV question for the given cluster.',
  input_schema: {
    type: 'object',
    properties: {
      question_text: { type: 'string', description: 'New question text. Should test a real, manual-grounded rule.' },
      option_a:      { type: 'string' },
      option_b:      { type: 'string' },
      option_c:      { type: 'string' },
      option_d:      { type: 'string' },
      correct_letter: { type: 'string', enum: ['A', 'B', 'C', 'D'], description: 'Which option is correct.' },
      explanation:   { type: 'string', description: '1-2 sentence explanation citing the manual rule.' },
      reasoning:     { type: 'string', description: 'Brief note on what was wrong and what you changed.' },
    },
    required: ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_letter', 'explanation', 'reasoning'],
  },
};

// Fix distractors: keep question + correct unchanged, replace only the bad options
const FIX_DISTRACTORS_TOOL = {
  name: 'submit_fix_distractors',
  description: 'Replace ONLY the absurd distractors. Keep question text and the correct option unchanged.',
  input_schema: {
    type: 'object',
    properties: {
      option_a:  { type: 'string' },
      option_b:  { type: 'string' },
      option_c:  { type: 'string' },
      option_d:  { type: 'string' },
      reasoning: { type: 'string', description: 'Which letters were replaced and why the new versions are plausible.' },
    },
    required: ['option_a', 'option_b', 'option_c', 'option_d', 'reasoning'],
  },
};

// ─── Prompt builders ───────────────────────────────────────────────────────

function buildRewritePrompt(en, qualityIssues, absurd, manualSnippet) {
  const correctLetter = LETTERS[en.correct_answer] || '?';
  const stateName = en.state.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  const issuesLine = qualityIssues?.length ? `\nKnown issues: ${qualityIssues.join(', ')}` : '';
  const absurdLine = absurd?.length ? `\nAbsurd distractors flagged: ${absurd.join(', ')}` : '';
  const manualBlock = manualSnippet
    ? `\n${stateName} CDL manual excerpt (use as ground truth):\n"""\n${manualSnippet.slice(0, 2500)}\n"""\n`
    : '';

  return `You are rewriting a US ${stateName} CDL knowledge test question. The current version was flagged as low-quality and needs to be replaced with a real-exam-grade question.

CURRENT (broken) question:
${en.question_text}
A) ${en.option_a}
B) ${en.option_b}
C) ${en.option_c}
D) ${en.option_d}
Currently marked correct: ${correctLetter}
Current explanation: ${en.explanation || '(none)'}
Subcategory: ${en.subcategory || 'general'}${issuesLine}${absurdLine}
${manualBlock}
TASK: Write a NEW question that:
1. Tests a real CDL safety/legal rule (preferably one cited in the manual above)
2. Has 4 plausible options — ALL four must look reasonable to someone unfamiliar with CDL rules. NO obvious throwaway answers like "Honk and proceed", "It doesn't matter", "Wait forever".
3. Has exactly one unambiguous correct answer
4. Is not trivia (no "what year was this rule introduced") and not wordplay
5. Stays on the same general topic as the original (so it fits the cluster)
6. Has a 1-2 sentence explanation that cites the rule

Call submit_rewrite with the result.`;
}

function buildFixDistractorsPrompt(en, absurd, manualSnippet) {
  const correctLetter = LETTERS[en.correct_answer] || '?';
  const stateName = en.state.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  const absurdLine = absurd?.length ? `\nAbsurd distractors to replace: ${absurd.join(', ')}` : '\nAbsurd distractors: (auto-detect any that are clearly throwaway)';
  const manualBlock = manualSnippet
    ? `\n${stateName} CDL manual excerpt:\n"""\n${manualSnippet.slice(0, 2000)}\n"""\n`
    : '';

  return `You are fixing the WRONG-answer options ONLY for a US ${stateName} CDL test question. Keep the question and the correct answer EXACTLY as they are — only replace bad distractors.

Question:
${en.question_text}
A) ${en.option_a}
B) ${en.option_b}
C) ${en.option_c}
D) ${en.option_d}
Correct: ${correctLetter} (DO NOT CHANGE this option text)
Subcategory: ${en.subcategory || 'general'}${absurdLine}
${manualBlock}
TASK: For each absurd letter, write a NEW plausible distractor — a realistic-sounding wrong answer that a non-expert might pick. Output ALL FOUR options (verbatim text for the ones you didn't touch, new text for the ones you replaced). Keep option ${correctLetter} exactly as the input.

Call submit_fix_distractors.`;
}

// ─── Claude caller ─────────────────────────────────────────────────────────

async function callSonnet(prompt, tool) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: SONNET_MODEL,
          max_tokens: 2048,
          tools: [tool],
          tool_choice: { type: 'tool', name: tool.name },
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (r.status === 429) {
        const wait = parseInt(r.headers.get('retry-after') || '30', 10);
        await new Promise(res => setTimeout(res, Math.min(wait, 60) * 1000));
        continue;
      }
      if (r.status === 529) {
        await new Promise(res => setTimeout(res, 30000));
        continue;
      }
      if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);

      const data = await r.json();
      const tu = data.content?.find(b => b.type === 'tool_use');
      if (!tu) throw new Error('No tool_use in response');
      const inputTok = data.usage?.input_tokens || 0;
      const outputTok = data.usage?.output_tokens || 0;
      const cost = (inputTok / 1e6) * 3 + (outputTok / 1e6) * 15;
      return { result: tu.input, cost };
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise(res => setTimeout(res, 2000 * attempt));
    }
  }
  throw new Error('exhausted retries');
}

// ─── Handler ───────────────────────────────────────────────────────────────
//
// POST /api/admin/rewrite-cluster
// Body:
//   { password, cluster_code, state, category, subcategory?,
//     mode: 'rewrite' | 'fix_distractors',
//     absurd_distractors?: ['A','C'] }
//
// Returns: { ok, mode, new_row, cost, reasoning }

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'Bad JSON' }, { status: 400 }); }

  const { password, cluster_code, state, category, subcategory, mode, absurd_distractors } = body;
  if (!checkAdminPassword(password)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!cluster_code || !state || !category) return Response.json({ error: 'cluster_code, state, category required' }, { status: 400 });
  if (!['rewrite', 'fix_distractors'].includes(mode)) return Response.json({ error: 'mode must be rewrite or fix_distractors' }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });

  // Fetch EN row
  let q = supabase
    .from('questions')
    .select('id,state,category,subcategory,cluster_code,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,manual_reference,manual_section,quality_issues')
    .eq('cluster_code', cluster_code)
    .eq('state', state)
    .eq('category', category)
    .eq('language', 'en')
    .limit(1);
  if (subcategory) q = q.eq('subcategory', subcategory);
  else if (category === 'cdl') q = q.is('subcategory', null);
  const { data: enRows, error: enErr } = await q;
  if (enErr) return Response.json({ error: enErr.message }, { status: 500 });
  if (!enRows?.length) return Response.json({ error: 'EN row not found' }, { status: 404 });
  const en = enRows[0];

  // Build payload for Sonnet
  const manualSnippet = en.manual_reference || null;
  let resp;
  try {
    if (mode === 'rewrite') {
      const prompt = buildRewritePrompt(en, en.quality_issues, absurd_distractors, manualSnippet);
      resp = await callSonnet(prompt, REWRITE_TOOL);
    } else {
      const prompt = buildFixDistractorsPrompt(en, absurd_distractors, manualSnippet);
      resp = await callSonnet(prompt, FIX_DISTRACTORS_TOOL);
    }
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }

  const verdict = resp.result;

  // Build update payload
  let update;
  if (mode === 'rewrite') {
    const correctIdx = LETTERS.indexOf(verdict.correct_letter);
    if (correctIdx < 0) return Response.json({ error: 'invalid correct_letter from Sonnet' }, { status: 502 });
    update = {
      question_text: verdict.question_text,
      option_a:      verdict.option_a,
      option_b:      verdict.option_b,
      option_c:      verdict.option_c,
      option_d:      verdict.option_d,
      correct_answer: correctIdx,
      explanation:    verdict.explanation,
      quality_score:        null,  // will be re-verified
      quality_issues:       null,
      quality_verified_at:  null,
    };
  } else {
    // fix_distractors: keep correct option, replace the rest
    const correctLetter = LETTERS[en.correct_answer];
    const correctFieldName = `option_${correctLetter.toLowerCase()}`;
    const enCorrectText = en[correctFieldName];
    update = {
      option_a: verdict.option_a,
      option_b: verdict.option_b,
      option_c: verdict.option_c,
      option_d: verdict.option_d,
      quality_score:        null,
      quality_issues:       null,
      quality_verified_at:  null,
    };
    // Safety: force the correct option to remain the original text (Sonnet should
    // have preserved it, but if it didn't, we override)
    update[correctFieldName] = enCorrectText;
  }

  // Apply EN update
  const { error: upErr } = await supabase.from('questions').update(update).eq('id', en.id);
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 });

  // Mark non-EN siblings stale
  let staleCount = 0;
  {
    let q2 = supabase
      .from('questions')
      .update({ translation_stale_at: new Date().toISOString() })
      .eq('cluster_code', cluster_code)
      .eq('state', state)
      .eq('category', category)
      .neq('language', 'en');
    if (subcategory) q2 = q2.eq('subcategory', subcategory);
    else if (category === 'cdl') q2 = q2.is('subcategory', null);
    const { count } = await q2.select('id', { count: 'exact', head: true });
    staleCount = count || 0;
  }

  return Response.json({
    ok: true,
    mode,
    en_id: en.id,
    new_row: update,
    cost: resp.cost,
    reasoning: verdict.reasoning,
    stale_set: staleCount,
  });
}
