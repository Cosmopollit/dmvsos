import { createClient } from '@supabase/supabase-js';
import { checkAdminPassword } from '@/lib/adminAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LANGS = ['en', 'ru', 'es', 'zh', 'ua'];
const FIELDS = 'id,language,cluster_code,state,category,subcategory,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,image_url,manual_reference,manual_section,quality_score,quality_issues,quality_verified_at,translation_stale_at';

// ─── GET (via POST for auth body) ──────────────────────────────────────────
//   { password, action:'get', cluster_code, state, category, subcategory? }
//
// ─── SAVE single language ──────────────────────────────────────────────────
//   { password, action:'save', id, row: {fields}, propagate:{correct_answer?, image_url?} }
//   If row.language === 'en' AND row.question_text changed, also marks all
//   sibling translations with translation_stale_at = NOW().
//
// ─── SAVE all 5 langs at once ──────────────────────────────────────────────
//   { password, action:'save-all', rows:[{id,row}], correct_answer }
//
// ─── DELETE whole cluster ──────────────────────────────────────────────────
//   { password, action:'delete-cluster', cluster_code, state, category, subcategory? }

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'Bad JSON' }, { status: 400 }); }

  const { password, action } = body;
  if (!checkAdminPassword(password)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // ─── get ───────────────────────────────────────────────────────────────
  if (action === 'get') {
    const { cluster_code, state, category, subcategory } = body;
    if (!cluster_code || !state || !category) {
      return Response.json({ error: 'cluster_code, state, category required' }, { status: 400 });
    }
    let q = supabase
      .from('questions')
      .select(FIELDS)
      .eq('cluster_code', cluster_code)
      .eq('state', state)
      .eq('category', category);
    if (subcategory) q = q.eq('subcategory', subcategory);
    else if (category === 'cdl') q = q.is('subcategory', null);

    const { data, error } = await q;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Map by language. If a lang is missing, set null.
    const byLang = {};
    for (const lang of LANGS) byLang[lang] = null;
    for (const r of data || []) byLang[r.language] = r;

    // Find prev/next cluster_code in the same scope (state/category/subcategory)
    // ordered by cluster_code ASC — same order as the listing page.
    const buildNeighborQuery = (op, asc) => {
      let nq = supabase
        .from('questions')
        .select('cluster_code')
        .eq('state', state)
        .eq('category', category)
        .eq('language', 'en')
        .not('cluster_code', 'is', null)
        [op]('cluster_code', cluster_code)
        .order('cluster_code', { ascending: asc })
        .limit(1);
      if (subcategory) nq = nq.eq('subcategory', subcategory);
      else if (category === 'cdl') nq = nq.is('subcategory', null);
      return nq;
    };
    const [{ data: prevRow }, { data: nextRow }] = await Promise.all([
      buildNeighborQuery('lt', false),
      buildNeighborQuery('gt', true),
    ]);

    return Response.json({
      ok: true,
      byLang,
      prev_code: prevRow?.[0]?.cluster_code || null,
      next_code: nextRow?.[0]?.cluster_code || null,
    });
  }

  // ─── save single language ──────────────────────────────────────────────
  if (action === 'save') {
    const { id, row, propagate } = body;
    if (!id || !row) return Response.json({ error: 'id and row required' }, { status: 400 });

    // Fetch existing to compare (for translation_stale_at trigger)
    const { data: prev } = await supabase
      .from('questions')
      .select('language,cluster_code,state,category,subcategory,question_text,option_a,option_b,option_c,option_d')
      .eq('id', id)
      .single();

    const { error } = await supabase.from('questions').update(row).eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    let stale_set = 0;
    // If EN content changed → mark non-EN siblings as stale
    if (prev && prev.language === 'en') {
      const enContentChanged = (
        row.question_text !== prev.question_text ||
        row.option_a      !== prev.option_a ||
        row.option_b      !== prev.option_b ||
        row.option_c      !== prev.option_c ||
        row.option_d      !== prev.option_d
      );
      if (enContentChanged && prev.cluster_code) {
        let q = supabase
          .from('questions')
          .update({ translation_stale_at: new Date().toISOString() })
          .eq('cluster_code', prev.cluster_code)
          .eq('state', prev.state)
          .eq('category', prev.category)
          .neq('language', 'en');
        if (prev.subcategory) q = q.eq('subcategory', prev.subcategory);
        else if (prev.category === 'cdl') q = q.is('subcategory', null);

        const { count } = await q.select('id', { count: 'exact', head: true });
        stale_set = count || 0;
      }
    }

    // Cluster-wide propagation (correct_answer / image_url)
    let propagated = 0;
    if (propagate && prev?.cluster_code) {
      const clusterUpdate = {};
      if (propagate.correct_answer !== undefined) clusterUpdate.correct_answer = propagate.correct_answer;
      if (propagate.image_url !== undefined)      clusterUpdate.image_url      = propagate.image_url;
      if (Object.keys(clusterUpdate).length > 0) {
        let q = supabase
          .from('questions')
          .update(clusterUpdate)
          .eq('cluster_code', prev.cluster_code)
          .eq('state', prev.state)
          .eq('category', prev.category)
          .neq('id', id);
        if (prev.subcategory) q = q.eq('subcategory', prev.subcategory);
        else if (prev.category === 'cdl') q = q.is('subcategory', null);

        const { count } = await q.select('id', { count: 'exact', head: true });
        propagated = count || 0;
      }
    }

    return Response.json({ ok: true, stale_set, propagated });
  }

  // ─── save all 5 langs ──────────────────────────────────────────────────
  if (action === 'save-all') {
    const { rows, correct_answer } = body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return Response.json({ error: 'rows required' }, { status: 400 });
    }
    const errors = [];
    for (const { id, row } of rows) {
      if (!id) continue;
      const payload = { ...row };
      if (typeof correct_answer === 'number') payload.correct_answer = correct_answer;
      // Clear stale flag since we're committing fresh content
      payload.translation_stale_at = null;
      const { error } = await supabase.from('questions').update(payload).eq('id', id);
      if (error) errors.push(`${row.language || id}: ${error.message}`);
    }
    if (errors.length) return Response.json({ error: errors.join('; ') }, { status: 500 });
    return Response.json({ ok: true, saved: rows.length });
  }

  // ─── delete whole cluster ─────────────────────────────────────────────
  if (action === 'delete-cluster') {
    const { cluster_code, state, category, subcategory } = body;
    if (!cluster_code || !state || !category) {
      return Response.json({ error: 'cluster_code, state, category required' }, { status: 400 });
    }
    let q = supabase
      .from('questions')
      .delete()
      .eq('cluster_code', cluster_code)
      .eq('state', state)
      .eq('category', category);
    if (subcategory) q = q.eq('subcategory', subcategory);
    else if (category === 'cdl') q = q.is('subcategory', null);

    const { error, count } = await q.select('id', { count: 'exact', head: true });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, deleted: count || 0 });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
}
