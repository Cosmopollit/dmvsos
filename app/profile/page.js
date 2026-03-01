'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';

function formatState(s) {
  if (!s) return '—';
  return s.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatCategory(c, tex) {
  const map = { car: tex.catCar, dmv: tex.catCar, cdl: tex.catCdl, motorcycle: tex.catMoto, moto: tex.catMoto };
  return map[c] || c;
}

function formatDate(createdAt) {
  if (!createdAt) return '—';
  const d = new Date(createdAt);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = searchParams.get('lang') || getSavedLang();
  const tex = t[lang] || t.en;
  const { user, isPro, loading } = useAuth();
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    if (loading) return;
    if (!user) router.push('/');
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      supabase
        .from('test_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
        .then(({ data }) => setSessions(data || []))
        .catch(() => setSessions([]));
    }
  }, [user]);

  if (loading) return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
      <p className="text-sm text-[#94A3B8]">{tex.loading}</p>
    </main>
  );

  if (!user) return null;

  return (
    <main className="min-h-screen flex flex-col items-center pt-6 p-6" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="w-full flex items-center justify-between mb-5">
          <button type="button" onClick={() => router.push('/')}
            className="text-sm text-[#94A3B8] hover:text-[#2563EB] transition font-medium">
            {tex.back}
          </button>
          <a href="/" className="flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition">
            <Image src="/logo.png" alt="DMVSOS" width={24} height={24} className="rounded-md" />
            <span className="text-sm font-bold text-[#0B1C3D]">DMVSOS</span>
          </a>
          <div className="w-12" />
        </div>
        <div className="bg-white rounded-2xl p-8 w-full shadow-sm border border-[#E2E8F0] text-center">
          <div className="w-16 h-16 rounded-full bg-[#0B1C3D] flex items-center justify-center text-white text-2xl font-bold mx-auto mb-5">
            {user.email?.[0].toUpperCase()}
          </div>
          <h2 className="text-xl font-bold text-[#1E293B] mb-1">{user.user_metadata?.full_name || tex.signInTitle || 'User'}</h2>
          <p className="text-sm text-[#94A3B8] mb-5">{user.email}</p>
          <span className={`inline-block text-xs font-bold px-3 py-1.5 rounded-full mb-6 ${isPro ? 'bg-[#FEF3C7] text-[#B45309]' : 'bg-[#EFF6FF] text-[#2563EB]'}`}>
            {isPro ? `👑 ${tex.proBadge}` : tex.freeBadge}
          </span>
          {isPro && (
            <p className="text-sm text-[#16A34A] font-medium mb-4">{tex.proFullAccess || '✅ You have full access to all tests'}</p>
          )}
          <div className="flex flex-col gap-3">
            {!isPro && (
              <button type="button" onClick={() => router.push(`/upgrade?lang=${lang}`)}
                className="w-full bg-[#F59E0B] text-[#0B1C3D] py-3.5 rounded-xl font-semibold text-sm hover:bg-[#FBBF24] transition border-0">
                {tex.upgradeCta}
              </button>
            )}
            <button type="button" onClick={async () => { await supabase.auth.signOut(); router.push('/'); }}
              className="w-full bg-white border border-[#E2E8F0] text-[#1E293B] py-3.5 rounded-xl font-semibold text-sm hover:border-[#94A3B8] hover:bg-[#F8FAFC] transition">
              {tex.signOut || 'Sign Out'}
            </button>
          </div>
        </div>

        {sessions.length > 0 && (
          <div className="bg-white rounded-2xl p-6 w-full mt-5 shadow-sm border border-[#E2E8F0]">
            <h3 className="text-base font-bold text-[#0B1C3D] mb-4">{tex.testHistory || 'Test history'}</h3>
            {(() => {
              const totalTests = sessions.length;
              const pcts = sessions.map((s) => (s.total > 0 ? (s.score / s.total) * 100 : 0));
              const avgPct = totalTests > 0 ? Math.round(pcts.reduce((a, b) => a + b, 0) / totalTests) : 0;
              const bestPct = pcts.length > 0 ? Math.round(Math.max(...pcts)) : 0;
              return (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-[#F8FAFC] rounded-xl px-3 py-2.5 text-center">
                      <p className="text-xs text-[#94A3B8]">{tex.totalTests || 'Total tests'}</p>
                      <p className="text-lg font-bold text-[#0B1C3D]">{totalTests}</p>
                    </div>
                    <div className="bg-[#F8FAFC] rounded-xl px-3 py-2.5 text-center">
                      <p className="text-xs text-[#94A3B8]">{tex.avgScore || 'Average score'}</p>
                      <p className="text-lg font-bold text-[#0B1C3D]">{avgPct}%</p>
                    </div>
                    <div className="bg-[#F8FAFC] rounded-xl px-3 py-2.5 text-center">
                      <p className="text-xs text-[#94A3B8]">{tex.bestScore || 'Best score'}</p>
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
                            <span className="text-[#1E293B]">{formatCategory(s.category, tex)}</span>
                            <span className="text-[#94A3B8]">·</span>
                            <span className="font-semibold">{s.score}/{s.total}</span>
                            <span className="text-[#94A3B8]">{formatDate(s.created_at)}</span>
                            <span
                              className={`ml-auto inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                                passed ? 'bg-[#F0FDF4] text-[#16A34A]' : 'bg-[#FEF2F2] text-[#DC2626]'
                              }`}
                            >
                              {passed ? (tex.passed || 'Passed') : (tex.notPassed || 'Not passed')}
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

      </div>
    </main>
  );
}

export default function Profile() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}><div className="w-6 h-6 border-2 border-[#94A3B8] border-t-transparent rounded-full animate-spin" /></main>}>
      <ProfileContent />
    </Suspense>
  );
}
