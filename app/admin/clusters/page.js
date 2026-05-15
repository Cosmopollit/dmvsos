'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { STATE_OPTIONS, stateToSlug } from '@/lib/states';

const CATEGORIES = [
  { value: 'car', label: 'Car' },
  { value: 'cdl', label: 'CDL' },
  { value: 'motorcycle', label: 'Motorcycle' },
];

const CDL_SUBS = [
  { value: '', label: 'All CDL' },
  { value: 'general_knowledge', label: 'General Knowledge' },
  { value: 'air_brakes', label: 'Air Brakes' },
  { value: 'combination_vehicles', label: 'Combination Vehicles' },
];

const FILTERS = [
  { value: '', label: 'All clusters' },
  { value: 'has_fallback', label: '⚠️ Has fallback' },
  { value: 'has_missing', label: '❌ Has missing lang' },
  { value: 'has_stale', label: '🕒 Has stale' },
  { value: 'low_quality', label: '⭐ Low quality (≤3)' },
  { value: 'unverified', label: '? Unverified quality' },
  { value: 'has_issues', label: '⚠️ Has quality issues' },
];

const LANG_LABELS = { ru: 'RU', es: 'ES', zh: 'ZH', ua: 'UA' };

function StatusDot({ status }) {
  const map = {
    ok:        { color: '#16A34A', title: 'OK' },
    fallback:  { color: '#F59E0B', title: 'EN-fallback (translation looks like English)' },
    missing:   { color: '#DC2626', title: 'Missing — no row for this language' },
    stale:     { color: '#94A3B8', title: 'Stale — EN was edited, needs retranslation' },
  };
  const m = map[status] || map.missing;
  return (
    <span
      title={m.title}
      style={{
        display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
        background: m.color, verticalAlign: 'middle',
      }}
    />
  );
}

function QualityBadge({ score, issues }) {
  if (score == null) return <span style={{ color: '#94A3B8', fontSize: 12 }}>—</span>;
  const color = score >= 4 ? '#16A34A' : score === 3 ? '#F59E0B' : '#DC2626';
  return (
    <span title={issues?.length ? issues.join(', ') : 'No issues'}
      style={{
        color, fontWeight: 600, fontSize: 13,
        padding: '2px 6px', borderRadius: 4, background: `${color}15`,
      }}>
      {score}/5{issues?.length ? ` ⚠️${issues.length}` : ''}
    </span>
  );
}

export default function AdminClustersPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(false);

  // Try saved password
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = sessionStorage.getItem('admin_pwd');
    if (saved) { setPassword(saved); setAuthenticated(true); }
  }, []);

  const [stateLabel, setStateLabel] = useState(STATE_OPTIONS[0]);
  const [category, setCategory] = useState('car');
  const [subcategory, setSubcategory] = useState('');
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [clusters, setClusters] = useState([]);
  const [totalEn, setTotalEn] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Bulk selection
  const [selected, setSelected] = useState(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, errors: [] });
  const [bulkFlash, setBulkFlash] = useState('');

  const toggleOne = (code) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  });

  const togglePage = () => {
    const allOnPage = clusters.every((c) => selected.has(c.cluster_code));
    setSelected((s) => {
      const next = new Set(s);
      if (allOnPage) clusters.forEach((c) => next.delete(c.cluster_code));
      else clusters.forEach((c) => next.add(c.cluster_code));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  // Concurrency-limited worker pool
  async function runPool(items, fn, concurrency = 3, onProgress) {
    const errors = [];
    let done = 0;
    let idx = 0;
    async function worker() {
      while (idx < items.length) {
        const i = idx++;
        try {
          await fn(items[i]);
        } catch (e) {
          errors.push({ item: items[i], error: e.message });
        }
        done++;
        onProgress?.({ done, total: items.length, errors });
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return errors;
  }

  const runBulkRetranslate = async () => {
    const codes = clusters.filter(c => selected.has(c.cluster_code));
    if (codes.length === 0) return;
    const estimated = (codes.length * 0.01).toFixed(2);
    if (!confirm(`Retranslate ${codes.length} cluster(s)?\nEstimated cost: ~$${estimated} (Haiku, 4 langs each)`)) return;

    setBulkRunning(true);
    setBulkProgress({ done: 0, total: codes.length, errors: [] });
    setBulkFlash('');

    const errors = await runPool(codes, async (c) => {
      const res = await fetch('/api/admin/retranslate-cluster', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          cluster_code: c.cluster_code,
          state: c.state,
          category: c.category,
          subcategory: c.subcategory,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      const errs = (data.results || []).filter(r => !r.ok);
      if (errs.length > 0) throw new Error(`partial: ${errs.map(e => `${e.lang}(${e.error.slice(0,40)})`).join(',')}`);
    }, 3, (p) => setBulkProgress(p));

    setBulkRunning(false);
    setBulkFlash(`Retranslate done. Success: ${codes.length - errors.length}/${codes.length}` +
      (errors.length ? ` · Errors: ${errors.length}` : ''));
    setSelected(new Set());
    await load();
  };

  const runBulkDelete = async () => {
    const codes = clusters.filter(c => selected.has(c.cluster_code));
    if (codes.length === 0) return;
    if (!confirm(`DELETE ${codes.length} cluster(s) across ALL 5 languages?\nThis cannot be undone.`)) return;
    if (!confirm(`Really delete ${codes.length} clusters? Type-check: ${codes.slice(0,3).map(c => c.cluster_code).join(', ')}${codes.length > 3 ? '…' : ''}`)) return;

    setBulkRunning(true);
    setBulkProgress({ done: 0, total: codes.length, errors: [] });
    setBulkFlash('');

    const errors = await runPool(codes, async (c) => {
      const res = await fetch('/api/admin/cluster-detail', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password, action: 'delete-cluster',
          cluster_code: c.cluster_code, state: c.state, category: c.category, subcategory: c.subcategory,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
    }, 5, (p) => setBulkProgress(p));

    setBulkRunning(false);
    setBulkFlash(`Delete done. Success: ${codes.length - errors.length}/${codes.length}` +
      (errors.length ? ` · Errors: ${errors.length}` : ''));
    setSelected(new Set());
    await load();
  };

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

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const res = await fetch('/api/admin/clusters', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          state: stateToSlug(stateLabel),
          category,
          subcategory: category === 'cdl' ? (subcategory || null) : null,
          page,
          pageSize,
          search,
          filter,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setClusters(data.clusters || []);
      setTotalEn(data.totalEn || 0);
    } catch (err) {
      setLoadError(err.message);
      setClusters([]);
    } finally {
      setLoading(false);
    }
  }, [password, stateLabel, category, subcategory, page, search, filter]);

  useEffect(() => {
    if (authenticated) load();
  }, [authenticated, page, load]);

  // Reset to page 0 when filters change
  useEffect(() => {
    if (authenticated && page !== 0) setPage(0);
  }, [stateLabel, category, subcategory, filter]); // eslint-disable-line

  if (!authenticated) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F1F5F9' }}>
        <form onSubmit={login} style={{ background: '#fff', padding: 32, borderRadius: 12, minWidth: 320 }}>
          <h1 style={{ marginTop: 0, fontSize: 18 }}>Admin · Clusters</h1>
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

  const pageCount = Math.ceil(totalEn / pageSize);

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: 20 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0B1C3D', margin: 0 }}>
            Admin · Clusters (all languages)
          </h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Link
              href={`/admin/clusters/new?state=${stateToSlug(stateLabel)}&cat=${category}${category === 'cdl' && subcategory ? `&sub=${subcategory}` : ''}`}
              style={{ padding: '6px 14px', fontSize: 13, background: '#16A34A', color: '#fff', borderRadius: 6, fontWeight: 600, textDecoration: 'none' }}
            >
              + Add question
            </Link>
            <Link href="/admin" style={{ color: '#2563EB', fontSize: 14 }}>← Old admin</Link>
          </div>
        </header>

        {/* Filters */}
        <div style={{ background: '#fff', padding: 12, borderRadius: 8, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={stateLabel} onChange={(e) => setStateLabel(e.target.value)} style={selectStyle}>
            {STATE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setSubcategory(''); }} style={selectStyle}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {category === 'cdl' && (
            <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)} style={selectStyle}>
              {CDL_SUBS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          )}
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={selectStyle}>
            {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <input
            type="text" placeholder="Search cluster_code or text..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (setPage(0), load())}
            style={{ ...selectStyle, flex: 1, minWidth: 200 }}
          />
          <button onClick={() => { setPage(0); load(); }} disabled={loading} style={btnStyle}>
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>

        {loadError && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: 12, borderRadius: 6, marginBottom: 12 }}>
            {loadError}
          </div>
        )}

        {/* Bulk action toolbar */}
        {selected.size > 0 && (
          <div style={{
            background: '#0B1C3D', color: '#fff', padding: '10px 16px', borderRadius: 8, marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {selected.size} selected
            </span>
            {bulkRunning && (
              <span style={{ fontSize: 13, color: '#FCD34D' }}>
                ⏳ {bulkProgress.done}/{bulkProgress.total} done{bulkProgress.errors.length > 0 ? ` · ${bulkProgress.errors.length} errors` : ''}
              </span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button onClick={runBulkRetranslate} disabled={bulkRunning} style={amberBtn}>
                🔄 Retranslate
              </button>
              <button onClick={runBulkDelete} disabled={bulkRunning} style={dangerBtn}>
                🗑 Delete
              </button>
              <button onClick={clearSelection} disabled={bulkRunning} style={whiteBtn}>
                Clear
              </button>
            </div>
          </div>
        )}

        {bulkFlash && !bulkRunning && (
          <div style={{ background: '#DCFCE7', color: '#166534', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
            ✓ {bulkFlash}
            {bulkProgress.errors.length > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12 }}>Show {bulkProgress.errors.length} errors</summary>
                <ul style={{ margin: '6px 0 0 16px', fontSize: 11, color: '#991B1B' }}>
                  {bulkProgress.errors.slice(0, 20).map((e, i) => (
                    <li key={i}><code>{e.item.cluster_code}</code>: {e.error.slice(0, 200)}</li>
                  ))}
                  {bulkProgress.errors.length > 20 && <li>… +{bulkProgress.errors.length - 20} more</li>}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* Results */}
        <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', border: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: '#F1F5F9', fontSize: 13, color: '#475569' }}>
            <span>
              {totalEn > 0 ? `${totalEn} EN clusters total` : 'No data'}
              {clusters.length !== totalEn && totalEn > 0 && ` · showing ${clusters.length}`}
            </span>
            <span>Page {page + 1} / {Math.max(1, pageCount)}</span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
                <th style={{ ...thStyle, width: 36, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={clusters.length > 0 && clusters.every((c) => selected.has(c.cluster_code))}
                    onChange={togglePage}
                    title="Select all on this page"
                  />
                </th>
                <th style={thStyle}>cluster_code</th>
                <th style={thStyle}>EN preview</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>RU</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>ES</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>ZH</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>UA</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>img</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>quality</th>
                <th style={thStyle}>actions</th>
              </tr>
            </thead>
            <tbody>
              {clusters.length === 0 && !loading && (
                <tr><td colSpan="10" style={{ padding: 30, textAlign: 'center', color: '#94A3B8' }}>No clusters to show</td></tr>
              )}
              {clusters.map((c) => (
                <tr key={c.cluster_code} style={{ borderTop: '1px solid #E2E8F0', background: selected.has(c.cluster_code) ? '#EFF6FF' : 'transparent' }}>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selected.has(c.cluster_code)}
                      onChange={() => toggleOne(c.cluster_code)}
                    />
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>
                    {c.cluster_code}
                    {c.subcategory && (
                      <div style={{ color: '#94A3B8', fontSize: 10 }}>{c.subcategory}</div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 400, color: '#0B1C3D' }}>
                    {(c.en_text || '').slice(0, 110)}{(c.en_text || '').length > 110 ? '…' : ''}
                    <span style={{ color: '#94A3B8', marginLeft: 6, fontSize: 11 }}>· correct: {c.en_correct}</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}><StatusDot status={c.lang_status.ru} /></td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}><StatusDot status={c.lang_status.es} /></td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}><StatusDot status={c.lang_status.zh} /></td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}><StatusDot status={c.lang_status.ua} /></td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {c.image_url ? '🖼️' : <span style={{ color: '#CBD5E1' }}>—</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <QualityBadge score={c.quality_score} issues={c.quality_issues} />
                  </td>
                  <td style={tdStyle}>
                    <Link
                      href={`/admin/clusters/${encodeURIComponent(c.cluster_code)}?state=${c.state}&cat=${c.category}${c.subcategory ? `&sub=${c.subcategory}` : ''}`}
                      style={{ color: '#2563EB', fontSize: 12 }}
                    >
                      Edit →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {pageCount > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 12, background: '#F1F5F9' }}>
              <button onClick={() => setPage(0)} disabled={page === 0} style={pageBtnStyle}>«</button>
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} style={pageBtnStyle}>‹</button>
              <span style={{ padding: '6px 12px', fontSize: 13 }}>
                {page + 1} / {pageCount}
              </span>
              <button onClick={() => setPage(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1} style={pageBtnStyle}>›</button>
              <button onClick={() => setPage(pageCount - 1)} disabled={page >= pageCount - 1} style={pageBtnStyle}>»</button>
            </div>
          )}
        </div>

        <div style={{ marginTop: 16, padding: 12, background: '#fff', borderRadius: 8, fontSize: 12, color: '#475569' }}>
          <strong>Legend:</strong>{' '}
          <StatusDot status="ok" /> OK ·{' '}
          <StatusDot status="fallback" /> EN-fallback ·{' '}
          <StatusDot status="missing" /> Missing ·{' '}
          <StatusDot status="stale" /> Stale (EN edited)
        </div>
      </div>
    </div>
  );
}

const selectStyle = { padding: '6px 10px', fontSize: 13, border: '1px solid #CBD5E1', borderRadius: 6, background: '#fff' };
const btnStyle    = { padding: '6px 14px', fontSize: 13, background: '#2563EB', color: '#fff', border: 0, borderRadius: 6, fontWeight: 600, cursor: 'pointer' };
const amberBtn    = { padding: '6px 14px', fontSize: 13, background: '#F59E0B', color: '#fff', border: 0, borderRadius: 6, fontWeight: 600, cursor: 'pointer' };
const dangerBtn   = { padding: '6px 14px', fontSize: 13, background: '#DC2626', color: '#fff', border: 0, borderRadius: 6, fontWeight: 600, cursor: 'pointer' };
const whiteBtn    = { padding: '6px 14px', fontSize: 13, background: '#fff', color: '#0B1C3D', border: 0, borderRadius: 6, fontWeight: 600, cursor: 'pointer' };
const thStyle     = { padding: '10px 12px', fontSize: 12, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 };
const tdStyle     = { padding: '10px 12px', verticalAlign: 'top' };
const pageBtnStyle= { padding: '4px 10px', fontSize: 13, background: '#fff', border: '1px solid #CBD5E1', borderRadius: 4, cursor: 'pointer' };
