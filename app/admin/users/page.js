'use client';

import { useState, useMemo } from 'react';

// Admin customers dashboard (for Anastasia + Evgenii).
// Password-gated like the rest of /admin. Shows who bought what, days left,
// where they practice, and lets an admin delete an account (with a typed
// email confirmation so it can't be a mis-click).

const CAT_LABEL = { dmv: 'Car', car: 'Car', cdl: 'CDL', motorcycle: 'Moto', moto: 'Moto' };

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminUsersPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'active' | 'free'
  const [error, setError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null); // customer row
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [expandedId, setExpandedId] = useState(null); // customer whose test history is open

  // Add-customer modal
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addPass, setAddPass] = useState('auto');
  const [addDays, setAddDays] = useState(30);
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState(null);
  const [addError, setAddError] = useState('');

  async function submitAdd() {
    setAdding(true);
    setAddError('');
    setAddResult(null);
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'X-Admin-Password': password, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmail.trim(), pass_type: addPass, days: Number(addDays) || 30 }),
      });
      const data = await res.json();
      if (!data.ok) { setAddError(data.error || 'Failed'); return; }
      setAddResult(data);
      load(password); // refresh list so the new customer shows
    } catch (e) {
      setAddError(e.message);
    } finally {
      setAdding(false);
    }
  }

  function closeAdd() {
    setShowAdd(false);
    setAddEmail('');
    setAddPass('auto');
    setAddDays(30);
    setAddResult(null);
    setAddError('');
  }

  async function load(pw) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/customers', { headers: { 'X-Admin-Password': pw } });
      if (res.status === 401) { setAuthError('Wrong password'); setAuthed(false); return; }
      const data = await res.json();
      if (!data.ok) { setError(data.error || 'Failed to load'); return; }
      setCustomers(data.customers || []);
      setAuthed(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError('');
    await load(password);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'DELETE',
        headers: { 'X-Admin-Password': password, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: deleteTarget.id, email: deleteTarget.email }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || 'Delete failed'); return; }
      setCustomers(cs => cs.filter(c => c.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteConfirm('');
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter(c => {
      if (filter === 'active' && !c.hasActive) return false;
      if (filter === 'free' && c.hasActive) return false;
      if (q && !(c.email || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [customers, query, filter]);

  const activeCount = customers.filter(c => c.hasActive).length;

  // ---- Login screen ----
  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-6">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-8">
          <h1 className="text-lg font-bold text-[#0B1C3D] mb-1">Customers</h1>
          <p className="text-sm text-[#64748B] mb-5">Admin access</p>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Admin password"
            className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm focus:border-[#2563EB] focus:outline-none mb-3"
          />
          {authError && <p className="text-xs text-[#DC2626] mb-3">{authError}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-[#2563EB] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#1D4ED8] transition disabled:opacity-60">
            {loading ? '...' : 'Enter'}
          </button>
        </form>
      </main>
    );
  }

  // ---- Dashboard ----
  return (
    <main className="min-h-screen bg-[#F8FAFC] p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-[#0B1C3D]">Customers</h1>
            <p className="text-sm text-[#64748B]">{customers.length} total · {activeCount} with active access</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => load(password)} disabled={loading}
              className="text-sm text-[#2563EB] font-medium hover:underline disabled:opacity-60">
              {loading ? '...' : 'Refresh'}
            </button>
            <button type="button" onClick={() => setShowAdd(true)}
              className="text-sm bg-[#2563EB] text-white font-semibold rounded-xl px-3.5 py-2 hover:bg-[#1D4ED8] transition">
              + Add customer
            </button>
          </div>
        </div>

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search email..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-sm focus:border-[#2563EB] focus:outline-none bg-white"
          />
          <div className="flex bg-white rounded-xl border border-[#E2E8F0] p-1 gap-1">
            {[['all', 'All'], ['active', 'Active'], ['free', 'Free']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFilter(k)}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition ${filter === k ? 'bg-[#0B1C3D] text-white' : 'text-[#64748B]'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-[#DC2626] mb-3">{error}</p>}

        {/* List */}
        <div className="flex flex-col gap-2">
          {filtered.map(c => {
            const activePass = c.passes.find(p => p.daysLeft > 0);
            const days = activePass ? activePass.daysLeft : c.legacyDaysLeft;
            const planLabel = activePass ? activePass.type : (c.hasActive ? (c.legacyPlan || 'pro') : null);
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-[#E2E8F0] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-[#0B1C3D] break-all">{c.email || '(no email)'}</span>
                      {c.hasActive ? (
                        <span className="text-[10px] font-bold text-white bg-[#16A34A] rounded-full px-2 py-0.5">
                          {planLabel} · {days}d left
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-[#94A3B8] bg-[#F1F5F9] rounded-full px-2 py-0.5">free</span>
                      )}
                      {c.stripeCustomer && <span className="text-[10px] text-[#64748B]">💳</span>}
                    </div>
                    <div className="text-xs text-[#64748B] mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 items-center">
                      <span>Joined {fmtDate(c.created_at)}</span>
                      <span>Login {c.providers.join('/') || 'email'}</span>
                      {c.sessionCount > 0 ? (
                        <button type="button"
                          onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                          className="font-semibold text-[#2563EB] hover:underline">
                          {c.sessionCount} tests {expandedId === c.id ? '▲' : '▼'}
                        </button>
                      ) : (
                        <span>0 tests</span>
                      )}
                    </div>
                    {/* All passes detail if more than the one active */}
                    {c.passes.length > 0 && (
                      <div className="text-[11px] text-[#94A3B8] mt-1">
                        Passes: {c.passes.map(p => `${p.type} (${p.daysLeft > 0 ? p.daysLeft + 'd' : 'expired'})`).join(', ')}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => { setDeleteTarget(c); setDeleteConfirm(''); }}
                    className="text-xs font-medium text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg px-2.5 py-1.5 transition shrink-0">
                    Delete
                  </button>
                </div>

                {/* Expandable test history */}
                {expandedId === c.id && (c.sessions?.length > 0) && (
                  <div className="mt-3 pt-3 border-t border-[#F1F5F9]">
                    <div className="flex flex-col gap-1.5">
                      {c.sessions.map((s, i) => {
                        const pct = s.total > 0 ? Math.round((s.score / s.total) * 100) : 0;
                        const passed = pct >= 80;
                        return (
                          <div key={i} className="flex items-center justify-between text-xs gap-2">
                            <span className="text-[#475569] capitalize truncate">
                              {s.state} · {CAT_LABEL[s.category] || s.category}
                              <span className="text-[#94A3B8]"> · {fmtDate(s.created_at)}</span>
                            </span>
                            <span className={`font-semibold shrink-0 ${passed ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                              {s.score}/{s.total} ({pct}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-[#94A3B8] mt-2">
                      Per-question mistakes aren&apos;t recorded yet — only scores. Ask to enable mistake tracking.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-[#94A3B8] py-10">No customers match.</p>
          )}
        </div>
      </div>

      {/* Add customer modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            {!addResult ? (
              <>
                <h2 className="text-lg font-bold text-[#0B1C3D] mb-1">Add customer</h2>
                <p className="text-sm text-[#64748B] mb-4">For people who paid you directly. Grants access and emails them a login link.</p>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Email</label>
                <input
                  type="email"
                  value={addEmail}
                  onChange={e => setAddEmail(e.target.value)}
                  placeholder="customer@email.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-sm focus:border-[#2563EB] focus:outline-none mb-3"
                />
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Pass</label>
                <select
                  value={addPass}
                  onChange={e => setAddPass(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-sm focus:border-[#2563EB] focus:outline-none mb-3 bg-white"
                >
                  <option value="auto">Auto (Car)</option>
                  <option value="moto">Motorcycle</option>
                  <option value="cdl">CDL</option>
                </select>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Days of access</label>
                <input
                  type="number"
                  min={1}
                  value={addDays}
                  onChange={e => setAddDays(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-sm focus:border-[#2563EB] focus:outline-none mb-4"
                />
                {addError && <p className="text-xs text-[#DC2626] mb-3">{addError}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={closeAdd}
                    className="flex-1 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-semibold text-[#0B1C3D] hover:bg-[#F8FAFC] transition">
                    Cancel
                  </button>
                  <button type="button" onClick={submitAdd}
                    disabled={adding || !addEmail.includes('@')}
                    className="flex-1 py-2.5 rounded-xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-[#1D4ED8] transition disabled:opacity-40">
                    {adding ? '...' : 'Add & grant'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#DCFCE7] flex items-center justify-center text-2xl">✓</div>
                <h2 className="text-lg font-bold text-[#0B1C3D] mb-2 text-center">
                  {addResult.alreadyExisted ? 'Access granted' : 'Customer added'}
                </h2>
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 text-sm text-[#0B1C3D] space-y-1 mb-3">
                  <div><span className="text-[#94A3B8]">Email:</span> <span className="break-all font-medium">{addResult.email}</span></div>
                  <div><span className="text-[#94A3B8]">Pass:</span> <span className="font-medium">{addResult.pass_type} · {addResult.days} days</span></div>
                  <div><span className="text-[#94A3B8]">Password:</span> <span className="font-mono font-bold">{addResult.password}</span></div>
                </div>
                <p className="text-xs text-[#64748B] mb-4">
                  {addResult.emailed
                    ? 'A one-click login link was emailed to them. They can also sign in at dmvsos.com/login with the email + password above.'
                    : 'Login link email could not be sent — give them the email + password above to sign in at dmvsos.com/login.'}
                </p>
                <button type="button" onClick={closeAdd}
                  className="w-full py-2.5 rounded-xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-[#1D4ED8] transition">
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-[#0B1C3D] mb-2">Delete account?</h2>
            <p className="text-sm text-[#64748B] mb-1">
              This permanently removes <strong className="break-all">{deleteTarget.email}</strong> and all their data
              (passes, test history, profile). This cannot be undone.
            </p>
            <p className="text-xs text-[#94A3B8] mb-3">Type the email to confirm:</p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder={deleteTarget.email || ''}
              className="w-full px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-sm focus:border-[#DC2626] focus:outline-none mb-4"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => { setDeleteTarget(null); setDeleteConfirm(''); }}
                className="flex-1 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-semibold text-[#0B1C3D] hover:bg-[#F8FAFC] transition">
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting || deleteConfirm.trim().toLowerCase() !== (deleteTarget.email || '').toLowerCase()}
                className="flex-1 py-2.5 rounded-xl bg-[#DC2626] text-white text-sm font-semibold hover:bg-[#B91C1C] transition disabled:opacity-40"
              >
                {deleting ? '...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
