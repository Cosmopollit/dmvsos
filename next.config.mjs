/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

// 'unsafe-eval' is only needed in dev (HMR/source maps). Production runs without it.
// googletagmanager.com is needed for GA4 (gtag.js script loader).
const scriptSrc = isDev
  ? "'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.googletagmanager.com"
  : "'self' 'unsafe-inline' https://js.stripe.com https://*.googletagmanager.com";

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  // GA4 sometimes uses pixel fallbacks from google-analytics.com.
  "img-src 'self' data: blob: https://*.supabase.co https://*.google-analytics.com https://*.googletagmanager.com",
  "font-src 'self' https://fonts.gstatic.com",
  // GA4 sends event beacons to region1.google-analytics.com (and similar).
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://accounts.google.com https://*.google-analytics.com https://*.googletagmanager.com https://*.analytics.google.com",
  // 'self' lets the app embed its own pages (the /break.html arcade overlay).
  "frame-src 'self' https://js.stripe.com https://accounts.google.com",
  // 'self' allows same-origin framing (the Break Mode overlay) while still
  // blocking cross-origin clickjacking on login/checkout.
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "object-src 'none'",
].join('; ');

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
  // Collapse the www host onto the canonical apex with a real 301. Both
  // hosts were serving 200 (duplicate content); the canonical tag already
  // pointed Google at the apex, but a hard redirect is the unambiguous
  // signal and consolidates any www backlinks/crawl onto one host.
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.dmvsos.com' }],
        destination: 'https://dmvsos.com/:path*',
        permanent: true,
      },
      // Old Wix booking links (skills-test warm-ups, driving lessons) still
      // live in search results and messengers, and prod logs show real people
      // clicking them into 404s. Catch that intent on /services, where
      // ?from=booking shows a non-gated "message us to book" banner.
      {
        source: '/booking-calendar/:slug*',
        destination: '/services?from=booking',
        permanent: true,
      },
      // Crawlers guess WordPress-style sitemap names; point them at ours.
      { source: '/sitemap_index.xml', destination: '/sitemap.xml', permanent: true },
      { source: '/sitemap-index.xml', destination: '/sitemap.xml', permanent: true },
    ];
  },
};

export default nextConfig;
