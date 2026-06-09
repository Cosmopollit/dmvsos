// Direct in-app-purchase verification (no RevenueCat).
//
// The mobile app performs the purchase via StoreKit (iOS) / Play Billing
// (Android), then POSTs the signed receipt here. We validate it directly
// against Apple/Google and grant a 30-day pass in Supabase, mirroring the
// Stripe webhook (app/api/webhook/route.js) so AuthContext, profile views,
// and the rest of the app never need to know which rail was used.
//
// Auth: the request carries the buyer's Supabase access token in the
// Authorization header (`Bearer <token>`). We resolve it to a real
// auth.users row; an IAP only fulfils for a signed-in user, and we never
// trust a user_id from the body.
//
// iOS: StoreKit 2 hands the app a JWS-signed transaction. We verify the
// x5c certificate chain roots to Apple Root CA - G3, check the ES256
// signature with the leaf key, then read bundleId / productId /
// transactionId from the payload. Fully offline, no call back to Apple.
//
// Android: Play Billing gives a purchaseToken. We confirm it with the
// Play Developer API (purchases.products.get) via a service account, then
// acknowledge it so Google does not auto-refund after 3 days.
//
// Idempotency: the native transaction id is stored in
// purchases.revenuecat_transaction_id (reused; RC retired). Its UNIQUE
// index blocks double-grants on retries.
//
// Request body:
//   { platform: 'ios'|'android',
//     productId: 'moto_pass_30d'|'auto_pass_30d'|'cdl_pro_30d'|'extension_30d',
//     category?: 'moto'|'auto'|'cdl',   // REQUIRED for extension_30d
//     transaction?: string,             // iOS: StoreKit 2 signed JWS
//     purchaseToken?: string }          // Android: Play purchase token
//
// Response: { ok, pass_type, expires_at, duplicate } or { error }.

import { createHash, createSign, X509Certificate, verify as cryptoVerify } from 'crypto';

import { lookupIapProduct } from '@/lib/iapProducts';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const IOS_BUNDLE_ID = process.env.IOS_BUNDLE_ID || 'com.dmv-sos';
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE_NAME || 'com.dmvsos.android';

// Apple Root CA - G3 (PEM). Pinning the root is what makes the offline
// JWS check trustworthy. Get it from https://www.apple.com/certificateauthority/
// ("Apple Root CA - G3 Root"), convert to PEM, and set as env:
//   openssl x509 -inform der -in AppleRootCA-G3.cer -out g3.pem
// then paste the PEM into APPLE_ROOT_CA_G3_PEM (Vercel env, multiline ok).
const APPLE_ROOT_CA_G3_PEM = process.env.APPLE_ROOT_CA_G3_PEM || '';

const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;

const sbHeaders = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emailTag(email) {
  if (!email) return 'none';
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 8);
}

async function sbSelect(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders });
  if (!res.ok) throw new Error(`Supabase SELECT ${table} failed: ${await res.text()}`);
  return res.json();
}

async function sbInsert(table, row, { ignoreDuplicate = false } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    if (ignoreDuplicate && /duplicate key|unique/i.test(text)) return null;
    throw new Error(`Supabase INSERT ${table} failed: ${text}`);
  }
  return res.json();
}

async function sbUpsert(table, row, onConflict) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase UPSERT ${table} failed: ${await res.text()}`);
  return res.json();
}

async function sbUpdate(table, filter, updates) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${table} failed: ${await res.text()}`);
  return res.json();
}

async function profilesUpdateByEmail(rawEmail, updates, userId = null) {
  if (!rawEmail) return [];
  const email = rawEmail.toLowerCase();
  const updated = await sbUpdate('profiles', `email=ilike.${encodeURIComponent(email)}`, updates);
  if (updated.length === 0) {
    await sbInsert('profiles', { ...(userId ? { id: userId } : {}), email, ...updates });
  }
  return updated;
}

async function notifyAdmin(text) {
  const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!TG_TOKEN || !ADMIN_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text, parse_mode: 'HTML' }),
  }).catch(() => {});
}

// Resolve the buyer from their Supabase access token. Returns null for any
// invalid/expired token — never trust a user_id from the request body.
async function userFromToken(token) {
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const u = await res.json();
  return u?.id ? { user_id: u.id, email: u.email || null } : null;
}

// ----------------------------- Apple ---------------------------------

function b64urlToBuf(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function b64urlJson(s) {
  return JSON.parse(b64urlToBuf(s).toString('utf8'));
}

// Verify a StoreKit 2 JWS-signed transaction and return its payload.
// Throws on any failure. The x5c chain must root to Apple Root CA - G3
// and the ES256 signature must check out against the leaf's public key.
function verifyAppleJWS(jws) {
  if (typeof jws !== 'string') throw new Error('missing transaction JWS');
  const [h, p, sig] = jws.split('.');
  if (!h || !p || !sig) throw new Error('malformed JWS');

  const header = b64urlJson(h);
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2) throw new Error('no x5c chain in JWS header');

  const certs = x5c.map((der) => new X509Certificate(Buffer.from(der, 'base64')));

  // Each cert must be issued + signed by the next one up the chain.
  for (let i = 0; i < certs.length - 1; i += 1) {
    if (!certs[i].checkIssued(certs[i + 1])) throw new Error(`cert ${i} not issued by ${i + 1}`);
    if (!certs[i].verify(certs[i + 1].publicKey)) throw new Error(`cert ${i} signature invalid`);
  }

  // Pin the top of the presented chain to Apple's published root.
  if (!APPLE_ROOT_CA_G3_PEM) {
    throw new Error('APPLE_ROOT_CA_G3_PEM not configured — cannot verify Apple receipts');
  }
  const presentedRoot = certs[certs.length - 1];
  const appleRoot = new X509Certificate(APPLE_ROOT_CA_G3_PEM);
  if (presentedRoot.fingerprint256 !== appleRoot.fingerprint256) {
    throw new Error('JWS chain does not root to Apple Root CA - G3');
  }

  // Verify the JWS signature. JWS ES256 signatures are raw r||s
  // (IEEE-P1363), not DER, so tell crypto.verify so.
  const leaf = certs[0];
  const ok = cryptoVerify(
    'sha256',
    Buffer.from(`${h}.${p}`),
    { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' },
    b64urlToBuf(sig),
  );
  if (!ok) throw new Error('JWS signature verification failed');

  return b64urlJson(p);
}

async function verifyApple(transactionJWS, expectedProductId) {
  const payload = verifyAppleJWS(transactionJWS);
  if (payload.bundleId !== IOS_BUNDLE_ID) {
    throw new Error(`bundleId mismatch: ${payload.bundleId} != ${IOS_BUNDLE_ID}`);
  }
  if (payload.productId !== expectedProductId) {
    throw new Error(`productId mismatch: ${payload.productId} != ${expectedProductId}`);
  }
  if (payload.revocationDate) throw new Error('transaction was revoked');
  // StoreKit 2 price is an integer in milliunits of the currency.
  const amountCents = typeof payload.price === 'number' ? Math.round(payload.price / 10) : 0;
  return {
    transactionId: payload.transactionId,
    environment: payload.environment || 'Production', // 'Sandbox' | 'Production'
    amountCents,
    currency: (payload.currency || 'USD').toLowerCase(),
  };
}

// ----------------------------- Google --------------------------------

// Exchange the service-account key for an androidpublisher access token.
async function googleAccessToken() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured');
  const sa = JSON.parse(raw);
  const nowSec = Math.floor(Date.now() / 1000);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwtHeader = enc({ alg: 'RS256', typ: 'JWT' });
  const jwtClaim = enc({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  });
  const signer = createSign('RSA-SHA256');
  signer.update(`${jwtHeader}.${jwtClaim}`);
  const signature = signer.sign(sa.private_key).toString('base64url');
  const assertion = `${jwtHeader}.${jwtClaim}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  const tok = await res.json();
  return tok.access_token;
}

async function verifyGoogle(purchaseToken, productId) {
  if (!purchaseToken) throw new Error('missing purchaseToken');
  const accessToken = await googleAccessToken();
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANDROID_PACKAGE}/purchases/products/${productId}/tokens/${encodeURIComponent(purchaseToken)}`;

  const res = await fetch(base, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Play purchase lookup failed: ${await res.text()}`);
  const pur = await res.json();

  // purchaseState: 0 = purchased, 1 = canceled, 2 = pending.
  if (pur.purchaseState !== 0) throw new Error(`Play purchaseState=${pur.purchaseState}`);

  // Acknowledge so Google does not auto-refund (consumables still need it).
  if (pur.acknowledgementState === 0) {
    await fetch(`${base}:acknowledge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => {});
  }

  return {
    transactionId: pur.orderId || purchaseToken,
    environment: pur.purchaseType === 0 ? 'Sandbox' : 'Production', // 0 = test purchase
    amountCents: 0, // Play does not return price here; revenue comes from Play console
    currency: 'usd',
  };
}

// --------------------------- Fulfilment ------------------------------

// Mirror of handleRcPurchase / handleOneTimePayment: idempotent grant of a
// 30-day pass. Extensions stack on the current expiry; a fresh pass starts
// from now. Returns { expiresAt, duplicate }.
async function grantPass({ user_id, email, pass_type, kind, txId, source, amountCents, currency }) {
  const existing = await sbSelect(
    'purchases',
    `revenuecat_transaction_id=eq.${encodeURIComponent(txId)}&select=id,new_expires_at`,
  );
  if (existing.length > 0) {
    return { expiresAt: existing[0].new_expires_at, duplicate: true };
  }

  const current = await sbSelect(
    'active_passes',
    `user_id=eq.${user_id}&pass_type=eq.${pass_type}&select=expires_at`,
  );
  const now = new Date();
  const currentExpiresAt = current[0]?.expires_at || null;
  const isActive = currentExpiresAt && new Date(currentExpiresAt) > now;

  if (kind === 'new' && isActive) {
    // Duplicate 'new' while still active. Apple/Google have no auto-refund
    // like Stripe — honour the money by extending, and ping admin.
    await notifyAdmin(
      `⚠️ <b>IAP duplicate 'new' purchase</b>: user already had active ${pass_type}. Treated as extension. Refund manually if needed.\nUser: ${email || user_id}\nTx: <code>${txId}</code> (${source})`,
    );
  }

  const baseDate = isActive ? new Date(currentExpiresAt) : now;
  const newExpiresAt = new Date(baseDate.getTime() + DAYS_30_MS);

  const inserted = await sbInsert(
    'purchases',
    {
      user_id,
      email: email || null,
      pass_type,
      kind,
      amount_cents: amountCents || 0,
      currency: currency || 'usd',
      stripe_payment_intent: null,
      stripe_checkout_session: null,
      revenuecat_transaction_id: txId,
      source,
      prev_expires_at: currentExpiresAt,
      new_expires_at: newExpiresAt.toISOString(),
    },
    { ignoreDuplicate: true },
  );
  if (!inserted) {
    // Concurrent request beat us; the pass is granted, treat as duplicate.
    return { expiresAt: newExpiresAt.toISOString(), duplicate: true };
  }

  await sbUpsert(
    'active_passes',
    { user_id, pass_type, expires_at: newExpiresAt.toISOString() },
    'user_id,pass_type',
  );

  if (email) {
    const allActive = await sbSelect(
      'active_passes',
      `user_id=eq.${user_id}&select=expires_at&order=expires_at.desc`,
    );
    const maxExpires = allActive[0]?.expires_at || null;
    await profilesUpdateByEmail(
      email,
      { is_pro: true, plan_type: pass_type, plan_expires_at: maxExpires },
      user_id,
    ).catch((e) => console.warn(`IAP profile sync failed: ${e.message}`));
  }

  console.log(
    `IAP grant | user=${emailTag(email)} | type=${pass_type} | kind=${kind} | src=${source} | tx=${txId} | expires=${newExpiresAt.toISOString()}`,
  );
  return { expiresAt: newExpiresAt.toISOString(), duplicate: false };
}

// ------------------------------ Route --------------------------------

export async function POST(request) {
  const authz = request.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  const user = await userFromToken(token);
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const { platform, productId, category, transaction, purchaseToken } = body || {};

  const product = lookupIapProduct(productId);
  if (!product) return json({ error: 'unknown product' }, 400);

  // Resolve pass_type. extension_30d carries the target category in the body.
  let pass_type = product.pass_type;
  const kind = product.kind;
  if (kind === 'extension') {
    if (!['moto', 'auto', 'cdl'].includes(category)) {
      return json({ error: 'extension requires a valid category' }, 400);
    }
    pass_type = category;
  }

  // Validate the receipt with the platform.
  let validated;
  try {
    if (platform === 'ios') {
      validated = { ...(await verifyApple(transaction, productId)), source: 'apple' };
    } else if (platform === 'android') {
      validated = { ...(await verifyGoogle(purchaseToken, productId)), source: 'google' };
    } else {
      return json({ error: 'bad platform' }, 400);
    }
  } catch (e) {
    console.warn(
      `verify-iap validation failed | user=${emailTag(user.email)} | product=${productId} | platform=${platform} | ${e.message}`,
    );
    return json({ error: 'receipt validation failed' }, 400);
  }
  if (!validated.transactionId) return json({ error: 'no transaction id' }, 400);

  let result;
  try {
    result = await grantPass({
      user_id: user.user_id,
      email: user.email,
      pass_type,
      kind,
      txId: validated.transactionId,
      source: validated.source,
      amountCents: validated.amountCents,
      currency: validated.currency,
    });
  } catch (e) {
    console.error('verify-iap grant error:', e.message, e.stack);
    await notifyAdmin(
      `🚨 <b>verify-iap grant error</b>\nUser: ${user.email || user.user_id}\nProduct: <code>${productId}</code>\nTx: <code>${validated.transactionId}</code>\nError: <code>${e.message}</code>`,
    ).catch(() => {});
    return json({ error: 'grant failed' }, 500);
  }

  return json({
    ok: true,
    pass_type,
    kind,
    environment: validated.environment,
    expires_at: result.expiresAt,
    duplicate: result.duplicate,
  });
}
