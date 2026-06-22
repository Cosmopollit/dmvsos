// Generate an auto-login URL for a customer who just completed Stripe checkout.
// Called by /success page with the session_id from Stripe's success_url placeholder.
//
// Flow:
//   1. Verify session_id with Stripe (must be paid)
//   2. Pull customer email from the session
//   3. Generate a one-time magic-link via Supabase admin API
//   4. Return the action_link so /success can redirect the user, logging them in
//
// Works for both anonymous (just-paid) and already-logged-in users — either way
// they end up logged in on dmvsos.com with their active_pass ready to use.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sbHeaders = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
};

export async function POST(req) {
  try {
    const { session_id } = await req.json();
    if (!session_id || typeof session_id !== 'string') {
      return Response.json({ error: 'session_id required' }, { status: 400 });
    }

    // Validate the session with Stripe (also confirms it's paid)
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(session_id);
    } catch (e) {
      return Response.json({ error: 'invalid session' }, { status: 404 });
    }
    if (!session || session.payment_status !== 'paid') {
      return Response.json({ error: 'session not paid' }, { status: 402 });
    }

    const email = session.customer_details?.email || session.customer_email;
    if (!email) {
      return Response.json({ error: 'no email on session' }, { status: 400 });
    }

    // Generate a one-time magic-link. NOTE: admin/generate_link RETURNS the
    // link but does NOT send any email. Login happens via the redirect the
    // success page performs with login_url (below), not by email.
    const res = await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify({ type: 'magiclink', email }),
    });
    if (!res.ok) {
      // Return email so the success page can show "we tried email@... — resend?"
      return Response.json({ error: 'magic-link failed', email, detail: await res.text() }, { status: 500 });
    }
    const data = await res.json();
    const loginUrl = data.action_link || data.properties?.action_link;
    if (!loginUrl) {
      return Response.json({ error: 'no login URL returned', email }, { status: 500 });
    }

    return Response.json({ login_url: loginUrl, email });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
