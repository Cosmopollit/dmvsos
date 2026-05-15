// Record an experiment exposure. Called by useExperiment() on first render.
// Idempotent per (experiment, variant, key, day) via UNIQUE index on the table.

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request) {
  try {
    const { experiment, variant, key } = await request.json();
    if (!experiment || !variant || !key) {
      return Response.json({ ok: false, error: 'missing fields' }, { status: 400 });
    }

    await fetch(`${SUPA_URL}/rest/v1/experiment_exposures`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: JSON.stringify({ experiment, variant, subject_key: key }),
    });

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
