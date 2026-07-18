'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

const CONFETTI_COLORS = ['#F59E0B', '#2563EB', '#0B1C3D', '#16A34A'];

export default function PersonalGreeting() {
  const { user } = useAuth();
  const [greeting, setGreeting] = useState(null);

  useEffect(() => {
    if (!user?.email) return;
    const email = user.email.toLowerCase();
    const flagKey = `dmvsos_greeted_${email}`;
    // Blocked storage throws on access; treat as already greeted (don't show).
    let greeted = true;
    try { greeted = !!localStorage.getItem(flagKey); } catch { /* blocked storage */ }
    if (greeted) return;

    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/greeting', {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { greeting: g } = await res.json();
      if (cancelled || !g) return;
      setGreeting(g);
      try { localStorage.setItem(flagKey, '1'); } catch { /* blocked storage */ }
    })().catch(() => {});

    return () => { cancelled = true; };
  }, [user?.email]);

  if (!greeting) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-hidden pg-overlay"
      onClick={() => setGreeting(null)}>
      {greeting.celebrate && [...Array(16)].map((_, i) => (
        <span
          key={i}
          aria-hidden
          className="pg-confetti"
          style={{
            left: `${(i * 6.7 + 2) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 8) * 0.4}s`,
            animationDuration: `${2.8 + (i % 5) * 0.6}s`,
          }}
        />
      ))}
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden pg-card"
        onClick={e => e.stopPropagation()}>
        <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #F59E0B, #FB923C, #F59E0B)' }} />
        <div className="p-7 text-center">
          {greeting.celebrate && (
            <div className="relative mx-auto mb-4 overflow-hidden" style={{ width: 200, height: 64 }}>
              <svg className="pg-car absolute" style={{ left: 40, top: 4 }} width="120" height="46" viewBox="0 0 120 46" fill="none" aria-hidden>
                <path d="M10 33 L10 27 Q10 21 18 19 L34 16 Q41 8 54 8 L70 8 Q83 8 90 16 L104 19 Q112 21 112 27 L112 33 Q112 36 108 36 L14 36 Q10 36 10 33 Z" fill="#0B1C3D" />
                <path d="M40 16 Q45 11 54 11 L60 11 L60 16 Z" fill="#93C5FD" />
                <path d="M64 11 L69 11 Q79 11 84 16 L64 16 Z" fill="#93C5FD" />
                <circle cx="34" cy="36" r="8" fill="#0B1C3D" stroke="#fff" strokeWidth="2.5" />
                <circle cx="34" cy="36" r="3" fill="#94A3B8" />
                <circle cx="88" cy="36" r="8" fill="#0B1C3D" stroke="#fff" strokeWidth="2.5" />
                <circle cx="88" cy="36" r="3" fill="#94A3B8" />
              </svg>
              <div className="absolute bottom-1 left-0 right-0 h-0.5 rounded pg-road"
                style={{ background: 'repeating-linear-gradient(90deg, #CBD5E1 0 14px, transparent 14px 26px)' }} />
            </div>
          )}
          <h3 className="text-xl font-bold text-[#0B1C3D] mb-2 pg-rise" style={{ animationDelay: '0.25s' }}>
            {greeting.title}
          </h3>
          <p className="text-sm text-[#64748B] mb-6 pg-rise" style={{ animationDelay: '0.4s' }}>
            {greeting.body}
          </p>
          <button
            type="button"
            onClick={() => setGreeting(null)}
            className="w-full py-3.5 rounded-2xl font-bold text-white text-base pg-rise"
            style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', animationDelay: '0.55s' }}>
            {greeting.cta}
          </button>
        </div>
      </div>
      <style jsx>{`
        .pg-overlay {
          animation: pg-fade 0.35s ease-out;
        }
        .pg-card {
          animation: pg-card-up 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .pg-car {
          animation: pg-car-in 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both;
        }
        .pg-road {
          animation: pg-road-move 1.1s linear 2;
        }
        .pg-rise {
          animation: pg-rise-up 0.5s ease-out both;
        }
        .pg-confetti {
          position: absolute;
          top: -20px;
          width: 8px;
          height: 13px;
          border-radius: 2px;
          opacity: 0.85;
          pointer-events: none;
          animation-name: pg-confetti-fall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes pg-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pg-card-up {
          from { opacity: 0; transform: translateY(36px) scale(0.94); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pg-car-in {
          from { transform: translateX(-180px); }
          60% { transform: translateX(8px); }
          to { transform: translateX(0); }
        }
        @keyframes pg-road-move {
          from { background-position-x: 52px; }
          to { background-position-x: 0; }
        }
        @keyframes pg-rise-up {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pg-confetti-fall {
          from { transform: translateY(0) rotate(0deg); }
          to { transform: translateY(105vh) rotate(520deg); }
        }
      `}</style>
    </div>
  );
}
