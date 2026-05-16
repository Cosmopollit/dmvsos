'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';

const NASTYA_EMAIL = 'anastasiyarubkevich@gmail.com';
const SEEN_FLAG = 'nastya_greeted_v1';

export default function NastyaGreeting() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    if (user.email.toLowerCase() !== NASTYA_EMAIL) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(SEEN_FLAG) === 'true') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(true);
  }, [user?.email]);

  if (!show) return null;

  const dismiss = () => {
    try { localStorage.setItem(SEEN_FLAG, 'true'); } catch (_) {}
    setShow(false);
  };

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'radial-gradient(circle at center, #FFE4EC 0%, #FECDD3 50%, #FB7185 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        animation: 'nastya-fade-in 0.6s ease-out',
        overflow: 'hidden',
        padding: 24,
        textAlign: 'center',
      }}
    >
      {/* Giant heart — covers most of the screen */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          fontSize: 'min(95vw, 95vh)',
          lineHeight: 1,
          color: '#E11D48',
          animation: 'nastya-heart-beat 1.2s ease-in-out infinite',
          filter: 'drop-shadow(0 20px 40px rgba(225, 29, 72, 0.4))',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        ❤
      </div>

      {/* Floating mini hearts */}
      {[...Array(12)].map((_, i) => (
        <div
          key={i}
          aria-hidden
          style={{
            position: 'absolute',
            fontSize: `${24 + (i % 4) * 8}px`,
            color: '#BE185D',
            opacity: 0.6,
            top: `${(i * 37) % 90 + 5}%`,
            left: `${(i * 53) % 90 + 5}%`,
            animation: `nastya-float-${i % 3} ${3 + (i % 3)}s ease-in-out infinite`,
            animationDelay: `${i * 0.2}s`,
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          {['💕', '💖', '💗', '💝'][i % 4]}
        </div>
      ))}

      {/* Message card */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          borderRadius: 24,
          padding: '32px 28px',
          maxWidth: 420,
          boxShadow: '0 30px 80px rgba(190, 24, 93, 0.35)',
          animation: 'nastya-card-up 0.8s ease-out 0.2s both',
        }}
      >
        <div style={{ fontSize: 32, fontWeight: 800, color: '#831843', marginBottom: 10, lineHeight: 1.2 }}>
          Настюша 💕
        </div>
        <div style={{ fontSize: 17, color: '#9F1239', lineHeight: 1.5, marginBottom: 18 }}>
          Добро пожаловать!<br />
          Мы тебя давно не видели.<br />
          Давай больше не будем ругаться.<br />
          <strong>Очень люблю</strong> ❤️
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); dismiss(); }}
          style={{
            background: 'linear-gradient(135deg, #E11D48, #BE185D)',
            color: '#fff',
            border: 0,
            padding: '12px 28px',
            borderRadius: 14,
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 8px 20px rgba(225, 29, 72, 0.4)',
          }}
        >
          Спасибо ❤️
        </button>
      </div>

      <style jsx>{`
        @keyframes nastya-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes nastya-heart-beat {
          0%, 100% { transform: scale(1); }
          15% { transform: scale(1.08); }
          30% { transform: scale(0.96); }
          45% { transform: scale(1.04); }
          60% { transform: scale(1); }
        }
        @keyframes nastya-card-up {
          from { opacity: 0; transform: translateY(40px) scale(0.92); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes nastya-float-0 {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-30px) rotate(15deg); }
        }
        @keyframes nastya-float-1 {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-50px) rotate(-12deg); }
        }
        @keyframes nastya-float-2 {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-25px) rotate(8deg); }
        }
      `}</style>
    </div>
  );
}
