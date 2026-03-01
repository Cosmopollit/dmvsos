'use client';
import { useState } from 'react';
import { t } from '@/lib/translations';

export default function ManualContent({ sections, lang = 'en' }) {
  const [openSections, setOpenSections] = useState({ 0: true });
  const tex = t[lang] || t.en;

  function toggleSection(index) {
    setOpenSections(prev => ({ ...prev, [index]: !prev[index] }));
  }

  function expandAll() {
    const all = {};
    sections.forEach((_, i) => { all[i] = true; });
    setOpenSections(all);
  }

  function collapseAll() {
    setOpenSections({});
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={expandAll}
          className="text-xs text-[#2563EB] hover:underline font-medium"
        >
          {tex.manualsExpandAll}
        </button>
        <span className="text-[#CBD5E1]">|</span>
        <button
          type="button"
          onClick={collapseAll}
          className="text-xs text-[#2563EB] hover:underline font-medium"
        >
          {tex.manualsCollapseAll}
        </button>
      </div>

      {/* Table of Contents */}
      <nav className="bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] p-4 mb-6">
        <h3 className="text-sm font-bold text-[#1A2B4A] mb-2">{tex.manualsToc}</h3>
        <ol className="space-y-1">
          {sections.map((section, i) => (
            <li key={i}>
              <a
                href={`#${section.slug}`}
                className="text-sm text-[#2563EB] hover:underline"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Sections */}
      <div className="space-y-3">
        {sections.map((section, i) => (
          <div
            key={i}
            id={section.slug}
            className="border border-[#E2E8F0] rounded-xl overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggleSection(i)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-[#F8FAFC] transition-colors"
            >
              <h3 className="text-sm font-semibold text-[#1A2B4A]">
                {section.title}
              </h3>
              <svg
                className={`w-4 h-4 text-[#94A3B8] transition-transform ${openSections[i] ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div
              className={`overflow-hidden transition-[max-height] duration-300 ${openSections[i] ? 'max-h-[5000px]' : 'max-h-0'}`}
            >
              <div className="px-4 pb-4 text-sm text-[#475569] leading-relaxed whitespace-pre-line">
                {section.content}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
