import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  const { password } = await req.json();
  if (password !== process.env.ADMIN_PASSWORD) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if lang column exists in test_sessions
  const { error: checkError } = await supabase
    .from('test_sessions')
    .select('lang')
    .limit(1);

  if (checkError && checkError.code === '42703') {
    return Response.json({
      ok: false,
      message: 'Column "lang" does not exist yet. Run this SQL in Supabase Dashboard → SQL Editor:',
      sql: 'ALTER TABLE test_sessions ADD COLUMN lang text;',
    });
  }

  if (!checkError) {
    return Response.json({ ok: true, message: 'Column "lang" already exists. No migration needed.' });
  }

  return Response.json({ ok: false, error: checkError.message }, { status: 500 });
}
