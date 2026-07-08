'use client';
// Paywall "Access Terminal": the question bank rendered as a scan console.
// Theater around honest numbers — the pool count is real, the locked rows
// are real questions from this state's bank with the text redacted. The
// copy never makes an origin claim; the frame does the selling. CTA stays
// the standard gold GradientButton (the money color), and payment itself
// remains the plain honest Stripe flow — the game ends before checkout.
import GradientButton from '@/app/components/GradientButton';

const MONO = 'var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace';

// Keep the first few words readable, replace the rest with block glyphs so
// the row reads as a locked record (works for RU/ZH too — word split falls
// back to a character budget for CJK).
function redact(text, keepWords) {
  const raw = String(text || '').trim();
  const words = raw.split(/\s+/);
  const kept = words.length > 1
    ? words.slice(0, keepWords).join(' ')
    : raw.slice(0, 10);
  const hidden = Math.max(0, raw.length - kept.length);
  return { kept, blocks: '█'.repeat(Math.max(6, Math.min(16, Math.round(hidden / 3)))) };
}

export default function AccessTerminal({
  tex, stateName, total, seen, rows, target, ctaText, onBuy, buyLoading, children,
}) {
  const pct = total > 0 ? Math.max(0.1, Math.round((seen / total) * 1000) / 10) : 0;
  // Competence line: the system "identifies the target" using real facts we
  // know about this state — the correct agency (DPS/DOL/MVD, not a generic
  // DMV), the real exam size and pass mark. Proving we know the specifics is
  // what makes the bank feel real instead of a fake gimmick.
  const targetLine = target?.agency && target?.q && target?.p
    ? (tex.termTarget || 'Target locked: {agency} · {q}-question exam · pass {p}%')
        .replace('{agency}', target.agency)
        .replace('{q}', String(target.q))
        .replace('{p}', String(target.p))
    : null;
  return (
    <div className="rounded-2xl overflow-hidden border border-[#1E3A5F] text-left mb-4"
      style={{ background: '#081226', fontFamily: MONO }}>
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#12233F]">
        <span className="w-2 h-2 rounded-full bg-[#22C55E]" aria-hidden="true" />
        <span className="text-[10px] tracking-widest text-[#7DD3FC] uppercase truncate">
          DMVSOS QUESTION BANK // {stateName}
        </span>
      </div>

      <div className="px-4 py-3.5">
        {/* Competence: identify the target from real state facts */}
        {targetLine && (
          <div className="term-row flex items-start gap-1.5 text-[11px] text-[#5EEAD4] mb-2.5 leading-snug" style={{ animationDelay: '0.2s' }}>
            <span className="text-[#0EA5E9] shrink-0">&gt;</span>
            <span>{targetLine}</span>
          </div>
        )}
        {/* Scan */}
        <div className="text-[11px] text-[#94A3B8] mb-1.5">
          {tex.termScanning || 'Scanning the question bank...'}
        </div>
        <div className="h-1 rounded bg-[#12233F] mb-2.5 overflow-hidden">
          <div className="term-scan-bar h-full rounded bg-[#22C55E]" />
        </div>
        <div className="term-row text-[12px] font-bold text-[#E2E8F0] mb-3" style={{ animationDelay: '1.2s' }}>
          {(tex.termFound || 'Found: {n} questions').replace('{n}', String(total))}
        </div>

        {/* Locked records — real questions, redacted */}
        <div className="mb-3">
          {rows.map((r, i) => {
            const { kept, blocks } = redact(r.question, 3);
            return (
              <div key={i} className="term-row flex items-center gap-2 text-[11px] leading-snug py-[3px]"
                style={{ animationDelay: `${1.5 + i * 0.18}s` }}>
                <span className="text-[#475569] shrink-0">#{String(r.n).padStart(4, '0')}</span>
                <span className="truncate min-w-0">
                  <span className="text-[#CBD5E1]">{kept} </span>
                  <span className="text-[#334155]">{blocks}</span>
                </span>
                <span className="ml-auto shrink-0 text-[9px] font-bold tracking-wider text-[#F59E0B] border border-[#F59E0B]/40 rounded px-1 py-px">
                  LOCKED
                </span>
              </div>
            );
          })}
          <div className="term-row text-[10px] text-[#475569] pt-1" style={{ animationDelay: '2.3s' }}>
            {(tex.termMore || '...{n} more locked entries').replace('{n}', String(Math.max(0, total - seen - rows.length)))}
          </div>
        </div>

        {/* Access meter */}
        <div className="term-row" style={{ animationDelay: '2.5s' }}>
          <div className="flex items-baseline justify-between text-[11px] mb-1">
            <span className="text-[#94A3B8]">
              {(tex.termAccess || 'Your access: {seen} of {n}')
                .replace('{seen}', String(seen)).replace('{n}', String(total))}
            </span>
            <span className="text-[#F87171] font-bold">{pct}%<span className="term-caret">_</span></span>
          </div>
          <div className="h-1 rounded bg-[#12233F] overflow-hidden">
            <div className="h-full rounded bg-[#F87171]" style={{ width: `${Math.max(2, pct)}%` }} />
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="px-4 pb-4 pt-1">
        <GradientButton variant="gold" onClick={onBuy}
          className={buyLoading ? 'pointer-events-none opacity-60' : ''}>
          <span className="text-[15px]">{buyLoading ? '…' : ctaText}</span>
        </GradientButton>
        {children}
      </div>
    </div>
  );
}
