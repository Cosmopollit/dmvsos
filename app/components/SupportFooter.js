'use client';
import { t } from '@/lib/translations';

// Small, unobtrusive footer block surfacing real support channels.
// Drop this at the bottom of pages where users might need help.
export default function SupportFooter({ lang = 'en', dark = false }) {
  const tex = t[lang] || t.en;
  const color = dark ? '#94A3B8' : '#64748B';
  const linkColor = dark ? '#CBD5E1' : '#2563EB';

  return (
    <div className="w-full max-w-2xl mx-auto py-6 text-center text-xs" style={{ color }}>
      <p className="mb-2">{tex.supportTitle || 'Need help? Reach Evgenii (founder) directly:'}</p>
      <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <a
          href="https://t.me/dmvsos_support_bot"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline inline-flex items-center gap-1"
          style={{ color: linkColor }}
        >
          ✈️ Telegram
        </a>
        <span style={{ color }}>·</span>
        <a
          href="mailto:maindmvsos@gmail.com"
          className="hover:underline inline-flex items-center gap-1"
          style={{ color: linkColor }}
        >
          ✉️ maindmvsos@gmail.com
        </a>
      </p>
      <p className="mt-2 text-[10px]" style={{ color }}>
        {tex.supportResponseTime || 'Usually responds within 4 hours'}
      </p>
    </div>
  );
}
