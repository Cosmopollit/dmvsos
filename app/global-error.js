'use client';

import { useEffect } from 'react';

// Last-resort boundary: catches errors thrown by the root layout itself,
// where app/error.js can't render. Per the Next.js contract it must supply
// its own <html>/<body>. Deliberately zero imports from lib and zero
// storage/cookie access — this component must never be able to throw.
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#F8FAFC', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0B1C3D', margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: '0 0 24px' }}>An unexpected error occurred. Please try again.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ background: '#2563EB', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
