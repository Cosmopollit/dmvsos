'use client';

// Calm per-state editor for the DMV document guide (state_documents).
// Left: all 50 states with a status dot (● published / ◐ draft / ○ empty) so
// you can see coverage at a glance. Right: the form for the selected state.
// Publishing needs an official source URL — the API enforces it too.

import { useState } from 'react';

const STATE_SLUGS = [
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut',
  'delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa',
  'kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan',
  'minnesota','mississippi','missouri','montana','nebraska','nevada','new-hampshire',
  'new-jersey','new-mexico','new-york','north-carolina','north-dakota','ohio',
  'oklahoma','oregon','pennsylvania','rhode-island','south-carolina','south-dakota',
  'tennessee','texas','utah','vermont','virginia','washington','west-virginia',
  'wisconsin','wyoming',
];

const INP = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm';

function pretty(slug) {
  return slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function statusDot(status) {
  if (status === 'published') return { ch: '●', cls: 'text-green-600' };
  if (status === 'draft') return { ch: '◐', cls: 'text-amber-500' };
  return { ch: '○', cls: 'text-slate-300' };
}

const blankForm = (state) => ({
  state, agency: '', official_url: '', real_id_note: '',
  doc_groups: [], needs_translation: true, status: 'draft',
});

export default function DocumentsAdmin() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [rows, setRows] = useState({});        // state slug -> row
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function login(e) {
    e?.preventDefault();
    setMsg('');
    const res = await fetch('/api/admin/documents', { headers: { 'X-Admin-Password': password } });
    if (res.status === 200) {
      const data = await res.json();
      const map = {};
      (data.rows || []).forEach((r) => { map[r.state] = r; });
      setRows(map);
      setAuthed(true);
    } else {
      setMsg('Wrong password');
    }
  }

  function pick(slug) {
    const r = rows[slug];
    setSelected(slug);
    setForm(r ? { ...blankForm(slug), ...r, doc_groups: r.doc_groups || [] } : blankForm(slug));
    setMsg('');
  }

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function setGroup(i, patch) {
    setForm((f) => {
      const g = [...f.doc_groups];
      g[i] = { ...g[i], ...patch };
      return { ...f, doc_groups: g };
    });
  }
  const addGroup = () => setForm((f) => ({ ...f, doc_groups: [...f.doc_groups, { group: '', accepts: [], note: '' }] }));
  const removeGroup = (i) => setForm((f) => ({ ...f, doc_groups: f.doc_groups.filter((_, j) => j !== i) }));

  async function save(status) {
    if (!form) return;
    setSaving(true);
    setMsg('');
    const payload = {
      ...form,
      status,
      doc_groups: form.doc_groups
        .map((g) => ({
          group: (g.group || '').trim(),
          accepts: (Array.isArray(g.accepts) ? g.accepts : String(g.accepts || '').split('\n'))
            .map((s) => String(s).trim()).filter(Boolean),
          note: (g.note || '').trim() || undefined,
        }))
        .filter((g) => g.group),
    };
    const res = await fetch('/api/admin/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.ok) {
      const saved = { ...payload, updated_at: new Date().toISOString() };
      setRows((prev) => ({ ...prev, [form.state]: saved }));
      setForm(saved);
      setMsg(`Saved · ${status}`);
    } else {
      setMsg(`Error: ${data.error || 'save failed'}`);
    }
    setSaving(false);
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <form onSubmit={login} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 w-80">
          <h1 className="text-lg font-bold text-[#0B1C3D] mb-4">DMV documents · admin</h1>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password" autoFocus
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-3"
          />
          <button className="w-full bg-[#2563EB] text-white rounded-lg py-2 font-semibold">Enter</button>
          {msg && <p className="text-red-600 text-sm mt-3">{msg}</p>}
        </form>
      </div>
    );
  }

  const done = STATE_SLUGS.filter((s) => rows[s]?.status === 'published').length;

  return (
    <div className="min-h-screen bg-slate-50 text-[#0B1C3D]">
      <div className="max-w-6xl mx-auto p-6 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
        {/* State list */}
        <aside className="bg-white rounded-2xl border border-slate-200 p-3 h-fit">
          <div className="px-2 py-1 text-sm font-semibold flex items-center justify-between">
            <span>States</span>
            <span className="text-slate-400 font-normal">{done}/50 live</span>
          </div>
          <ul className="mt-1 max-h-[70vh] overflow-auto">
            {STATE_SLUGS.map((slug) => {
              const dot = statusDot(rows[slug]?.status);
              return (
                <li key={slug}>
                  <button
                    onClick={() => pick(slug)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-sm flex items-center gap-2 ${selected === slug ? 'bg-[#EFF6FF] font-semibold' : 'hover:bg-slate-50'}`}
                  >
                    <span className={dot.cls}>{dot.ch}</span>
                    {pretty(slug)}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Editor */}
        <main className="bg-white rounded-2xl border border-slate-200 p-6">
          {!form ? (
            <p className="text-slate-400">Pick a state to edit.</p>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">{pretty(form.state)}</h2>
                <span className={`text-sm ${statusDot(form.status).cls}`}>{statusDot(form.status).ch} {form.status}</span>
              </div>

              <Field label="Agency name">
                <input className={INP} value={form.agency || ''} onChange={(e) => setField('agency', e.target.value)} placeholder="e.g. California DMV" />
              </Field>
              <Field label="Official source URL (required to publish)">
                <input className={INP} value={form.official_url || ''} onChange={(e) => setField('official_url', e.target.value)} placeholder="https://www.dmv.ca.gov/..." />
              </Field>
              <Field label="REAL ID note (optional)">
                <textarea className={`${INP} h-16`} value={form.real_id_note || ''} onChange={(e) => setField('real_id_note', e.target.value)} />
              </Field>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">Document groups</span>
                  <button onClick={addGroup} className="text-sm text-[#2563EB] font-semibold">+ Add group</button>
                </div>
                <div className="space-y-3">
                  {form.doc_groups.length === 0 && <p className="text-slate-400 text-sm">No groups yet.</p>}
                  {form.doc_groups.map((g, i) => (
                    <div key={i} className="border border-slate-200 rounded-xl p-3">
                      <div className="flex gap-2 mb-2">
                        <input
                          className={`${INP} flex-1`} placeholder="Group, e.g. Proof of identity"
                          value={g.group || ''} onChange={(e) => setGroup(i, { group: e.target.value })}
                        />
                        <button onClick={() => removeGroup(i)} className="text-red-500 text-sm px-2">Remove</button>
                      </div>
                      <textarea
                        className={`${INP} h-24`} placeholder="Accepted documents, one per line"
                        value={Array.isArray(g.accepts) ? g.accepts.join('\n') : (g.accepts || '')}
                        onChange={(e) => setGroup(i, { accepts: e.target.value.split('\n') })}
                      />
                      <input
                        className={`${INP} mt-2`} placeholder="Note (optional)"
                        value={g.note || ''} onChange={(e) => setGroup(i, { note: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.needs_translation !== false} onChange={(e) => setField('needs_translation', e.target.checked)} />
                Show the &quot;need translation / notary?&quot; button
              </label>

              <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                <button disabled={saving} onClick={() => save('draft')} className="px-4 py-2 rounded-lg border border-slate-300 font-semibold disabled:opacity-50">
                  Save draft
                </button>
                <button disabled={saving} onClick={() => save('published')} className="px-4 py-2 rounded-lg bg-green-600 text-white font-semibold disabled:opacity-50">
                  Publish
                </button>
                {msg && <span className="text-sm text-slate-500">{msg}</span>}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold block mb-1">{label}</span>
      {children}
    </label>
  );
}
