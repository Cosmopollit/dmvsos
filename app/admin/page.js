'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const ADMIN_PASSWORD = 'dmvsos2026admin';

const STATE_OPTIONS = [
  'Alabama (AL)', 'Alaska (AK)', 'Arizona (AZ)', 'Arkansas (AR)',
  'California (CA)', 'Colorado (CO)', 'Connecticut (CT)', 'Delaware (DE)',
  'Florida (FL)', 'Georgia (GA)', 'Hawaii (HI)', 'Idaho (ID)',
  'Illinois (IL)', 'Indiana (IN)', 'Iowa (IA)', 'Kansas (KS)',
  'Kentucky (KY)', 'Louisiana (LA)', 'Maine (ME)', 'Maryland (MD)',
  'Massachusetts (MA)', 'Michigan (MI)', 'Minnesota (MN)', 'Mississippi (MS)',
  'Missouri (MO)', 'Montana (MT)', 'Nebraska (NE)', 'Nevada (NV)',
  'New Hampshire (NH)', 'New Jersey (NJ)', 'New Mexico (NM)', 'New York (NY)',
  'North Carolina (NC)', 'North Dakota (ND)', 'Ohio (OH)', 'Oklahoma (OK)',
  'Oregon (OR)', 'Pennsylvania (PA)', 'Rhode Island (RI)', 'South Carolina (SC)',
  'South Dakota (SD)', 'Tennessee (TN)', 'Texas (TX)', 'Utah (UT)',
  'Vermont (VT)', 'Virginia (VA)', 'Washington (WA)', 'West Virginia (WV)',
  'Wisconsin (WI)', 'Wyoming (WY)',
];

function stateToSlug(displayState) {
  if (!displayState) return '';
  const name = displayState.replace(/\s*\([A-Z]{2}\)\s*$/, '').trim();
  return name.toLowerCase().replace(/\s+/g, '-');
}

const CATEGORIES = [
  { value: 'car', label: 'Car' },
  { value: 'cdl', label: 'CDL' },
  { value: 'motorcycle', label: 'Motorcycle' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Russian' },
  { value: 'es', label: 'Spanish' },
  { value: 'zh', label: 'Chinese' },
];

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [stateLabel, setStateLabel] = useState(STATE_OPTIONS[0]);
  const [category, setCategory] = useState('car');
  const [lang, setLang] = useState('en');
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [uploadingIndex, setUploadingIndex] = useState(null);
  const fileInputRefs = useRef({});

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setAuthenticated(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  const handleLoadQuestions = async () => {
    setLoading(true);
    setLoadError('');
    const stateSlug = stateToSlug(stateLabel);
    const langFolder = lang === 'zh' ? 'cn' : lang;
    try {
      const res = await fetch(`/data/${langFolder}/${stateSlug}.json`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      const test = data[category]?.[0];
      setQuestions(test?.questions ?? []);
      if (!test?.questions?.length) setLoadError('No questions found for this selection.');
    } catch (err) {
      setLoadError(err.message || 'Failed to load questions.');
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = async (questionIndex, file) => {
    if (!file) return;
    setUploadingIndex(questionIndex);
    const stateSlug = stateToSlug(stateLabel);
    const langFolder = lang === 'zh' ? 'cn' : lang;
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${stateSlug}/${langFolder}/${category}/${questionIndex}.${ext}`;
    try {
      const { error } = await supabase.storage.from('question-images').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('question-images').getPublicUrl(path);
      setQuestions((prev) => {
        const next = [...prev];
        next[questionIndex] = { ...next[questionIndex], imageUrl: publicUrl };
        return next;
      });
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploadingIndex(null);
    }
  };

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm border border-[#E2E8F0] shadow-sm">
          <h1 className="text-xl font-bold text-[#0B1C3D] mb-4">Admin Login</h1>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(false); }}
              placeholder="Password"
              className="w-full px-4 py-3 border border-[#E2E8F0] rounded-xl text-[#1E293B] mb-3 focus:outline-none focus:border-[#2563EB]"
              autoFocus
            />
            {passwordError && (
              <p className="text-sm text-red-500 mb-3">Incorrect password</p>
            )}
            <button type="submit" className="w-full bg-[#0B1C3D] text-white py-3 rounded-xl font-semibold hover:bg-[#132248] transition">
              Log in
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-[#0B1C3D] mb-6">Admin — Manage Questions & Images</h1>

        <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] uppercase tracking-wide mb-1">State</label>
              <select
                value={stateLabel}
                onChange={(e) => setStateLabel(e.target.value)}
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-xl text-[#1E293B] bg-[#F8FAFC] focus:outline-none focus:border-[#2563EB]"
              >
                {STATE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] uppercase tracking-wide mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-xl text-[#1E293B] bg-[#F8FAFC] focus:outline-none focus:border-[#2563EB]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] uppercase tracking-wide mb-1">Language</label>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-xl text-[#1E293B] bg-[#F8FAFC] focus:outline-none focus:border-[#2563EB]"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleLoadQuestions}
                disabled={loading}
                className="w-full bg-[#2563EB] text-white py-2.5 rounded-xl font-semibold hover:bg-[#1D4ED8] disabled:opacity-60 transition"
              >
                {loading ? 'Loading…' : 'Load Questions'}
              </button>
            </div>
          </div>
          {loadError && <p className="text-sm text-red-500">{loadError}</p>}
        </div>

        <div className="space-y-4">
          {questions.map((q, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-[#E2E8F0] shadow-sm">
              <div className="flex flex-wrap gap-2 items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#94A3B8] mb-1">Question {i + 1}</p>
                  <p className="text-[#1E293B] font-medium mb-2">{(q.question || '').replace(/^\d+\.\s*/, '')}</p>
                  <p className="text-sm text-[#2563EB]">
                    Correct: <strong>{q.answers?.[q.correctAnswerIndex] ?? '—'}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    ref={(el) => { fileInputRefs.current[i] = el; }}
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageSelect(i, f); e.target.value = ''; }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRefs.current[i]?.click()}
                    disabled={uploadingIndex === i}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-[#0B1C3D] text-white text-sm font-medium hover:bg-[#132248] disabled:opacity-60 transition"
                  >
                    {uploadingIndex === i ? 'Uploading…' : 'Add Image'}
                  </button>
                </div>
              </div>
              {q.imageUrl && (
                <div className="mt-3 pt-3 border-t border-[#E2E8F0]">
                  <img src={q.imageUrl} alt="" className="max-h-32 rounded-lg border border-[#E2E8F0] mb-2" />
                  <p className="text-xs text-[#94A3B8] break-all">{q.imageUrl}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {questions.length === 0 && !loading && authenticated && (
          <p className="text-center text-[#94A3B8] py-8">Select state, category, language and click Load Questions.</p>
        )}
      </div>
    </main>
  );
}
