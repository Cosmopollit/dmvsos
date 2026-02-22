'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';

export default function Home() {
  const [lang, setLang] = useState('English');
  const [state, setState] = useState('');
  const [user, setUser] = useState(null);
  const router = useRouter();

  const langToCode = { English: 'en', 'Русский': 'ru', 'Español': 'es', '中文': 'zh', 'Українська': 'ua' };
  const langCode = langToCode[lang] || 'en';
  const tex = t[langCode] || t.en;

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
      }
    });
  }, []);

  const langs = [
    { flag: '🇺🇸', name: 'English' },
    { flag: '🇷🇺', name: 'Русский' },
    { flag: '🇪🇸', name: 'Español' },
    { flag: '🇨🇳', name: '中文' },
    { flag: '🇺🇦', name: 'Українська' },
  ];

  const states = [
    'Alabama (AL)', 'Alaska (AK)', 'Arizona (AZ)', 'Arkansas (AR)',
    'California (CA)', 'Colorado (CO)', 'Connecticut (CT)', 'Delaware (DE)',
    'Florida (FL)', 'Georgia (GA)', 'Hawaii (HI)', 'Idaho (ID)',
    'Illinois (IL)', 'Indiana (IN)', 'Iowa (IA)', 'Kansas (KS)',
    'Kentucky (KY)', 'Louisiana (LA)', 'Maine (ME)', 'Maryland (MD)',
    'Massachusetts (MA)', 'Michigan (MI)', 'Minnesota (MN)', 'Mississippi (MS)',
    'Missouri (MO)', 'Montana (MT)', 'Nebraska (NE)', 'Nevada (NV)',
    'New Hampshire (NH)', 'New Jersey (NJ)', 'New Mexico (NM)', 'New York (NY)',
    'North Carolina (NC)', 'North Dakota (ND)', 'Ohio (OH)', 'Oklahoma (OK)',
    'Oregon (OR)', 'Pennsylvania (PA)', 'Rhode Island (RI)', 'South Carolina (SC)',
    'South Dakota (SD)', 'Tennessee (TN)', 'Texas (TX)', 'Utah (UT)',
    'Vermont (VT)', 'Virginia (VA)', 'Washington (WA)', 'West Virginia (WV)',
    'Wisconsin (WI)', 'Wyoming (WY)'
  ];

  function stateToSlug(displayState) {
    if (!displayState) return '';
    const name = displayState.replace(/\s*\([A-Z]{2}\)\s*$/, '').trim();
    return name.toLowerCase().replace(/\s+/g, '-');
  }

  const handleStartAsGuest = () => {
    const stateCode = stateToSlug(state);
    if (!stateCode) return;
    router.push(`/category?state=${stateCode}&lang=${langCode}`);
  };

  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: false,
      }
    })
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  return (
    <main style={{ fontFamily: 'DM Sans, sans-serif' }} className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center py-10 px-6 relative overflow-hidden">

      {/* User pill (top right) */}
      {user && (
        <div className="fixed top-4 right-4 z-10 flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-full pl-3 pr-1 py-1.5 shadow-sm">
          <span className="text-xs font-medium text-[#1E293B] max-w-[120px] truncate">{user.user_metadata?.full_name || user.email}</span>
          <button onClick={handleSignOut} type="button"
            className="text-xs font-medium text-[#94A3B8] hover:text-[#DC2626] transition px-2.5 py-1 rounded-full hover:bg-[#FEF2F2]">
            Sign out
          </button>
        </div>
      )}

      {/* Background blobs */}
      <div className="fixed top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(26,86,219,0.08) 0%, transparent 70%)' }} />
      <div className="fixed bottom-[-150px] left-[-150px] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)' }} />

      {/* Brand */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-3 mb-2">
          <div className="w-11 h-11 bg-[#0B1C3D] rounded-xl flex items-center justify-center">
            <span className="text-[#F59E0B] text-lg font-bold">✦</span>
          </div>
          <span className="text-[26px] font-bold text-[#0B1C3D] tracking-tight">
            DMV<span className="text-[#2563EB]">SOS</span>
          </span>
        </div>
        <p className="text-sm text-[#94A3B8]">{tex.freeDmv}</p>
      </div>

      {/* Language bar - single row */}
      <div className="flex gap-2 mb-6 justify-center flex-nowrap">
        {langs.map((l) => (
          <button key={l.name} onClick={() => setLang(l.name)} type="button"
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-[#E2E8F0] transition-all ${
              lang === l.name
                ? 'bg-[#0B1C3D] text-white border-[#0B1C3D]'
                : 'bg-white text-[#94A3B8] hover:border-[#2563EB] hover:text-[#2563EB]'
            }`}>
            {l.flag} {l.name}
          </button>
        ))}
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl p-9 w-full max-w-[440px] border border-[#E2E8F0]"
        style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 20px 60px -10px rgba(11,28,61,0.1)' }}>

        {/* Step dots */}
        <div className="flex justify-center gap-2 mb-7">
          <div className="w-5 h-[6px] rounded bg-[#2563EB]" />
          <div className="w-[6px] h-[6px] rounded-full bg-[#E2E8F0]" />
          <div className="w-[6px] h-[6px] rounded-full bg-[#E2E8F0]" />
        </div>

        <h2 className="text-[22px] font-bold text-[#1E293B] mb-1">Start practicing</h2>
        <p className="text-sm text-[#94A3B8] mb-7 leading-relaxed">Choose your state, then pick how to start. No experience needed.</p>

        {/* State */}
        <label className="text-xs font-semibold text-[#1E293B] uppercase tracking-widest mb-2 block">{tex.yourState}</label>
        <select value={state} onChange={e => setState(e.target.value)}
          className="w-full px-4 py-3 border-[1.5px] border-[#E2E8F0] rounded-[10px] text-[15px] text-[#1E293B] bg-[#F8FAFC] mb-6 focus:outline-none focus:border-[#2563EB] transition cursor-pointer">
          <option value="">{tex.selectState}</option>
          {states.map(s => <option key={s}>{s}</option>)}
        </select>

        {user ? (
          <>
            <button
              type="button"
              onClick={() => { const slug = stateToSlug(state); if (slug) router.push(`/category?state=${slug}&lang=${langCode}`); }}
              disabled={!state}
              className={`w-full py-4 rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-all ${
                state
                  ? 'bg-[#2563EB] text-white hover:bg-[#1D4ED8] cursor-pointer'
                  : 'bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed'
              }`}
            >
              {tex.startPracticing}
            </button>
            {!state && (
              <p className="text-xs text-[#94A3B8] text-center mt-2">{tex.selectStateFirst}</p>
            )}
            <button type="button" onClick={() => router.push('/profile')}
              className="mt-4 text-sm text-[#2563EB] hover:underline">
              {tex.myProfile}
            </button>
          </>
        ) : (
          <>
            {/* Guest button */}
            <div className="mb-3">
              <button
                onClick={handleStartAsGuest}
                disabled={!state}
                className={`w-full py-4 rounded-xl font-medium text-[15px] flex items-center justify-center gap-3 transition-all ${
                  state
                    ? 'bg-[#0B1C3D] text-white hover:bg-[#132248] hover:-translate-y-px hover:shadow-lg cursor-pointer'
                    : 'bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed'
                }`}
              >
                {tex.startAsGuest}
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${state ? 'bg-[#FEF3C7] text-[#B45309]' : 'bg-[#CBD5E1] text-[#64748B]'}`}>No signup</span>
              </button>
              {!state && (
                <p className="text-xs text-[#94A3B8] text-center mt-2">{tex.selectStateFirst}</p>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-[#E2E8F0]" />
              <span className="text-xs text-[#94A3B8] font-medium whitespace-nowrap">{tex.orSaveProgress}</span>
              <div className="flex-1 h-px bg-[#E2E8F0]" />
            </div>

            {/* Google */}
            <button onClick={handleGoogleSignIn} type="button" className="w-full bg-white text-[#1E293B] border-[1.5px] border-[#E2E8F0] py-3 rounded-xl font-medium text-[15px] flex items-center justify-center gap-3 mb-3 hover:bg-[#F8FAFC] hover:-translate-y-px hover:shadow transition-all">
              {tex.continueGoogle}
            </button>

            {/* Apple */}
            <button type="button" className="w-full bg-black text-white py-3 rounded-xl font-medium text-[15px] flex items-center justify-center gap-3 hover:bg-[#1a1a1a] hover:-translate-y-px hover:shadow-lg transition-all">
              {tex.continueApple}
            </button>

            {/* Info */}
            <div className="mt-5 bg-[rgba(26,86,219,0.04)] border border-[rgba(26,86,219,0.12)] rounded-[10px] p-3 flex gap-3">
              <span className="text-base flex-shrink-0 mt-0.5">💡</span>
              <p className="text-[12.5px] text-[#475569] leading-relaxed">
                <span className="text-[#2563EB] font-semibold">Guest mode:</span> Practice right away. Sign in anytime to save your score.
              </p>
            </div>
          </>
        )}

      </div>

      {/* Pricing */}
      <div className="w-full max-w-[560px] mt-10 grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Free plan */}
        <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm">
          <h3 className="text-base font-bold text-[#1E293B] mb-0.5">FREE</h3>
          <p className="text-2xl font-bold text-[#0B1C3D] mb-4">$0</p>
          <ul className="space-y-2.5 text-sm text-[#64748B]">
            <li>3 practice tests per state</li>
            <li>Car (DMV) only</li>
            <li>English only</li>
            <li>Basic results</li>
          </ul>
        </div>
        {/* Pro plan */}
        <div className="bg-[#0B1C3D] rounded-2xl p-6 border border-[#1e3a5f] relative shadow-sm">
          <span className="absolute top-3 right-3 text-[10px] font-bold text-[#F59E0B] uppercase tracking-wide">Popular</span>
          <h3 className="text-base font-bold text-white mb-0.5">PRO</h3>
          <p className="text-2xl font-bold text-white mb-4">$39<span className="text-sm font-normal text-[#94A3B8]">/mo</span></p>
          <ul className="space-y-2.5 text-sm text-[#CBD5E1] mb-6">
            <li>All tests for all 50 states</li>
            <li>Car, CDL, Motorcycle</li>
            <li>4 languages (EN, RU, ES, ZH)</li>
            <li>Detailed results + explanations</li>
          </ul>
          <button type="button" onClick={() => router.push('/upgrade')}
            className="w-full bg-[#F59E0B] text-[#0B1C3D] py-3 rounded-xl font-semibold text-sm hover:bg-[#FBBF24] transition-all">
            Upgrade $39/mo
          </button>
        </div>
      </div>

      {/* Footer */}
      <p className="text-xs text-[#94A3B8] mt-8 text-center leading-relaxed max-w-md">
        By continuing, you agree to our{' '}
        <a href="#" className="text-[#2563EB] font-medium">Terms</a> and{' '}
        <a href="#" className="text-[#2563EB] font-medium">Privacy Policy</a>.<br />
        Free for everyone. No credit card needed.
      </p>

    </main>
  );
}