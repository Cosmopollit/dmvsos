'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return (
    <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
      <p className="text-[#94A3B8]">Loading...</p>
    </main>
  );

  if (!user) return null;

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-lg border border-[#E2E8F0] text-center">
        <div className="w-16 h-16 rounded-full bg-[#0B1C3D] flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
          {user.email?.[0].toUpperCase()}
        </div>
        <h2 className="text-xl font-bold text-[#1E293B] mb-1">{user.user_metadata?.full_name || 'User'}</h2>
        <p className="text-sm text-[#94A3B8] mb-4">{user.email}</p>
        <span className="bg-[#EFF6FF] text-[#2563EB] text-xs font-bold px-3 py-1 rounded-full">FREE PLAN</span>
        <div className="mt-6 flex flex-col gap-3">
          <button onClick={() => router.push('/upgrade')}
            className="w-full bg-[#F59E0B] text-white py-3 rounded-xl font-semibold hover:bg-[#D97706] transition">
            Upgrade to Pro — $39/mo
          </button>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/'); }}
            className="w-full border-2 border-[#E2E8F0] text-[#94A3B8] py-3 rounded-xl font-semibold hover:border-red-300 hover:text-red-400 transition">
            Sign Out
          </button>
        </div>
      </div>
      <button onClick={() => router.push('/')} className="mt-6 text-sm text-[#94A3B8] hover:text-[#2563EB]">← Back to Home</button>
    </main>
  );
}
