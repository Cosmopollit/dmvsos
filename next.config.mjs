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
  "frame-src https://js.stripe.com https://accounts.google.com",
  "frame-ancestors 'none'",
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
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
