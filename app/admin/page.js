'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase'; // used for storage and reads
import { STATE_OPTIONS, stateToSlug } from '@/lib/states';

const CATEGORIES = [
  { value: 'car', label: 'Car' },
  { value: 'cdl', label: 'CDL' },
  { value: 'motorcycle', label: 'Motorcycle' },
];

const CDL_SUBCATEGORIES = [
  { value: '', label: 'All CDL' },
  { value: 'general_knowledge', label: 'General Knowledge' },
  { value: 'air_brakes', label: 'Air Brakes' },
  { value: 'combination', label: 'Combination Vehicles' },
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
  const [subcategory, setSubcategory] = useState('');
  const [lang, setLang] = useState('en');
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [uploadingIndex, setUploadingIndex] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [csvMessage, setCsvMessage] = useState({ type: '', text: '' });
  const [editAllIndex, setEditAllIndex] = useState(null);
  const [editAllData, setEditAllData] = useState(null); // { en: {id, fields}, ru: ..., ... }
  const [editAllCorrect, setEditAllCorrect] = useState('A');
  const [editAllCorrectOriginal, setEditAllCorrectOriginal] = useState('A');
  const [editAllActiveLang, setEditAllActiveLang] = useState('en');
  const [editAllLoading, setEditAllLoading] = useState(false);
  const [editAllError, setEditAllError] = useState('');
  const [deleteModal, setDeleteModal] = useState(null); // { index, question, clusterRows: [{id,language},...] }
  const [deleteLangs, setDeleteLangs] = useState({}); // { en: true, ru: true, ... }
  const [deleteLoading, setDeleteLoading] = useState(false);
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
      let query = supabase
        .from('questions')
        .select('*')
        .eq('state', stateSlug)
        .eq('category', category)
        .eq('language', lang);
      if (category === 'cdl' && subcategory) {
        query = query.eq('subcategory', subcategory);
      }
      const { data, error } = await query.order('id', { ascending: true });
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
        cluster_code: row.cluster_code || null,
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
      correct_original: ['A','B','C','D'][correctIdx] ?? 'A',
      language: q.language ?? lang,
      state: q.state ?? stateToSlug(stateLabel),
      category: q.category ?? category,
      cluster_code: q.cluster_code ?? null,
    });
    setEditingIndex(i);
    setSaveError('');
  };

  const handleDeleteQuestion = async (i) => {
    const q = questions[i];
    if (!q?.id) return;

    // If question has cluster_code, load all language variants
    if (q.cluster_code) {
      try {
        const { data, error } = await supabase
          .from('questions')
          .select('id, language')
          .eq('cluster_code', q.cluster_code)
          .eq('state', q.state)
          .eq('category', q.category);
        if (error) throw new Error(error.message);
        const rows = data || [];
        const langs = {};
        for (const r of rows) langs[r.language] = true;
        setDeleteModal({ index: i, question: q, clusterRows: rows });
        setDeleteLangs(langs);
      } catch (err) {
        alert('Failed to load language variants: ' + err.message);
      }
    } else {
      // No cluster — show modal with just current language
      setDeleteModal({ index: i, question: q, clusterRows: [{ id: q.id, language: q.language || lang }] });
      setDeleteLangs({ [q.language || lang]: true });
    }
  };

  const confirmDelete = async () => {
    if (!deleteModal) return;
    const { index, clusterRows } = deleteModal;
    const idsToDelete = clusterRows
      .filter(r => deleteLangs[r.language])
      .map(r => r.id);

    if (idsToDelete.length === 0) return;
    setDeleteLoading(true);

    try {
      const res = await fetch('/api/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'delete', ids: idsToDelete }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');

      // If current language was deleted, remove from list
      if (deleteLangs[lang]) {
        setQuestions((prev) => prev.filter((_, idx) => idx !== index));
      }
      setDeleteModal(null);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditForm(null);
    setSaveError('');
  };

  const openEditAllForm = async (q, i) => {
    if (!q.cluster_code) return;
    setEditAllLoading(true);
    setEditAllError('');
    setEditAllIndex(i);
    setEditAllActiveLang('en');
    try {
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('cluster_code', q.cluster_code)
        .eq('state', q.state)
        .eq('category', q.category);
      if (error) throw new Error(error.message);
      const byLang = {};
      for (const row of (data || [])) {
        byLang[row.language] = {
          id: row.id,
          question_text: row.question_text || '',
          option_a: row.option_a || '',
          option_b: row.option_b || '',
          option_c: row.option_c || '',
          option_d: row.option_d || '',
          explanation: row.explanation || '',
          language: row.language,
        };
      }
      const correctIdx = q.correctAnswerIndex ?? 0;
      const correctLetter = ['A', 'B', 'C', 'D'][correctIdx] ?? 'A';
      setEditAllData(byLang);
      setEditAllCorrect(correctLetter);
      setEditAllCorrectOriginal(correctLetter);
    } catch (err) {
      setEditAllError(err.message || 'Failed to load all languages');
      setEditAllIndex(null);
    } finally {
      setEditAllLoading(false);
    }
  };

  const handleCancelEditAll = () => {
    setEditAllIndex(null);
    setEditAllData(null);
    setEditAllError('');
  };

  const handleSaveEditAll = async () => {
    if (!editAllData) return;
    setEditAllError('');
    const correctMap = { A: 0, B: 1, C: 2, D: 3 };
    const correctNum = correctMap[editAllCorrect] ?? 0;
    const rows = Object.values(editAllData)
      .filter(d => d.id)
      .map(d => ({ id: d.id, row: { ...d, correct_answer: correctNum } }));
    try {
      const res = await fetch('/api/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          action: 'save-all-langs',
          rows,
          correct_answer: correctNum,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      // Update local state for the EN question card
      if (editAllData.en) {
        setQuestions(prev => {
          const next = [...prev];
          next[editAllIndex] = {
            ...next[editAllIndex],
            question: editAllData.en.question_text,
            answers: [editAllData.en.option_a, editAllData.en.option_b, editAllData.en.option_c, editAllData.en.option_d],
            correctAnswerIndex: correctNum,
          };
          return next;
        });
      }
      handleCancelEditAll();
    } catch (err) {
      setEditAllError(err.message || 'Failed to save.');
    }
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
      const correctChanged = editForm.correct !== editForm.correct_original;
      const res = await fetch('/api/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          action: 'save',
          id: q?.id || null,
          row,
          cluster_code: editForm.cluster_code || null,
          propagate_correct_answer: correctChanged && !!editForm.cluster_code,
        }),
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

  const handleDeleteImage = async (questionIndex) => {
    const q = questions[questionIndex];
    if (!q?.id) return;
    if (!window.confirm('Remove this image?')) return;
    try {
      let storagePath = null;
      if (q.imageUrl) {
        const match = q.imageUrl.match(/question-images\/(.+)$/);
        if (match) storagePath = match[1];
      }
      const form = new FormData();
      form.append('password', password);
      form.append('questionId', String(q.id));
      form.append('action', 'delete');
      if (storagePath) form.append('path', storagePath);
      const res = await fetch('/api/admin/upload-image', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setQuestions((prev) => {
        const next = [...prev];
        next[questionIndex] = { ...next[questionIndex], imageUrl: null };
        return next;
      });
    } catch (err) {
      alert('Image delete failed: ' + err.message);
    }
  };

  const handleImageSelect = async (questionIndex, file) => {
    if (!file) return;
    const q = questions[questionIndex];
    if (!q?.id) { alert('Question has no ID — save it first.'); return; }
    setUploadingIndex(questionIndex);
    const stateSlug = stateToSlug(stateLabel);
    const langFolder = lang === 'zh' ? 'cn' : lang;
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${stateSlug}/${langFolder}/${category}/${q.id}.${ext}`;
    try {
      const form = new FormData();
      form.append('password', password);
      form.append('file', file);
      form.append('questionId', String(q.id));
      form.append('path', path);
      const res = await fetch('/api/admin/upload-image', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setQuestions((prev) => {
        const next = [...prev];
        next[questionIndex] = { ...next[questionIndex], imageUrl: data.url };
        return next;
      });
    } catch (err) {
      alert('Image upload failed: ' + err.message);
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
            {category === 'cdl' && (
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] uppercase tracking-wide mb-1">Subcategory</label>
                <select
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-xl text-[#1E293B] bg-[#F8FAFC] focus:outline-none focus:border-[#2563EB]"
                >
                  {CDL_SUBCATEGORIES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}
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
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-[#94A3B8]">Question {i + 1}</p>
                    {q.cluster_code && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] font-mono">
                        {q.cluster_code}
                      </span>
                    )}
                  </div>
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
                  {q.cluster_code && (
                    <button
                      type="button"
                      onClick={() => openEditAllForm(q, i)}
                      disabled={editAllLoading && editAllIndex === i}
                      className="shrink-0 px-3 py-1.5 rounded-lg border border-[#7C3AED] text-[#7C3AED] text-sm font-medium hover:bg-[#F5F3FF] disabled:opacity-60 transition"
                    >
                      {editAllLoading && editAllIndex === i ? 'Loading…' : 'All langs'}
                    </button>
                  )}
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
                    {uploadingIndex === i ? 'Uploading…' : (q.imageUrl ? '✓ Image' : 'Add Image')}
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
                  {editForm.cluster_code && (
                    <p className="text-xs text-[#64748B]">
                      Cluster: <span className="font-mono">{editForm.cluster_code}</span>
                      {editForm.correct !== editForm.correct_original && (
                        <span className="ml-2 text-[#F59E0B] font-medium">— correct answer will propagate to all 5 languages</span>
                      )}
                    </p>
                  )}
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
              {editAllIndex === i && editAllData && (
                <div className="mt-4 pt-4 border-t border-[#E2E8F0] space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-semibold text-[#7C3AED] uppercase tracking-wide">Edit all languages</span>
                    <span className="text-xs text-[#64748B] font-mono">{q.cluster_code}</span>
                  </div>
                  {/* Shared correct answer */}
                  <div>
                    <label className="block text-xs font-semibold text-[#1E293B] mb-1">Correct answer (shared for all languages)</label>
                    <div className="flex gap-2 items-center">
                      <select
                        value={editAllCorrect}
                        onChange={(e) => setEditAllCorrect(e.target.value)}
                        className="px-3 py-2 border border-[#E2E8F0] rounded-xl text-[#1E293B] bg-[#F8FAFC] focus:outline-none focus:border-[#7C3AED]"
                      >
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                      </select>
                      {editAllCorrect !== editAllCorrectOriginal && (
                        <span className="text-xs text-[#F59E0B] font-medium">will update all {Object.keys(editAllData).length} language rows</span>
                      )}
                    </div>
                  </div>
                  {/* Language tabs */}
                  <div>
                    <div className="flex gap-1 mb-3 flex-wrap">
                      {['en', 'ru', 'es', 'zh', 'ua'].filter(l => editAllData[l]).map(l => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setEditAllActiveLang(l)}
                          className={`px-3 py-1 rounded-lg text-sm font-medium transition ${editAllActiveLang === l ? 'bg-[#7C3AED] text-white' : 'border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]'}`}
                        >
                          {l.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    {editAllData[editAllActiveLang] && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-[#1E293B] mb-1">Question text</label>
                          <textarea
                            value={editAllData[editAllActiveLang].question_text}
                            onChange={(e) => setEditAllData(d => ({ ...d, [editAllActiveLang]: { ...d[editAllActiveLang], question_text: e.target.value } }))}
                            rows={3}
                            className="w-full px-3 py-2 border border-[#E2E8F0] rounded-xl text-[#1E293B] bg-[#F8FAFC] focus:outline-none focus:border-[#7C3AED]"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {['option_a', 'option_b', 'option_c', 'option_d'].map((key, idx) => (
                            <div key={key}>
                              <label className="block text-xs font-semibold text-[#1E293B] mb-1">Option {['A','B','C','D'][idx]}</label>
                              <input
                                value={editAllData[editAllActiveLang][key]}
                                onChange={(e) => setEditAllData(d => ({ ...d, [editAllActiveLang]: { ...d[editAllActiveLang], [key]: e.target.value } }))}
                                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-xl text-[#1E293B] bg-[#F8FAFC] focus:outline-none focus:border-[#7C3AED]"
                              />
                            </div>
                          ))}
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#1E293B] mb-1">Explanation</label>
                          <textarea
                            value={editAllData[editAllActiveLang].explanation}
                            onChange={(e) => setEditAllData(d => ({ ...d, [editAllActiveLang]: { ...d[editAllActiveLang], explanation: e.target.value } }))}
                            rows={2}
                            className="w-full px-3 py-2 border border-[#E2E8F0] rounded-xl text-[#1E293B] bg-[#F8FAFC] focus:outline-none focus:border-[#7C3AED]"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  {editAllError && <p className="text-sm text-red-500">{editAllError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveEditAll}
                      className="px-4 py-2 rounded-xl bg-[#7C3AED] text-white text-sm font-semibold hover:bg-[#6D28D9] transition"
                    >
                      Save all languages
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEditAll}
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
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-[#94A3B8] break-all flex-1">{q.imageUrl}</p>
                    <button
                      type="button"
                      onClick={() => handleDeleteImage(i)}
                      className="shrink-0 px-3 py-1 rounded-lg border border-red-200 text-red-500 text-xs font-medium hover:bg-red-50 transition"
                    >
                      Remove Image
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {questions.length === 0 && !loading && authenticated && (
          <p className="text-center text-[#94A3B8] py-8">Select state, category, language and click Load Questions.</p>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-[#0B1C3D] mb-2">Delete Question</h3>
            <p className="text-sm text-[#64748B] mb-4">
              &ldquo;{(deleteModal.question.question || '').slice(0, 100)}...&rdquo;
            </p>

            {deleteModal.clusterRows.length > 1 && (
              <>
                <p className="text-sm font-medium text-[#1E293B] mb-2">Select languages to delete:</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {LANGUAGES.map(({ value, label }) => {
                    const exists = deleteModal.clusterRows.some(r => r.language === value);
                    if (!exists) return null;
                    return (
                      <label key={value} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2E8F0] cursor-pointer hover:bg-[#F8FAFC] transition">
                        <input
                          type="checkbox"
                          checked={!!deleteLangs[value]}
                          onChange={(e) => setDeleteLangs(prev => ({ ...prev, [value]: e.target.checked }))}
                          className="accent-[#DC2626]"
                        />
                        <span className="text-sm text-[#1E293B]">{label}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      const all = {};
                      deleteModal.clusterRows.forEach(r => all[r.language] = true);
                      setDeleteLangs(all);
                    }}
                    className="text-xs text-[#2563EB] hover:underline"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteLangs({})}
                    className="text-xs text-[#64748B] hover:underline"
                  >
                    Deselect all
                  </button>
                </div>
              </>
            )}

            <p className="text-xs text-red-500 mb-4">
              This will delete {Object.values(deleteLangs).filter(Boolean).length} language version(s). This cannot be undone.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                className="px-4 py-2 rounded-xl border border-[#E2E8F0] text-[#64748B] text-sm font-medium hover:bg-[#F8FAFC] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteLoading || Object.values(deleteLangs).filter(Boolean).length === 0}
                className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting...' : `Delete (${Object.values(deleteLangs).filter(Boolean).length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
