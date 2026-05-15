'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { STATE_OPTIONS, stateToSlug } from '@/lib/states';

const CATEGORIES = [
  { value: 'car', label: 'Car' },
  { value: 'cdl', label: 'CDL' },
  { value: 'motorcycle', label: 'Motorcycle' },
];
const CDL_SUBS = [
  { value: 'general_knowledge', label: 'General Knowledge' },
  { value: 'air_brakes', label: 'Air Brakes' },
  { value: 'combination_vehicles', label: 'Combination Vehicles' },
];
const CORRECT_LETTERS = ['A', 'B', 'C', 'D'];

export default function NewQuestionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState(false);

  const [stateLabel, setStateLabel] = useState(STATE_OPTIONS[0]);
  const [category, setCategory] = useState('car');
  const [subcategory, setSubcategory] = useState('general_knowledge');
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [manualSection, setManualSection] = useState('');
  const [manualReference, setManualReference] = useState('');

  const [creating, setCreating] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [createdCluster, setCreatedCluster] = useState(null); // { id, cluster_code }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = sessionStorage.getItem('admin_pwd');
    if (saved) { setPassword(saved); setAuthenticated(true); }

    // Pre-fill state/cat from query if user came from list view
    const qState = searchParams.get('state');
    const qCat   = searchParams.get('cat');
    const qSub   = searchParams.get('sub');
    if (qState) {
      const opt = STATE_OPTIONS.find(s => stateToSlug(s) === qState);
      if (opt) setStateLabel(opt);
    }
    if (qCat && ['car','cdl','motorcycle'].includes(qCat)) setCategory(qCat);
    if (qSub && ['general_knowledge','air_brakes','combination_vehicles'].includes(qSub)) setSubcategory(qSub);
  }, [searchParams]);

  const login = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/admin-auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      sessionStorage.setItem('admin_pwd', password);
      setAuthenticated(true); setAuthError(false);
    } else setAuthError(true);
  };

  const updateOption = (i, val) => setOptions(prev => prev.map((o, idx) => idx === i ? val : o));

  const handleCreate = async () => {
    setError(''); setFlash('');
    if (!questionText.trim()) { setError('Question text required'); return; }
    for (let i = 0; i < 4; i++) {
      if (!options[i].trim()) { setError(`Option ${CORRECT_LETTERS[i]} required`); return; }
    }

    setCreating(true);
    try {
      const res = await fetch('/api/admin/create-question', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          state: stateToSlug(stateLabel),
          category,
          subcategory: category === 'cdl' ? subcategory : null,
          question_text: questionText,
          option_a: options[0], option_b: options[1], option_c: options[2], option_d: options[3],
          correct_answer: correctIndex,
          explanation:    explanation || null,
          image_url:      imageUrl || null,
          manual_section: manualSection || null,
          manual_reference: manualReference || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');

      setCreatedCluster({ id: data.id, cluster_code: data.cluster_code });
      setFlash(`✓ Created EN question. cluster_code = ${data.cluster_code}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleTranslate = async () => {
    if (!createdCluster) return;
    if (!confirm('Translate to RU, ES, ZH, UA via Haiku?\nEstimated cost: ~$0.01')) return;

    setTranslating(true); setError('');
    try {
      const res = await fetch('/api/admin/retranslate-cluster', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          cluster_code: createdCluster.cluster_code,
          state: stateToSlug(stateLabel),
          category,
          subcategory: category === 'cdl' ? subcategory : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Translation failed');
      const errCount = (data.results || []).filter(r => !r.ok).length;
      setFlash(`✓ Translated ${data.success}/${data.total} languages` + (errCount ? ` · ${errCount} failed` : ''));
    } catch (err) {
      setError(err.message);
    } finally {
      setTranslating(false);
    }
  };

  const goToEdit = () => {
    if (!createdCluster) return;
    const stateSlug = stateToSlug(stateLabel);
    const params = new URLSearchParams({
      state: stateSlug,
      cat: category,
      ...(category === 'cdl' ? { sub: subcategory } : {}),
    });
    router.push(`/admin/clusters/${encodeURIComponent(createdCluster.cluster_code)}?${params.toString()}`);
  };

  const handleAddAnother = () => {
    setCreatedCluster(null);
    setQuestionText('');
    setOptions(['','','','']);
    setCorrectIndex(0);
    setExplanation('');
    setImageUrl('');
    setManualSection('');
    setManualReference('');
    setFlash('');
  };

  if (!authenticated) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F1F5F9' }}>
        <form onSubmit={login} style={{ background: '#fff', padding: 32, borderRadius: 12, minWidth: 320 }}>
          <h1 style={{ marginTop: 0, fontSize: 18 }}>Admin · New question</h1>
          <input
            type="password" placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: 10, fontSize: 14, border: '1px solid #CBD5E1', borderRadius: 6 }}
          />
          {authError && <div style={{ color: '#DC2626', marginTop: 8, fontSize: 13 }}>Wrong password</div>}
          <button type="submit" style={{ marginTop: 12, width: '100%', padding: 10, background: '#2563EB', color: '#fff', border: 0, borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
            Sign in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: 20 }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0B1C3D', margin: 0 }}>
            + New question
          </h1>
          <Link href="/admin/clusters" style={{ color: '#2563EB', fontSize: 14 }}>← Back to clusters</Link>
        </header>

        {flash && (
          <div style={{ background: '#DCFCE7', color: '#166534', padding: 12, borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
            {flash}
          </div>
        )}
        {error && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: 12, borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Step 1: form (locked once created) */}
        <div style={{ background: '#fff', padding: 18, borderRadius: 8, border: '1px solid #E2E8F0', opacity: createdCluster ? 0.6 : 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>State</label>
              <select value={stateLabel} onChange={(e) => setStateLabel(e.target.value)} disabled={!!createdCluster} style={selectStyle}>
                {STATE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={!!createdCluster} style={selectStyle}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            {category === 'cdl' && (
              <div>
                <label style={labelStyle}>Subcategory</label>
                <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)} disabled={!!createdCluster} style={selectStyle}>
                  {CDL_SUBS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            )}
          </div>

          <label style={labelStyle}>Question (English)</label>
          <textarea
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            disabled={!!createdCluster}
            placeholder="e.g. What should you do when approaching a school bus with red flashing lights?"
            rows={2}
            style={{ ...inputStyle, fontWeight: 500, fontSize: 14 }}
          />

          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Options (mark the correct one)</label>
            {options.map((opt, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                <button
                  onClick={() => setCorrectIndex(i)}
                  disabled={!!createdCluster}
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    border: i === correctIndex ? '2px solid #16A34A' : '1px solid #CBD5E1',
                    background: i === correctIndex ? '#DCFCE7' : '#fff',
                    color: i === correctIndex ? '#166534' : '#0B1C3D',
                    fontWeight: 700, cursor: 'pointer',
                  }}
                  title={i === correctIndex ? 'Correct answer' : 'Mark as correct'}
                >
                  {CORRECT_LETTERS[i]}
                </button>
                <input
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  disabled={!!createdCluster}
                  placeholder={`Option ${CORRECT_LETTERS[i]}`}
                  style={{ ...inputStyle, flex: 1, marginTop: 0, background: i === correctIndex ? '#F0FDF4' : '#fff' }}
                />
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Explanation (optional)</label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              disabled={!!createdCluster}
              placeholder="1-2 sentences explaining why this is the correct answer"
              rows={2}
              style={{ ...inputStyle, fontSize: 13, color: '#475569' }}
            />
          </div>

          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#475569' }}>Advanced (optional)</summary>
            <div style={{ marginTop: 8 }}>
              <label style={labelStyle}>Image URL</label>
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                disabled={!!createdCluster}
                placeholder="Leave empty for now; upload via edit page after create"
                style={inputStyle}
              />
              <label style={{ ...labelStyle, marginTop: 8 }}>Manual section</label>
              <input
                value={manualSection}
                onChange={(e) => setManualSection(e.target.value)}
                disabled={!!createdCluster}
                placeholder="e.g. Section 5.1.14 – Spring Brakes"
                style={inputStyle}
              />
              <label style={{ ...labelStyle, marginTop: 8 }}>Manual reference (RAG context for Sonnet)</label>
              <textarea
                value={manualReference}
                onChange={(e) => setManualReference(e.target.value)}
                disabled={!!createdCluster}
                placeholder="Paste the relevant excerpt from the driver handbook"
                rows={3}
                style={{ ...inputStyle, fontSize: 12 }}
              />
            </div>
          </details>

          {!createdCluster && (
            <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
              <button onClick={handleCreate} disabled={creating} style={primaryBtn}>
                {creating ? 'Creating…' : '✓ Create EN question'}
              </button>
              <Link href="/admin/clusters" style={secondaryBtnLink}>Cancel</Link>
            </div>
          )}
        </div>

        {/* Step 2: after create — translate + edit */}
        {createdCluster && (
          <div style={{ background: '#fff', padding: 18, borderRadius: 8, border: '1px solid #16A34A', marginTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
              Created · cluster_code = <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>{createdCluster.cluster_code}</code>
            </div>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 14 }}>
              Next: auto-translate to RU/ES/ZH/UA via Haiku (~$0.01), then open the cluster editor to add image, verify quality, etc.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={handleTranslate} disabled={translating} style={primaryBtnAlt}>
                {translating ? 'Translating…' : '🔄 Translate to 4 languages'}
              </button>
              <button onClick={goToEdit} style={primaryBtn}>
                Open cluster editor →
              </button>
              <button onClick={handleAddAnother} style={secondaryBtn}>
                + Add another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle    = { display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 0 };
const inputStyle    = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #CBD5E1', borderRadius: 4, background: '#fff', color: '#0B1C3D', marginTop: 4, resize: 'vertical' };
const selectStyle   = { ...inputStyle };
const primaryBtn    = { padding: '8px 16px', fontSize: 13, background: '#2563EB', color: '#fff', border: 0, borderRadius: 6, fontWeight: 600, cursor: 'pointer' };
const primaryBtnAlt = { padding: '8px 16px', fontSize: 13, background: '#16A34A', color: '#fff', border: 0, borderRadius: 6, fontWeight: 600, cursor: 'pointer' };
const secondaryBtn  = { padding: '8px 16px', fontSize: 13, background: '#fff', color: '#475569', border: '1px solid #CBD5E1', borderRadius: 6, fontWeight: 600, cursor: 'pointer' };
const secondaryBtnLink = { padding: '8px 16px', fontSize: 13, background: '#fff', color: '#475569', border: '1px solid #CBD5E1', borderRadius: 6, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' };
