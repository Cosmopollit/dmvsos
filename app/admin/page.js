'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase'; // used for storage and reads
import { STATE_OPTIONS, stateToSlug } from '@/lib/states';

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
  { value: 'ua', label: 'Ukrainian' },
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
  const [editingIndex, setEditingIndex] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [csvMessage, setCsvMessage] = useState({ type: '', text: '' });
  const fileInputRefs = useRef({});
  const csvInputRef = useRef(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setAuthenticated(true);
        setPasswordError(false);
      } else {
        setPasswordError(true);
      }
    } catch {
      setPasswordError(true);
    }
  };

  const handleLoadQuestions = async () => {
    setLoading(true);
    setLoadError('');
    const stateSlug = stateToSlug(stateLabel);
    try {
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('state', stateSlug)
        .eq('category', category)
        .eq('language', lang)
        .order('id', { ascending: true });
      if (error) throw new Error(error.message);
      const mapped = (data || []).map((row) => ({
        id: row.id,
        question: row.question_text,
        answers: [row.option_a, row.option_b, row.option_c, row.option_d].filter(Boolean),
        correctAnswerIndex: row.correct_answer,
        imageUrl: row.image_url || null,
        state: row.state,
        category: row.category,
        language: row.language,
      }));
      setQuestions(mapped);
      if (!mapped.length) setLoadError('No questions found for this selection.');
    } catch (err) {
      setLoadError(err.message || 'Failed to load questions.');
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  const openEditForm = (q, i) => {
    const answers = q.answers ?? [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean);
    const correctIdx = q.correctAnswerIndex ?? (typeof q.correct_answer === 'number' ? q.correct_answer : ['a','b','c','d'].indexOf(String((q.correct_answer || 'A')).toLowerCase()));
    setEditForm({
      question_text: (q.question_text ?? q.question ?? '').replace(/^\d+\.\s*/, ''),
      option_a: answers[0] ?? q.option_a ?? '',
      option_b: answers[1] ?? q.option_b ?? '',
      option_c: answers[2] ?? q.option_c ?? '',
      option_d: answers[3] ?? q.option_d ?? '',
      correct: ['A','B','C','D'][correctIdx] ?? 'A',
      language: q.language ?? lang,
      state: q.state ?? stateToSlug(stateLabel),
      category: q.category ?? category,
    });
    setEditingIndex(i);
    setSaveError('');
  };

  const handleDeleteQuestion = async (i) => {
    const q = questions[i];
    if (!q?.id) return;
    if (!window.confirm(`Delete question #${i + 1}?\n\n"${(q.question || '').slice(0, 80)}..."\n\nThis cannot be undone.`)) return;
    try {
      const res = await fetch('/api/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'delete', id: q.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      setQuestions((prev) => prev.filter((_, idx) => idx !== i));
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditForm(null);
    setSaveError('');
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;
    setSaveError('');
    const correctMap = { A: 0, B: 1, C: 2, D: 3 };
    const row = {
      state: (editForm.state || '').trim().toLowerCase().replace(/\s+/g, '-'),
      category: (editForm.category || 'car').toLowerCase(),
      language: (editForm.language || 'en').toLowerCase(),
      question_text: (editForm.question_text || '').trim(),
      option_a: (editForm.option_a || '').trim(),
      option_b: (editForm.option_b || '').trim(),
      option_c: (editForm.option_c || '').trim(),
      option_d: (editForm.option_d || '').trim(),
      correct_answer: correctMap[editForm.correct] ?? 0,
    };
    if (!row.question_text || !row.option_a) {
      setSaveError('Question text and at least option A are required.');
      return;
    }
    try {
      const q = questions[editingIndex];
      const res = await fetch('/api/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'save', id: q?.id || null, row }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setQuestions((prev) => {
        const next = [...prev];
        next[editingIndex] = {
          ...next[editingIndex],
          id: q?.id || data.id,
          question: row.question_text,
          answers: [row.option_a, row.option_b, row.option_c, row.option_d],
          correctAnswerIndex: row.correct_answer,
          state: row.state,
          category: row.category,
          language: row.language,
        };
        return next;
      });
      handleCancelEdit();
    } catch (err) {
      setSaveError(err.message || 'Failed to save.');
    }
  };

  const handleDownloadSampleCsv = () => {
    const header = 'state,category,lang,question,a,b,c,d,correct';
    const row = 'washington,car,en,"What does a solid white line between lanes mean?",Do not change lanes,Slow down,Speed up,Stop,A';
    const blob = new Blob([header + '\n' + row], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'questions_sample.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleCsvUpload = async (e) => {
    const file = e.target?.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCsvMessage({ type: '', text: '' });
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      setCsvMessage({ type: 'error', text: 'CSV must have a header row and at least one data row.' });
      return;
    }
    const header = lines[0].toLowerCase();
    const cols = header.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const stateIdx = cols.indexOf('state');
    const categoryIdx = cols.indexOf('category');
    const langIdx = cols.indexOf('lang');
    const questionIdx = cols.indexOf('question');
    const aIdx = cols.indexOf('a');
    const bIdx = cols.indexOf('b');
    const cIdx = cols.indexOf('c');
    const dIdx = cols.indexOf('d');
    const correctIdx = cols.indexOf('correct');
    if ([stateIdx, categoryIdx, langIdx, questionIdx, aIdx, bIdx, cIdx, dIdx, correctIdx].some((i) => i === -1)) {
      setCsvMessage({ type: 'error', text: 'CSV must have columns: state, category, lang, question, a, b, c, d, correct' });
      return;
    }
    const parseRow = (line) => {
      const out = [];
      let i = 0;
      while (i < line.length) {
        if (line[i] === '"') {
          let end = i + 1;
          while (end < line.length) {
            const next = line.indexOf('"', end);
            if (next === -1) break;
            if (line[next + 1] === '"') { end = next + 2; continue; }
            out.push(line.slice(i + 1, next).replace(/""/g, '"').trim());
            end = next + 1;
            break;
          }
          i = end;
          if (line[i] === ',') i++;
          continue;
        }
        const comma = line.indexOf(',', i);
        const val = comma === -1 ? line.slice(i) : line.slice(i, comma);
        out.push(val.trim());
        i = comma === -1 ? line.length : comma + 1;
      }
      return out;
    };
    const correctToNum = (v) => {
      const s = String(v).toUpperCase();
      if (s === 'A' || s === '0') return 0;
      if (s === 'B' || s === '1') return 1;
      if (s === 'C' || s === '2') return 2;
      if (s === 'D' || s === '3') return 3;
      return 0;
    };
    const csvRows = [];
    const errors = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const cells = parseRow(line);
      const get = (idx) => (cells[idx] ?? '').trim();
      const state = get(stateIdx).toLowerCase().replace(/\s+/g, '-');
      const category = get(categoryIdx).toLowerCase() || 'car';
      const language = get(langIdx).toLowerCase() || 'en';
      const question_text = get(questionIdx);
      const option_a = get(aIdx);
      const option_b = get(bIdx);
      const option_c = get(cIdx);
      const option_d = get(dIdx);
      const correct = correctToNum(get(correctIdx));
      if (!question_text || !option_a) {
        errors.push(`Row ${i + 1}: missing question or option A`);
        continue;
      }
      csvRows.push({ state, category, language, question_text, option_a, option_b, option_c, option_d, correct_answer: correct });
    }
    try {
      const res = await fetch('/api/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'csv-upload', rows: csvRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      const inserted = data.inserted || 0;
      const serverErrors = data.errors || [];
      errors.push(...serverErrors);
      const successText = inserted > 0 ? `Uploaded ${inserted} question(s).` : '';
      const errorText = errors.length > 0 ? (errors.length > 3 ? `Errors: ${errors.slice(0, 3).join('; ')}... and ${errors.length - 3} more.` : errors.join('; ')) : '';
      setCsvMessage({ type: errors.length > 0 ? 'error' : 'success', text: [successText, errorText].filter(Boolean).join(' ') });
    } catch (err) {
      setCsvMessage({ type: 'error', text: err.message || 'Upload failed' });
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

        <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm mb-6">
          <h2 className="text-lg font-bold text-[#0B1C3D] mb-3">Bulk upload (CSV)</h2>
          <p className="text-sm text-[#64748B] mb-3">Format: state, category, lang, question, a, b, c, d, correct</p>
          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="button"
              onClick={handleDownloadSampleCsv}
              className="px-4 py-2 rounded-xl border border-[#E2E8F0] text-[#1E293B] text-sm font-medium hover:bg-[#F8FAFC] transition"
            >
              Download sample CSV
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleCsvUpload}
            />
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-[#2563EB] text-white text-sm font-medium hover:bg-[#1D4ED8] transition"
            >
              Upload CSV
            </button>
          </div>
          {csvMessage.text && (
            <p className={`mt-3 text-sm ${csvMessage.type === 'error' ? 'text-red-500' : 'text-green-600'}`}>
              {csvMessage.text}
            </p>
          )}
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
                  <button
                    type="button"
                    onClick={() => openEditForm(q, i)}
                    className="shrink-0 px-3 py-1.5 rounded-lg border border-[#2563EB] text-[#2563EB] text-sm font-medium hover:bg-[#EFF6FF] transition"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteQuestion(i)}
                    className="shrink-0 px-3 py-1.5 rounded-lg border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 transition"
                  >
                    Delete
                  </button>
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
              {editingIndex === i && editForm && (
                <div className="mt-4 pt-4 border-t border-[#E2E8F0] space-y-3">
                  <label className="block text-xs font-semibold text-[#1E293B]">Question text</label>
                  <textarea
                    value={editForm.question_text}
                    onChange={(e) => setEditForm((f) => ({ ...f, question_text: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-[#E2E8F0] rounded-xl text-[#1E293B] bg-[#F8FAFC] focus:outline-none focus:border-[#2563EB]"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {['option_a', 'option_b', 'option_c', 'option_d'].map((key, idx) => (
                      <div key={key}>
                        <label className="block text-xs font-semibold text-[#1E293B]">Option {['A','B','C','D'][idx]}</label>
                        <input
                          value={editForm[key]}
                          onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                          className="w-full px-3 py-2 border border-[#E2E8F0] rounded-xl text-[#1E293B] bg-[#F8FAFC] focus:outline-none focus:border-[#2563EB]"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#1E293B]">Correct answer</label>
                      <select
                        value={editForm.correct}
                        onChange={(e) => setEditForm((f) => ({ ...f, correct: e.target.value }))}
                        className="w-full px-3 py-2 border border-[#E2E8F0] rounded-xl text-[#1E293B] bg-[#F8FAFC] focus:outline-none focus:border-[#2563EB]"
                      >
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#1E293B]">Language</label>
                      <select
                        value={editForm.language}
                        onChange={(e) => setEditForm((f) => ({ ...f, language: e.target.value }))}
                        className="w-full px-3 py-2 border border-[#E2E8F0] rounded-xl text-[#1E293B] bg-[#F8FAFC] focus:outline-none focus:border-[#2563EB]"
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l.value} value={l.value}>{l.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#1E293B]">State (slug)</label>
                      <input
                        value={editForm.state}
                        onChange={(e) => setEditForm((f) => ({ ...f, state: e.target.value }))}
                        placeholder="e.g. washington"
                        className="w-full px-3 py-2 border border-[#E2E8F0] rounded-xl text-[#1E293B] bg-[#F8FAFC] focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#1E293B]">Category</label>
                      <select
                        value={editForm.category}
                        onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                        className="w-full px-3 py-2 border border-[#E2E8F0] rounded-xl text-[#1E293B] bg-[#F8FAFC] focus:outline-none focus:border-[#2563EB]"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {saveError && <p className="text-sm text-red-500">{saveError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="px-4 py-2 rounded-xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-[#1D4ED8] transition"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-4 py-2 rounded-xl border border-[#E2E8F0] text-[#1E293B] text-sm font-medium hover:bg-[#F8FAFC] transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
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
