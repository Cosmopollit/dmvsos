// Manual-grant primitives shared between the CLI script
// (scripts/grant-pass-manual.js) and the Telegram bot's /grant command
// (app/api/telegram/route.js). All Supabase calls go through the REST API
// with the service-role key — DO NOT import this from any client / edge code.

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function H() {
  return {
    apikey: SUPA_KEY,
    Authorization: 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json',
  };
}

const PASS_PRICE_CENTS = { moto: 1999, auto: 2999, cdl: 4999, extension: 999 };
const VALID_PASS_TYPES = ['moto', 'auto', 'cdl', 'extension'];

export function isValidPassType(t) {
  return VALID_PASS_TYPES.includes(t);
}

export function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

async function getOrCreateUser(email) {
  // Page through admin/users — there's no email-filter param.
  let page = 1;
  while (true) {
    const r = await fetch(`${SUPA_URL}/auth/v1/admin/users?per_page=1000&page=${page}`, { headers: H() }).then(r => r.json());
    const found = (r.users || []).find(u => (u.email || '').toLowerCase() === email);
    if (found) return { user: found, created: false };
    if (!r.users || r.users.length < 1000) break;
    page++;
  }
  const res = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: H(),
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: { source: 'manual_grant', granted_at: new Date().toISOString() },
    }),
  });
  if (!res.ok) throw new Error(`create user: ${res.status} ${await res.text()}`);
  return { user: await res.json(), created: true };
}

async function insertActivePass(userId, passType, expiresAt) {
  const res = await fetch(`${SUPA_URL}/rest/v1/active_passes`, {
    method: 'POST',
    headers: { ...H(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: userId, pass_type: passType, expires_at: expiresAt }),
  });
  if (!res.ok) throw new Error(`active_pass: ${res.status} ${await res.text()}`);
}

async function insertPurchase({ userId, email, passType, kind, amountCents, newExpiresAt }) {
  const res = await fetch(`${SUPA_URL}/rest/v1/purchases`, {
    method: 'POST',
    headers: H(),
    body: JSON.stringify({
      user_id: userId,
      email,
      pass_type: passType,
      kind,
      amount_cents: amountCents,
      currency: 'usd',
      stripe_payment_intent: 'manual_grant_' + Date.now(),
      new_expires_at: newExpiresAt,
    }),
  });
  if (!res.ok) throw new Error(`purchase: ${res.status} ${await res.text()}`);
}

async function syncProfile(email, passType, expiresAt) {
  // on_conflict=email so merge-duplicates resolves on the email unique
  // constraint (not the PK) — otherwise re-granting an EXISTING user 409s.
  const res = await fetch(`${SUPA_URL}/rest/v1/profiles?on_conflict=email`, {
    method: 'POST',
    headers: { ...H(), Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ email, is_pro: true, plan_type: passType, plan_expires_at: expiresAt }),
  });
  if (!res.ok) throw new Error(`profile: ${res.status} ${await res.text()}`);
}

export async function sendMagicLink(email) {
  const res = await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: H(),
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  if (!res.ok) throw new Error(`magic-link: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.action_link || data.properties?.action_link || null;
}

// Resolve an "extension" pass type to the user's existing active pass, or
// default to "auto" if there's none — same behavior as the CLI.
async function resolveExtensionPassType(userId) {
  const r = await fetch(`${SUPA_URL}/rest/v1/active_passes?user_id=eq.${userId}&select=pass_type`, { headers: H() });
  const existing = r.ok ? await r.json() : [];
  return existing[0]?.pass_type || 'auto';
}

export async function grantPass({ email, passType, days = 30, sendMagicLink: shouldSendLink = true }) {
  if (!isValidEmail(email)) throw new Error(`invalid email: ${email}`);
  if (!isValidPassType(passType)) throw new Error(`invalid pass type: ${passType}`);
  if (!Number.isFinite(days) || days < 1 || days > 365) throw new Error(`invalid days: ${days}`);
  email = email.toLowerCase().trim();

  const { user, created } = await getOrCreateUser(email);
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

  const resolvedPassType = passType === 'extension' ? await resolveExtensionPassType(user.id) : passType;

  await insertActivePass(user.id, resolvedPassType, expiresAt);
  await insertPurchase({
    userId: user.id, email, passType: resolvedPassType,
    kind: passType === 'extension' ? 'extension' : 'new',
    amountCents: PASS_PRICE_CENTS[passType] || 0,
    newExpiresAt: expiresAt,
  });
  await syncProfile(email, resolvedPassType, expiresAt);

  let magicLink = null;
  if (shouldSendLink) {
    try { magicLink = await sendMagicLink(email); } catch (e) { magicLink = { error: e.message }; }
  }

  return {
    userId: user.id,
    userCreated: created,
    email,
    passType: resolvedPassType,
    days,
    expiresAt,
    magicLink,
  };
}

export async function getUserState(email) {
  if (!isValidEmail(email)) throw new Error(`invalid email: ${email}`);
  email = email.toLowerCase().trim();

  let users = [];
  let page = 1;
  while (true) {
    const r = await fetch(`${SUPA_URL}/auth/v1/admin/users?per_page=1000&page=${page}`, { headers: H() }).then(r => r.json());
    users.push(...(r.users || []).filter(u => (u.email || '').toLowerCase() === email));
    if (!r.users || r.users.length < 1000) break;
    page++;
  }
  if (users.length === 0) return { exists: false, email };

  const profile = await fetch(`${SUPA_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=*`, { headers: H() })
    .then(r => r.json()).then(rows => rows[0] || null);

  const accounts = [];
  for (const u of users) {
    const passes = await fetch(`${SUPA_URL}/rest/v1/active_passes?user_id=eq.${u.id}&select=*`, { headers: H() }).then(r => r.json());
    accounts.push({
      userId: u.id,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
      providers: u.app_metadata?.providers || [],
      identities: (u.identities || []).map(i => i.provider),
      passes,
    });
  }
  return { exists: true, email, profile, accounts };
}
