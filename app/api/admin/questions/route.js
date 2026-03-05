import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function authorize(password) {
  return password === process.env.ADMIN_PASSWORD;
}

export async function POST(req) {
  const body = await req.json();
  const { password, action } = body;

  if (!authorize(password)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (action === 'save') {
    const { id, row } = body;
    if (!row?.question_text || !row?.option_a) {
      return Response.json({ error: 'Question text and option A are required' }, { status: 400 });
    }
    if (id) {
      const { error } = await supabase.from('questions').update(row).eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }
    const { data, error } = await supabase.from('questions').insert(row).select('id').single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, id: data?.id });
  }

  if (action === 'csv-upload') {
    const { rows } = body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return Response.json({ error: 'No rows provided' }, { status: 400 });
    }
    let inserted = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.question_text || !r.option_a) {
        errors.push(`Row ${i + 1}: missing question or option A`);
        continue;
      }
      const { error } = await supabase.from('questions').insert(r);
      if (error) errors.push(`Row ${i + 1}: ${error.message}`);
      else inserted++;
    }
    return Response.json({ ok: true, inserted, errors });
  }

  if (action === 'delete') {
    const { id } = body;
    if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
    const { error } = await supabase.from('questions').delete().eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
}
