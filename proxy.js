/**
 * Edge proxy (Next.js 16 renaming of middleware.js → proxy.js).
 *
 * Does three jobs on every matched request:
 *
 *  1. Refresh Supabase auth session (rotates short-lived JWTs so the
 *     client doesn't have to handle 401 → refresh manually).
 *
 *  2. Geo-detection cookie. Reads Vercel's x-vercel-ip-country-region
 *     header, maps US state codes to our slug format ("CA" → "california"),
 *     and stores the result in dmvsos_geo_state so the home page can
 *     pre-select the user's state.
 *
 *  3. Bot fingerprinting. Scores incoming requests 0-10 based on UA
 *     string and HTTP header signals, attaches `x-bot-score` request
 *     header that downstream API routes can read. Phase 1 of the
 *     anti-scraping stack — pure instrumentation, no behavior change
 *     yet. Later phases (answer/translation poisoning) consume this
 *     score to decide whether to serve poisoned content to scrapers.
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

// ── State geo mapping ─────────────────────────────────────────────────────
// Vercel x-vercel-ip-country-region codes → state slugs
const REGION_TO_SLUG = {
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california',
  CO: 'colorado', CT: 'connecticut', DE: 'delaware', FL: 'florida', GA: 'georgia',
  HI: 'hawaii', ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa',
  KS: 'kansas', KY: 'kentucky', LA: 'louisiana', ME: 'maine', MD: 'maryland',
  MA: 'massachusetts', MI: 'michigan', MN: 'minnesota', MS: 'mississippi', MO: 'missouri',
  MT: 'montana', NE: 'nebraska', NV: 'nevada', NH: 'new-hampshire', NJ: 'new-jersey',
  NM: 'new-mexico', NY: 'new-york', NC: 'north-carolina', ND: 'north-dakota', OH: 'ohio',
  OK: 'oklahoma', OR: 'oregon', PA: 'pennsylvania', RI: 'rhode-island', SC: 'south-carolina',
  SD: 'south-dakota', TN: 'tennessee', TX: 'texas', UT: 'utah', VT: 'vermont',
  VA: 'virginia', WA: 'washington', WV: 'west-virginia', WI: 'wisconsin', WY: 'wyoming',
}

// ── Bot fingerprinting ────────────────────────────────────────────────────
// Patterns that strongly suggest a non-browser HTTP client.
const BAD_BOT_UA_PATTERNS = [
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /python-urllib/i,
  /HeadlessChrome/i,
  /PhantomJS/i,
  /Slimer/i,
  /scrapy/i,
  /Go-http-client/i,
  /axios\//i,
  /node-fetch/i,
  /^Java\//i,
  /Apache-HttpClient/i,
  /okhttp/i,
  /Puppeteer/i,
  /Playwright/i,
  /Selenium/i,
  /WebDriver/i,
]

// Crawlers we explicitly allow through (SEO + social previews).
// Score forced to 0 so they index us normally.
const GOOD_BOT_UA_PATTERNS = [
  /Googlebot/i,
  /Google-InspectionTool/i,
  /AdsBot-Google/i,
  /APIs-Google/i,
  /Mediapartners-Google/i,
  /Bingbot/i,
  /AdIdxBot/i,
  /BingPreview/i,
  /YandexBot/i,
  /DuckDuckBot/i,
  /Slurp/i,             // Yahoo
  /Baiduspider/i,
  /facebookexternalhit/i,
  /Twitterbot/i,
  /LinkedInBot/i,
  /WhatsApp/i,
  /TelegramBot/i,
  /Applebot/i,
  /PerplexityBot/i,
  /OAI-SearchBot/i,
  /ChatGPT-User/i,
  /GPTBot/i,
  /ClaudeBot/i,
]

const GENERIC_BOT_WORDS = /\b(bot|crawler|spider|fetch|scrape|harvest|monitor)\b/i

function scoreBot(req) {
  const ua = req.headers.get('user-agent') || ''
  const acceptLang = req.headers.get('accept-language')
  const acceptEncoding = req.headers.get('accept-encoding')
  const secChUa = req.headers.get('sec-ch-ua')
  const secFetchSite = req.headers.get('sec-fetch-site')

  // Allow-list good bots before any scoring.
  if (GOOD_BOT_UA_PATTERNS.some(p => p.test(ua))) {
    return { score: 0, reasons: ['good-bot'] }
  }

  let score = 0
  const reasons = []

  // Explicit bad UA → max score, no need to check anything else.
  for (const p of BAD_BOT_UA_PATTERNS) {
    if (p.test(ua)) {
      score += 10
      reasons.push('bad-ua')
      break
    }
  }

  if (!ua) {
    score += 6
    reasons.push('no-ua')
  } else if (ua.length < 30) {
    score += 4
    reasons.push('ua-too-short')
  }

  // Generic keyword (looser).
  if (ua && GENERIC_BOT_WORDS.test(ua) && score < 5) {
    score += 3
    reasons.push('generic-bot-word')
  }

  // Browsers send these; many scrapers don't.
  if (!acceptLang) {
    score += 2
    reasons.push('no-accept-language')
  }
  if (!acceptEncoding) {
    score += 2
    reasons.push('no-accept-encoding')
  }

  // Chrome 90+ sends sec-ch-ua. Missing = stale browser or fake UA.
  if (!secChUa && /Chrome\/(\d+)/.test(ua)) {
    const major = parseInt(ua.match(/Chrome\/(\d+)/)[1], 10)
    if (major >= 90) {
      score += 2
      reasons.push('chrome-no-sec-ch-ua')
    }
  }

  // sec-fetch-site is sent by browsers on navigation.
  if (!secFetchSite && req.method === 'GET') {
    score += 1
    reasons.push('no-sec-fetch-site')
  }

  return { score: Math.min(score, 10), reasons }
}

// ── Main proxy ────────────────────────────────────────────────────────────
export async function proxy(request) {
  const path = request.nextUrl.pathname
  const isApi = path.startsWith('/api/')

  // 1. Bot scoring — runs on every matched request (page or API).
  //    Pure CPU work, no network call, so cost is negligible.
  const { score: botScore, reasons: botReasons } = scoreBot(request)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-bot-score', String(botScore))
  if (botReasons.length > 0) {
    requestHeaders.set('x-bot-reasons', botReasons.join(','))
  }

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  })

  // 2. Supabase auth session refresh — page navigations only.
  //    API routes that need the user already call getUser() themselves
  //    via their own server client; refreshing here would add ~50-100ms
  //    to every API call for no benefit.
  if (!isApi) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    await supabase.auth.getUser()

    // Geo detection — also page-only (API never reads this cookie).
    if (!request.cookies.get('dmvsos_geo_state')) {
      const country = request.headers.get('x-vercel-ip-country')
      const region = request.headers.get('x-vercel-ip-country-region')
      if (country === 'US' && region && REGION_TO_SLUG[region]) {
        supabaseResponse.cookies.set('dmvsos_geo_state', REGION_TO_SLUG[region], {
          path: '/',
          maxAge: 60 * 60 * 24 * 30, // 30 days
          sameSite: 'lax',
        })
      }
    }
  }

  // 3. Log high-score detections so we can tune thresholds without
  //    flooding logs with normal traffic. score >= 6 = probable scraper.
  if (botScore >= 6) {
    const ua = (request.headers.get('user-agent') || '').slice(0, 80)
    console.warn(`[bot-detect] score=${botScore} path=${path} ua="${ua}" reasons=${botReasons.join(',')}`)
  }

  return supabaseResponse
}

// Run on everything except static assets and Next internals.
// Critically — includes /api/ now so bot scoring reaches API routes.
// (Previous version excluded /api/ to keep Supabase auth refresh cheap;
// we put auth refresh in a guard below so it still skips for API.)
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icon\\.png|apple-icon\\.png|opengraph-image|robots\\.txt|sitemap\\.xml|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.webp).*)',
  ],
}
