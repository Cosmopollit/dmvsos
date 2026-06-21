'use client';
import { t } from '@/lib/translations';

// Big Telegram CTA — primary support channel.
// Drop this at the bottom of pages where users might need help.
//
// Props:
//   lang — language code
//   dark — true if parent has dark background (uses lighter text)
export default function SupportFooter({ lang = 'en', dark = false }) {
  const tex = t[lang] || t.en;
  const muted = dark ? '#94A3B8' : '#64748B';

  return (
    <div className="w-full max-w-md mx-auto py-6 px-4">
      <a
        href="https://t.me/dmvsos_support_bot"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full px-6 py-3.5 rounded-2xl font-semibold text-white text-sm transition shadow-sm hover:shadow-md"
        style={{ background: '#229ED9' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#1d8bbf')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '#229ED9')}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/>
        </svg>
        {tex.supportCta || 'Chat with us on Telegram'}
      </a>
      <p className="text-xs text-center mt-2.5" style={{ color: muted }}>
        {tex.supportResponseTime || 'Usually responds within 4 hours'}
      </p>
    </div>
  );
}
