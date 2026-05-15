'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const LANGS = ['en', 'ru', 'es', 'zh', 'ua'];
const LANG_LABELS = { en: 'English', ru: 'Русский', es: 'Español', zh: '中文', ua: 'Українська' };
const LANG_FLAGS  = { en: '🇺🇸', ru: '🇷🇺', es: '🇪🇸', zh: '🇨🇳', ua: '🇺🇦' };
const CORRECT_LETTERS = ['A','B','C','D'];

function getPasswordFromSession() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('admin_pwd') || '';
}

export default function ClusterDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const cluster_code = decodeURIComponent(params.code);
  const state = searchParams.get('state');
  const category = searchParams.get('cat');
  const subcategory = searchParams.get('sub') || null;

  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState(false);

  const [byLang, setByLang] = useState(null);
  const [originalByLang, setOriginalByLang] = useState(null); // snapshot for diff
  const [correctIndex, setCorrectIndex] = useState(0);
  const [originalCorrectIndex, setOriginalCorrectIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savingLang, setSavingLang] = useState(null);
  const [savingAll, setSavingAll] = useState(false);
  const [savingAndBack, setSavingAndBack] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [retranslating, setRetranslating] = useState(null); // 'all' | lang | null
  const [uploadingImage, setUploadingImage] = useState(false);
  const [deletingImage, setDeletingImage] = useState(false);
  const [verifyingQuality, setVerifyingQuality] = useState(false);
  const [qualityVerdict, setQualityVerdict] = useState(null);
  const [flash, setFlash] = useState('');
  const fileInputRef = useRef(null);

  // Backlink that preserves state/cat/sub
  const backHref = `/admin/clusters?state=${state}&cat=${category}${subcategory ? `&sub=${subcategory}` : ''}`;

  // Try saved password first
  useEffect(() => {
    const saved = getPasswordFromSession();
    if (saved) { setPassword(saved); setAuthenticated(true); }
  }, []);

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

  const fetchCluster = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin/cluster-detail', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'get', cluster_code, state, category, subcategory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setByLang(data.byLang);
      // Deep clone for diff comparison
      setOriginalByLang(JSON.parse(JSON.stringify(data.byLang)));
      const en = data.byLang.en;
      const idx = typeof en?.correct_answer === 'number' ? en.correct_answer : 0;
      setCorrectIndex(idx);
      setOriginalCorrectIndex(idx);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [password, cluster_code, state, category, subcategory]);

  useEffect(() => { if (authenticated) fetchCluster(); }, [authenticated, fetchCluster]);

  const updateField = (lang, field, value) => {
    setByLang((prev) => prev ? ({
      ...prev,
      [lang]: prev[lang] ? { ...prev[lang], [field]: value } : prev[lang],
    }) : prev);
  };

  const showFlash = (msg) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 3000);
  };

  // Compute human-readable diff between current byLang state and original snapshot.
  // Returns array of strings like ["EN · question_text", "RU · option_b", ...]
  // Optional `forLang` filter restricts to one language.
  const computeDiff = (forLang = null) => {
    if (!byLang || !originalByLang) return [];
    const FIELDS = ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'explanation'];
    const changes = [];
    const langs = forLang ? [forLang] : LANGS;
    for (const lang of langs) {
      const cur = byLang[lang]; const orig = originalByLang[lang];
      if (!cur || !orig) continue;
      for (const f of FIELDS) {
        const a = cur[f] ?? null; const b = orig[f] ?? null;
        if (a !== b) changes.push(`${lang.toUpperCase()} · ${f}`);
      }
      // EN-specific fields
      if (lang === 'en') {
        if ((cur.image_url ?? null) !== (orig.image_url ?? null)) changes.push('EN · image_url');
        if ((cur.manual_reference ?? null) !== (orig.manual_reference ?? null)) changes.push('EN · manual_reference');
        if ((cur.manual_section ?? null) !== (orig.manual_section ?? null)) changes.push('EN · manual_section');
      }
    }
    // Correct answer change (shared)
    if (correctIndex !== originalCorrectIndex && (forLang === null || forLang === 'en')) {
      changes.push(`correct_answer · ${CORRECT_LETTERS[originalCorrectIndex]} → ${CORRECT_LETTERS[correctIndex]}`);
    }
    return changes;
  };

  const confirmChanges = (changes, action) => {
    if (changes.length === 0) {
      return confirm(`No changes detected. ${action} anyway?`);
    }
    const list = changes.length <= 12
      ? changes.join('\n')
      : changes.slice(0, 12).join('\n') + `\n... +${changes.length - 12} more`;
    return confirm(`About to ${action}.\n\nChanges (${changes.length}):\n${list}\n\nProceed?`);
  };

  const saveLang = async (lang) => {
    const row = byLang?.[lang];
    if (!row?.id) return;
    const changes = computeDiff(lang);
    if (!confirmChanges(changes, `save ${LANG_LABELS[lang]}`)) return;
    setSavingLang(lang); setError('');
    try {
      const payload = {
        question_text: row.question_text,
        option_a: row.option_a, option_b: row.option_b,
        option_c: row.option_c, option_d: row.option_d,
        explanation: row.explanation || null,
      };
      // EN-only fields: correct_answer + image_url propagation
      if (lang === 'en') {
        payload.correct_answer = correctIndex;
        payload.image_url = row.image_url || null;
        payload.manual_reference = row.manual_reference || null;
        payload.manual_section   = row.manual_section || null;
      }

      const res = await fetch('/api/admin/cluster-detail', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password, action: 'save', id: row.id, row: payload,
          propagate: lang === 'en' ? {
            correct_answer: correctIndex !== originalCorrectIndex ? correctIndex : undefined,
            image_url: row.image_url !== undefined ? (row.image_url || null) : undefined,
          } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      let msg = `Saved ${LANG_LABELS[lang]}`;
      if (data.stale_set > 0) msg += ` · marked ${data.stale_set} translations stale`;
      if (data.propagated > 0) msg += ` · propagated to ${data.propagated} rows`;
      showFlash(msg);
      setOriginalCorrectIndex(correctIndex);
      // Refresh to get fresh state
      await fetchCluster();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingLang(null);
    }
  };

  const saveAll = async ({ andBack = false } = {}) => {
    const changes = computeDiff();
    if (!confirmChanges(changes, andBack ? 'save all & go back' : 'save all 5 languages')) return;
    if (andBack) setSavingAndBack(true); else setSavingAll(true);
    setError('');
    try {
      const rows = [];
      for (const lang of LANGS) {
        const r = byLang?.[lang];
        if (!r?.id) continue;
        rows.push({
          id: r.id,
          row: {
            question_text: r.question_text,
            option_a: r.option_a, option_b: r.option_b,
            option_c: r.option_c, option_d: r.option_d,
            explanation: r.explanation || null,
            language: lang,
          },
        });
      }
      const res = await fetch('/api/admin/cluster-detail', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'save-all', rows, correct_answer: correctIndex }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save-all failed');

      if (andBack) {
        router.push(backHref);
        return;
      }
      showFlash(`Saved all ${data.saved} languages`);
      await fetchCluster();
    } catch (err) {
      setError(err.message);
    } finally {
      if (andBack) setSavingAndBack(false); else setSavingAll(false);
    }
  };

  const retranslate = async (lang = null) => {
    const target = lang ? [lang] : null;
    const langsCount = target ? target.length : 4;
    const estimated = (langsCount * 0.0024).toFixed(3);
    const langLabel = lang ? LANG_LABELS[lang] : 'all 4 languages (RU + ES + ZH + UA)';
    if (!confirm(`Re-translate ${langLabel} via Haiku?\nEstimated cost: ~$${estimated}\n\nThis will OVERWRITE existing translations.`)) return;
    setRetranslating(lang || 'all'); setError('');
    try {
      const res = await fetch('/api/admin/retranslate-cluster', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password, cluster_code, state, category, subcategory,
          langs: target,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Retranslate failed');

      const errs = (data.results || []).filter(r => !r.ok);
      const msg = lang
        ? (errs.length ? `${lang} failed: ${errs[0]?.error || 'unknown'}` : `${lang} retranslated ✓`)
        : `Retranslated ${data.success}/${data.total}` + (errs.length ? ` · failed: ${errs.map(e => `${e.lang}(${e.error})`).join(', ')}` : '');
      showFlash(msg);
      await fetchCluster();
    } catch (err) {
      setError(err.message);
    } finally {
      setRetranslating(null);
    }
  };

  // ─── Quality verify (Sonnet) ────────────────────────────────────────────
  const verifyQuality = async () => {
    if (!confirm(`Re-verify quality via Sonnet?\nEstimated cost: ~$0.01\n\nThis will overwrite quality_score and quality_issues on the EN row.`)) return;
    setVerifyingQuality(true); setError(''); setQualityVerdict(null);
    try {
      const res = await fetch('/api/admin/verify-quality', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password, cluster_code, state, category, subcategory,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verify failed');
      setQualityVerdict(data.verdict);
      showFlash(`Quality verified: ${data.verdict.quality_score}/5 · ${data.verdict.decision} · ~$${data.cost.toFixed(4)}`);
      await fetchCluster();
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifyingQuality(false);
    }
  };

  // ─── Image upload / delete (uses /api/admin/upload-image) ──────────────
  const handleImagePick = () => fileInputRef.current?.click();

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const en = byLang?.en;
    if (!en?.id) { setError('Cannot upload — EN row missing'); return; }

    setUploadingImage(true); setError('');
    try {
      // Storage path: {state}/{lang}/{category}/{en.id}.{ext}
      const ext = (file.name.match(/\.(jpe?g|png|webp)$/i)?.[1] || 'jpg').toLowerCase();
      const storagePath = `${state}/en/${category}/${en.id}.${ext}`;

      const fd = new FormData();
      fd.append('password', password);
      fd.append('questionId', en.id);
      fd.append('path', storagePath);
      fd.append('file', file);

      const res = await fetch('/api/admin/upload-image', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      showFlash(`Image uploaded · propagated to all language rows`);
      // Reset input + reload
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchCluster();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageDelete = async () => {
    const en = byLang?.en;
    if (!en?.id) return;
    if (!byLang.en.image_url) return;
    if (!confirm('Delete image for this cluster across all 5 languages?')) return;

    setDeletingImage(true); setError('');
    try {
      // Try to derive storage path from URL — best-effort, ok if it fails (DB still cleared)
      const url = new URL(byLang.en.image_url);
      const publicPrefix = '/storage/v1/object/public/question-images/';
      const storagePath = url.pathname.includes(publicPrefix)
        ? decodeURIComponent(url.pathname.split(publicPrefix)[1])
        : '';

      const fd = new FormData();
      fd.append('password', password);
      fd.append('questionId', en.id);
      fd.append('path', storagePath);
      fd.append('action', 'delete');

      const res = await fetch('/api/admin/upload-image', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');

      showFlash(`Image removed · cluster cleared`);
      await fetchCluster();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingImage(false);
    }
  };

  const deleteCluster = async () => {
    if (!confirm(`Delete cluster ${cluster_code} across ALL 5 languages?`)) return;
    setDeleting(true); setError('');
    try {
      const res = await fetch('/api/admin/cluster-detail', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'delete-cluster', cluster_code, state, category, subcategory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      alert(`Deleted ${data.deleted} rows.`);
      router.push(`/admin/clusters?state=${state}&cat=${category}`);
    } catch (err) {
      setError(err.message); setDeleting(false);
    }
  };

  if (!authenticated) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F1F5F9' }}>
        <form onSubmit={login} style={{ background: '#fff', padding: 32, borderRadius: 12, minWidth: 320 }}>
          <h1 style={{ marginTop: 0, fontSize: 18 }}>Admin · Cluster {cluster_code}</h1>
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
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#0B1C3D', fontWeight: 600 }}>{cluster_code}</span>
            <span style={{ fontSize: 12, color: '#64748B' }}>
              {state} · {category}{subcategory ? ` / ${subcategory}` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href={backHref} style={secondaryBtnLink}>
              ← Cancel & back
            </Link>
            <button onClick={() => saveAll({ andBack: false })} disabled={savingAll || savingAndBack || loading} style={primaryBtn}>
              {savingAll ? 'Saving…' : '💾 Save'}
            </button>
            <button onClick={() => saveAll({ andBack: true })} disabled={savingAll || savingAndBack || loading} style={primaryBtnAlt}>
              {savingAndBack ? 'Saving…' : '💾 Save & back'}
            </button>
            <button onClick={() => retranslate()} disabled={!!retranslating || loading} style={amberBtn} title="Re-translate all 4 non-EN languages via Haiku">
              {retranslating === 'all' ? 'Translating…' : '🔄 Retranslate all'}
            </button>
            <button onClick={deleteCluster} disabled={deleting || loading} style={dangerBtn}>
              {deleting ? 'Deleting…' : '🗑 Delete'}
            </button>
          </div>
        </header>

        {flash && (
          <div style={{ background: '#DCFCE7', color: '#166534', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
            ✓ {flash}
          </div>
        )}
        {error && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading && <div style={{ padding: 20, textAlign: 'center', color: '#64748B' }}>Loading…</div>}

        {byLang && !loading && (
          <>
            {/* Shared row: correct_answer + image_url (from EN) */}
            <div style={{ background: '#fff', padding: 14, borderRadius: 8, marginBottom: 14, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <label style={labelStyle}>Correct answer (shared across all 5 languages)</label>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    {CORRECT_LETTERS.map((letter, idx) => (
                      <button
                        key={letter}
                        onClick={() => setCorrectIndex(idx)}
                        style={{
                          padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                          border: idx === correctIndex ? '2px solid #16A34A' : '1px solid #CBD5E1',
                          background: idx === correctIndex ? '#DCFCE7' : '#fff',
                          color: idx === correctIndex ? '#166534' : '#0B1C3D',
                          fontWeight: 600,
                        }}
                      >
                        {letter}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 320 }}>
                  <label style={labelStyle}>Image (shared across all 5 languages)</label>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <input
                        type="text"
                        value={byLang.en?.image_url || ''}
                        onChange={(e) => updateField('en', 'image_url', e.target.value || null)}
                        placeholder="https://... or use upload button →"
                        style={{ ...inputStyle, fontSize: 11 }}
                      />
                      {byLang.en?.image_url && (
                        <img
                          src={byLang.en.image_url} alt=""
                          style={{ marginTop: 6, maxHeight: 80, borderRadius: 4, border: '1px solid #E2E8F0' }}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleImageUpload}
                        style={{ display: 'none' }}
                      />
                      <button
                        onClick={handleImagePick}
                        disabled={uploadingImage || deletingImage || !byLang.en?.id}
                        style={smallBtn}
                        title="Upload JPG/PNG/WebP (max 5MB) — auto-propagates to all language rows"
                      >
                        {uploadingImage ? '⏳ …' : '📤 Upload'}
                      </button>
                      {byLang.en?.image_url && (
                        <button
                          onClick={handleImageDelete}
                          disabled={uploadingImage || deletingImage}
                          style={smallDangerBtn}
                          title="Delete image from storage and clear cluster"
                        >
                          {deletingImage ? '⏳ …' : '🗑 Remove'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ minWidth: 240 }}>
                  <label style={labelStyle}>Quality (Sonnet)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{
                      fontSize: 18, fontWeight: 700,
                      color: byLang.en?.quality_score == null ? '#94A3B8'
                           : byLang.en.quality_score >= 4 ? '#16A34A'
                           : byLang.en.quality_score === 3 ? '#F59E0B' : '#DC2626',
                    }}>
                      {byLang.en?.quality_score != null ? `${byLang.en.quality_score}/5` : '—'}
                    </span>
                    <button
                      onClick={verifyQuality}
                      disabled={verifyingQuality}
                      style={smallSonnetBtn}
                      title="Run Sonnet quality verification (~$0.01)"
                    >
                      {verifyingQuality ? '⏳ verifying…' : '🔍 Verify'}
                    </button>
                  </div>
                  {byLang.en?.quality_issues?.length > 0 && (
                    <div style={{ color: '#DC2626', fontSize: 11, marginTop: 4 }}>
                      ⚠️ {byLang.en.quality_issues.join(', ')}
                    </div>
                  )}
                  {qualityVerdict && (
                    <div style={{ marginTop: 6, padding: 8, background: '#FEF3C7', borderRadius: 4, fontSize: 11, color: '#78350F', lineHeight: 1.4 }}>
                      <div><strong>Verdict:</strong> {qualityVerdict.correctness_verdict} · <strong>Decision:</strong> {qualityVerdict.decision}</div>
                      {qualityVerdict.absurd_distractors?.length > 0 && (
                        <div><strong>Absurd:</strong> {qualityVerdict.absurd_distractors.join(', ')}</div>
                      )}
                      <div style={{ fontStyle: 'italic', marginTop: 4 }}>{qualityVerdict.reasoning}</div>
                    </div>
                  )}
                </div>
              </div>
              {byLang.en?.manual_section && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#64748B' }}>
                  📖 <strong>{byLang.en.manual_section}</strong>
                  {byLang.en.manual_reference && (
                    <span style={{ marginLeft: 8, fontStyle: 'italic' }}>
                      “{byLang.en.manual_reference.slice(0, 140)}{byLang.en.manual_reference.length > 140 ? '…' : ''}”
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Per-language editors — grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: 14 }}>
              {LANGS.map((lang) => {
                const row = byLang[lang];
                const exists = !!row?.id;
                const stale = !!row?.translation_stale_at;

                return (
                  <div key={lang} style={{
                    background: '#fff', borderRadius: 8, padding: 14,
                    border: exists ? '1px solid #E2E8F0' : '2px dashed #FCA5A5',
                    opacity: exists ? 1 : 0.6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#0B1C3D' }}>
                        {LANG_FLAGS[lang]} {LANG_LABELS[lang]}
                        {!exists && <span style={{ color: '#DC2626', marginLeft: 8, fontSize: 12 }}>(missing)</span>}
                        {stale && <span title="EN was edited; needs retranslation" style={{ color: '#F59E0B', marginLeft: 8, fontSize: 12 }}>🕒 stale</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {lang !== 'en' && (
                          <button
                            onClick={() => retranslate(lang)}
                            disabled={!!retranslating}
                            style={smallAmberBtn}
                            title={`Re-translate ${LANG_LABELS[lang]} from EN via Haiku`}
                          >
                            {retranslating === lang ? '…' : '🔄'}
                          </button>
                        )}
                        {exists && (
                          <button onClick={() => saveLang(lang)} disabled={savingLang === lang} style={smallBtn}>
                            {savingLang === lang ? 'Saving…' : 'Save'}
                          </button>
                        )}
                      </div>
                    </div>

                    {exists ? (
                      <>
                        <textarea
                          value={row.question_text || ''}
                          onChange={(e) => updateField(lang, 'question_text', e.target.value)}
                          placeholder="Question"
                          rows={2}
                          style={{ ...inputStyle, resize: 'vertical', fontWeight: 500 }}
                        />
                        {['option_a','option_b','option_c','option_d'].map((f, i) => (
                          <div key={f} style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                            <span style={{
                              fontWeight: 600, fontSize: 12, color: i === correctIndex ? '#16A34A' : '#94A3B8',
                              minWidth: 16,
                            }}>
                              {CORRECT_LETTERS[i]}
                            </span>
                            <input
                              type="text" value={row[f] || ''}
                              onChange={(e) => updateField(lang, f, e.target.value)}
                              style={{ ...inputStyle, flex: 1, background: i === correctIndex ? '#F0FDF4' : '#fff' }}
                            />
                          </div>
                        ))}
                        <textarea
                          value={row.explanation || ''}
                          onChange={(e) => updateField(lang, 'explanation', e.target.value)}
                          placeholder="Explanation (optional)"
                          rows={2}
                          style={{ ...inputStyle, marginTop: 6, fontSize: 12, color: '#64748B' }}
                        />
                      </>
                    ) : (
                      <div style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: 20 }}>
                        No row for this language.<br />
                        <span style={{ fontSize: 11 }}>(Translation will be created when you run retranslate)</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle  = { display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.3 };
const inputStyle  = { width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid #CBD5E1', borderRadius: 4, background: '#fff', color: '#0B1C3D' };
const primaryBtn    = { padding: '8px 16px', fontSize: 13, background: '#2563EB', color: '#fff', border: 0, borderRadius: 6, fontWeight: 600, cursor: 'pointer' };
const primaryBtnAlt = { padding: '8px 16px', fontSize: 13, background: '#16A34A', color: '#fff', border: 0, borderRadius: 6, fontWeight: 600, cursor: 'pointer' };
const amberBtn      = { padding: '8px 16px', fontSize: 13, background: '#F59E0B', color: '#fff', border: 0, borderRadius: 6, fontWeight: 600, cursor: 'pointer' };
const dangerBtn     = { padding: '8px 16px', fontSize: 13, background: '#DC2626', color: '#fff', border: 0, borderRadius: 6, fontWeight: 600, cursor: 'pointer' };
const smallBtn       = { padding: '4px 10px', fontSize: 12, background: '#fff', color: '#2563EB', border: '1px solid #2563EB', borderRadius: 4, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const smallAmberBtn  = { padding: '4px 8px', fontSize: 12, background: '#fff', color: '#F59E0B', border: '1px solid #F59E0B', borderRadius: 4, fontWeight: 600, cursor: 'pointer' };
const smallDangerBtn = { padding: '4px 10px', fontSize: 12, background: '#fff', color: '#DC2626', border: '1px solid #DC2626', borderRadius: 4, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const smallSonnetBtn = { padding: '4px 10px', fontSize: 12, background: '#fff', color: '#9333EA', border: '1px solid #9333EA', borderRadius: 4, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const secondaryBtnLink = { padding: '8px 16px', fontSize: 13, background: '#fff', color: '#475569', border: '1px solid #CBD5E1', borderRadius: 6, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' };
