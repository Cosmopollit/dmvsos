'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function formatState(s) {
  if (!s) return '—';
  return s.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatCategory(c) {
  const map = { car: 'Car', cdl: 'CDL', motorcycle: 'Motorcycle' };
  return map[c] || c;
}

function formatDate(createdAt) {
  if (!createdAt) return '—';
  const d = new Date(createdAt);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        setUser(data.session.user);
      } else {
        router.push('/');
      }
      setLoading(false);
    }, 500);
  }, []);

  useEffect(() => {
    if (user) {
      supabase
        .from('test_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
        .then(({ data }) => setSessions(data || []));
    }
  }, [user]);

  if (loading) return (
    <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
      <p className="text-sm text-[#94A3B8]">Loading...</p>
    </main>
  );

  if (!user) return null;

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="bg-white rounded-2xl p-8 w-full shadow-sm border border-[#E2E8F0] text-center">
          <div className="w-16 h-16 rounded-full bg-[#0B1C3D] flex items-center justify-center text-white text-2xl font-bold mx-auto mb-5">
            {user.email?.[0].toUpperCase()}
          </div>
          <h2 className="text-xl font-bold text-[#1E293B] mb-1">{user.user_metadata?.full_name || 'User'}</h2>
          <p className="text-sm text-[#94A3B8] mb-5">{user.email}</p>
          <span className="inline-block bg-[#EFF6FF] text-[#2563EB] text-xs font-bold px-3 py-1.5 rounded-full mb-6">FREE PLAN</span>
          <div className="flex flex-col gap-3">
            <button type="button" onClick={() => router.push('/upgrade')}
              className="w-full bg-[#F59E0B] text-[#0B1C3D] py-3.5 rounded-xl font-semibold text-sm hover:bg-[#FBBF24] transition border-0">
              Upgrade to Pro — $39/mo
            </button>
            <button type="button" onClick={async () => { await supabase.auth.signOut(); router.push('/'); }}
              className="w-full bg-white border border-[#E2E8F0] text-[#1E293B] py-3.5 rounded-xl font-semibold text-sm hover:border-[#94A3B8] hover:bg-[#F8FAFC] transition">
              Sign Out
            </button>
          </div>
        </div>

        {sessions.length > 0 && (
          <div className="bg-white rounded-2xl p-6 w-full mt-5 shadow-sm border border-[#E2E8F0]">
            <h3 className="text-base font-bold text-[#0B1C3D] mb-4">Test history</h3>
            {(() => {
              const totalTests = sessions.length;
              const pcts = sessions.map((s) => (s.total > 0 ? (s.score / s.total) * 100 : 0));
              const avgPct = totalTests > 0 ? Math.round(pcts.reduce((a, b) => a + b, 0) / totalTests) : 0;
              const bestPct = pcts.length > 0 ? Math.round(Math.max(...pcts)) : 0;
              return (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-[#F8FAFC] rounded-xl px-3 py-2.5 text-center">
                      <p className="text-xs text-[#94A3B8]">Total tests</p>
                      <p className="text-lg font-bold text-[#0B1C3D]">{totalTests}</p>
                    </div>
                    <div className="bg-[#F8FAFC] rounded-xl px-3 py-2.5 text-center">
                      <p className="text-xs text-[#94A3B8]">Average score</p>
                      <p className="text-lg font-bold text-[#0B1C3D]">{avgPct}%</p>
                    </div>
                    <div className="bg-[#F8FAFC] rounded-xl px-3 py-2.5 text-center">
                      <p className="text-xs text-[#94A3B8]">Best score</p>
                      <p className="text-lg font-bold text-[#0B1C3D]">{bestPct}%</p>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {sessions.map((s) => {
                      const passed = s.total > 0 && s.score / s.total >= 0.7;
                      return (
                        <li
                          key={s.id}
                          className="rounded-xl px-4 py-3 border border-[#E2E8F0] text-left text-sm bg-white"
                        >
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-medium text-[#1E293B]">{formatState(s.state)}</span>
                            <span className="text-[#94A3B8]">·</span>
                            <span className="text-[#1E293B]">{formatCategory(s.category)}</span>
                            <span className="text-[#94A3B8]">·</span>
                            <span className="font-semibold">{s.score}/{s.total}</span>
                            <span className="text-[#94A3B8]">{formatDate(s.created_at)}</span>
                            <span
                              className={`ml-auto inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                                passed ? 'bg-[#F0FDF4] text-[#16A34A]' : 'bg-[#FEF2F2] text-[#DC2626]'
                              }`}
                            >
                              {passed ? 'Passed' : 'Not passed'}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              );
            })()}
          </div>
        )}

        <button type="button" onClick={() => router.push('/')} className="mt-6 text-sm text-[#94A3B8] hover:text-[#2563EB] transition">← Back to Home</button>
      </div>
    </main>
  );
}
