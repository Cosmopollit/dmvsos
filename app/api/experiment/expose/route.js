// Record an experiment exposure. Called by useExperiment() on first render.
// Idempotent per (experiment, variant, key, day) via UNIQUE index on the table.

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request) {
  try {
    const { experiment, variant, key } = await request.json();
    if (!experiment || !variant || !key) {
      console.error('[experiment/expose] missing fields', { experiment: experiment || null, variant: variant || null, hasKey: Boolean(key) });
      return Response.json({ ok: false, error: 'missing fields' }, { status: 400 });
    }

    const res = await fetch(`${SUPA_URL}/rest/v1/experiment_exposures`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: JSON.stringify({ experiment, variant, subject_key: key }),
    });
    if (!res.ok && res.status !== 409) {
      // Response stays ok:true (exposure logging is best-effort), but a
      // silently failing insert would skew experiment data, so surface it.
      // 409 is excluded: the UNIQUE index rejecting a repeat exposure is the
      // idempotency working as designed, not a failure.
      console.error('[experiment/expose] insert failed', { status: res.status, experiment, variant });
    }

    return Response.json({ ok: true });
  } catch (e) {
    console.error('[experiment/expose] unhandled error', { message: e.message });
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
