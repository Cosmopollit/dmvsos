'use client';

import { useState } from 'react';

export default function TelegramGroupsAdmin() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = async (pw) => {
    setError('');
    try {
      const res = await fetch('/api/admin/telegram-groups', {
        headers: { 'X-Admin-Password': pw },
      });
      if (!res.ok) {
        setError('Auth failed');
        return false;
      }
      const json = await res.json();
      setData(json);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const ok = await load(password);
    if (ok) setAuthenticated(true);
  };

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <form onSubmit={handleLogin} className="bg-white rounded-2xl p-8 w-full max-w-sm border border-[#E2E8F0] shadow-sm">
          <h1 className="text-xl font-bold text-[#0B1C3D] mb-4">Telegram Groups Admin</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            className="w-full px-4 py-3 border border-[#E2E8F0] rounded-xl mb-3 focus:outline-none focus:border-[#2563EB]"
            autoFocus
          />
          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
          <button type="submit" className="w-full bg-[#0B1C3D] text-white py-3 rounded-xl font-semibold hover:bg-[#132248] transition">
            Log in
          </button>
        </form>
      </main>
    );
  }

  if (!data) return <div className="p-6">Loading…</div>;

  const { groups, hits, stats } = data;

  return (
    <main className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-[#0B1C3D] mb-2">Telegram Groups</h1>
        <p className="text-sm text-[#64748B] mb-6">
          @dmvsos_support_bot membership + auto-reply activity
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Stat label="Active groups" value={stats.active_groups} />
          <Stat label="Total replies sent" value={stats.total_replies} />
          <Stat label="Keyword hits (100 recent)" value={hits.length} />
          <Stat label="Replied / matched" value={`${hits.filter(h => h.reply_sent).length} / ${hits.length}`} />
        </div>

        {/* Groups */}
        <Section title="Groups">
          <table className="w-full text-sm">
            <thead className="text-left text-[#64748B] text-xs uppercase">
              <tr>
                <th className="py-2">Title</th>
                <th>Type</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Hits</th>
                <th>Last</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.chat_id} className="border-t border-[#E2E8F0]">
                  <td className="py-2">
                    <div className="font-medium text-[#0B1C3D]">{g.title || `(id ${g.chat_id})`}</div>
                    {g.username && <div className="text-xs text-[#64748B]">@{g.username}</div>}
                  </td>
                  <td className="text-[#64748B]">{g.type}</td>
                  <td>
                    {g.mode === 'autoreply'
                      ? <span className="text-blue-600">📣 autoreply</span>
                      : <span className="text-[#64748B]">🤫 silent</span>}
                  </td>
                  <td>
                    {g.removed_at ? (
                      <span className="text-red-600">Removed</span>
                    ) : g.enabled ? (
                      <span className="text-green-600">✅ Active</span>
                    ) : (
                      <span className="text-amber-600">🔕 Muted</span>
                    )}
                  </td>
                  <td>{g.reply_count || 0}</td>
                  <td className="text-xs text-[#64748B]">
                    {g.last_reply_at ? new Date(g.last_reply_at).toLocaleString() : '—'}
                  </td>
                  <td className="text-xs text-[#64748B]">
                    {new Date(g.added_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {groups.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-[#64748B]">No groups yet. Add bot to a Telegram group to see it here.</td></tr>
              )}
            </tbody>
          </table>
        </Section>

        {/* Top keywords + states */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Section title="Top keywords">
            <ul className="text-sm">
              {stats.topKeywords.map(([kw, n]) => (
                <li key={kw} className="flex justify-between py-1 border-t border-[#E2E8F0] first:border-0">
                  <span className="font-mono text-[#0B1C3D]">{kw}</span>
                  <span className="text-[#64748B]">{n}</span>
                </li>
              ))}
              {!stats.topKeywords.length && <li className="text-[#64748B]">No hits yet.</li>}
            </ul>
          </Section>
          <Section title="Top states asked about">
            <ul className="text-sm">
              {stats.topStates.map(([s, n]) => (
                <li key={s} className="flex justify-between py-1 border-t border-[#E2E8F0] first:border-0">
                  <span className="text-[#0B1C3D]">{s}</span>
                  <span className="text-[#64748B]">{n}</span>
                </li>
              ))}
              {!stats.topStates.length && <li className="text-[#64748B]">No state mentions yet.</li>}
            </ul>
          </Section>
        </div>

        {/* Recent hits */}
        <Section title="Recent matches (100)">
          <table className="w-full text-xs">
            <thead className="text-left text-[#64748B] uppercase">
              <tr>
                <th className="py-2">When</th>
                <th>From</th>
                <th>Message</th>
                <th>Match</th>
                <th>State</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {hits.map((h) => (
                <tr key={h.id} className="border-t border-[#E2E8F0]">
                  <td className="py-1 whitespace-nowrap text-[#64748B]">
                    {new Date(h.created_at).toLocaleString()}
                  </td>
                  <td className="text-[#64748B]">{h.user_name || h.user_id}</td>
                  <td className="text-[#0B1C3D] max-w-md truncate">{h.message_text}</td>
                  <td className="font-mono text-[#2563EB]">{h.matched_keyword}</td>
                  <td>{h.matched_state || '—'}</td>
                  <td>
                    {h.reply_sent
                      ? <span className="text-green-600">✅ replied</span>
                      : <span className="text-[#64748B]">⏸ {h.skipped_reason}</span>}
                  </td>
                </tr>
              ))}
              {hits.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-[#64748B]">No matches yet.</td></tr>
              )}
            </tbody>
          </table>
        </Section>
      </div>
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-[#E2E8F0] shadow-sm">
      <div className="text-xs text-[#64748B] uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-[#0B1C3D] mt-1">{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm mb-6">
      <h2 className="text-lg font-bold text-[#0B1C3D] mb-3">{title}</h2>
      {children}
    </div>
  );
}
