import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'DMVSOS — Free DMV Practice Tests for All 50 States';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0B1C3D 0%, #1E3A5F 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Logo circle */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 28,
            background: '#2563EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 32,
            boxShadow: '0 8px 32px rgba(37,99,235,0.4)',
          }}
        >
          <span style={{ fontSize: 56, color: 'white', fontWeight: 900 }}>
            DMV
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 900,
            color: 'white',
            letterSpacing: '-2px',
            marginBottom: 16,
          }}
        >
          DMVSOS
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            color: '#94A3B8',
            maxWidth: 800,
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          Free DMV Practice Tests for All 50 States
        </div>

        {/* Tags */}
        <div
          style={{
            display: 'flex',
            gap: 16,
            marginTop: 40,
          }}
        >
          {['Car', 'CDL', 'Motorcycle'].map((tag) => (
            <div
              key={tag}
              style={{
                background: 'rgba(255,255,255,0.1)',
                borderRadius: 50,
                padding: '10px 28px',
                color: '#F59E0B',
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              {tag}
            </div>
          ))}
        </div>

        {/* Language line */}
        <div
          style={{
            marginTop: 24,
            fontSize: 18,
            color: '#64748B',
          }}
        >
          English | Español | Русский | 中文 | Українська
        </div>
      </div>
    ),
    { ...size }
  );
}
