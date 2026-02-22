'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';

export default function Home() {
  const [lang, setLang] = useState('English');
  const [state, setState] = useState('');
  const [user, setUser] = useState(null);
  const [isPro, setIsPro] = useState(false);
  const [liveCount] = useState(() => Math.floor(Math.random() * 40) + 15);
  const router = useRouter();

  const langToCode = { English: 'en', 'Русский': 'ru', 'Español': 'es', '中文': 'zh', 'Українська': 'ua' };
  const langCode = langToCode[lang] || 'en';
  const tex = t[langCode] || t.en;

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
      } else {
        setUser(null);
        setIsPro(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    supabase
      .from('profiles')
      .select('is_pro')
      .eq('email', user.email)
      .single()
      .then(({ data: profile }) => setIsPro(profile?.is_pro ?? false));
  }, [user?.email]);

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

  const stateEmoji = { 'Washington (WA)': '🏔️', 'California (CA)': '🌴', 'New York (NY)': '🗽', 'Texas (TX)': '🤠', 'Florida (FL)': '🌊' };

  return (
    <main style={{ fontFamily: 'DM Sans, sans-serif', background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }} className="min-h-screen flex flex-col items-center justify-center py-10 px-4 sm:px-6 relative overflow-hidden">

      {/* Background blobs */}
      <div className="fixed top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(26,86,219,0.08) 0%, transparent 70%)' }} />
      <div className="fixed bottom-[-150px] left-[-150px] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)' }} />

      {/* Header: brand + user (no overlap, in flow) */}
      <header className="w-full max-w-lg mx-auto flex items-center justify-between gap-4 mb-6 px-1">
        <a href="/" className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-90 transition">
          <img src="/logo.png" alt="DMVSOS" className="w-12 h-12 rounded-xl shrink-0" />
          <div className="min-w-0">
            <div className="text-[22px] sm:text-[26px] font-bold text-[#0B1C3D] tracking-tight">
              DMV<span className="text-[#2563EB]">SOS</span>
            </div>
            <p className="text-sm text-[#94A3B8]">{tex.slogan}</p>
          </div>
        </a>
        {user && (() => {
          const raw = user.user_metadata?.full_name || user.email || '';
          const firstName = raw.split(/\s+/)[0] || raw.split('@')[0] || '?';
          const initial = (raw || '?')[0].toUpperCase();
          return (
            <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-full pl-1.5 pr-2.5 py-1 shadow-sm shrink-0">
              <button
                type="button"
                onClick={() => router.push('/profile')}
                className="flex items-center gap-2 min-w-0 hover:opacity-90 transition"
              >
                {isPro ? (
                  <span className="text-[#F59E0B] font-medium text-xs max-w-[100px] truncate">👑 <span className="hidden sm:inline">{firstName}</span></span>
                ) : (
                  <>
                    <div className="w-7 h-7 rounded-full bg-[#0B1C3D] flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                      {initial}
                    </div>
                    <span className="hidden sm:block text-xs font-medium text-[#1E293B] max-w-[100px] truncate">{firstName}</span>
                  </>
                )}
              </button>
              <button onClick={handleSignOut} type="button"
                className="text-[11px] text-[#94A3B8] hover:text-[#64748B] hover:underline transition">
                Sign out
              </button>
            </div>
          );
        })()}
      </header>

      {/* Language bar - centered, wraps on small screens */}
      <div className="flex flex-wrap gap-2 justify-center mb-6">
        {langs.map((l) => (
          <button key={l.name} onClick={() => setLang(l.name)} type="button"
            className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium border border-[#E2E8F0] transition-all ${
              lang === l.name
                ? 'bg-[#0B1C3D] text-white border-[#0B1C3D]'
                : 'bg-white text-[#94A3B8] hover:border-[#2563EB] hover:text-[#2563EB]'
            }`}>
            {l.flag} {l.name}
          </button>
        ))}
      </div>

      {/* Card */}
      <div id="state-selector" className="bg-white rounded-3xl p-9 w-full max-w-lg mx-auto px-4 shadow-2xl border border-[#E2E8F0]/40">

        <h2 className="text-[22px] font-bold text-[#1E293B] mb-1">{tex.startTitle}</h2>
        <p className="text-sm text-[#94A3B8] mb-7 leading-relaxed">{tex.startSubtitle}</p>

        {/* State */}
        <label className="text-xs font-semibold text-[#1E293B] uppercase tracking-widest mb-2 block">{tex.yourState}</label>
        <select value={state} onChange={e => setState(e.target.value)}
          className="w-full px-4 py-3 border-[1.5px] border-[#E2E8F0] rounded-[10px] text-[15px] text-[#1E293B] bg-[#F8FAFC] mb-6 focus:outline-none focus:border-[#2563EB] transition cursor-pointer">
          <option value="">{tex.selectState}</option>
          {states.map(s => (
            <option key={s} value={s}>{stateEmoji[s] ? `${s} ${stateEmoji[s]}` : s}</option>
          ))}
        </select>

        {user ? (
          <>
            <button
              type="button"
              onClick={() => { const slug = stateToSlug(state); if (slug) router.push(`/category?state=${slug}&lang=${langCode}`); }}
              disabled={!state}
              className={`w-full py-4 rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-all ${state ? 'btn-pulse' : ''} ${
                state
                  ? 'bg-[#2563EB] text-white hover:bg-[#1D4ED8] cursor-pointer'
                  : 'bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed'
              }`}
            >
              {tex.startPracticing}
            </button>
            {state && (
              <p className="text-xs text-gray-400 mt-2 text-center">🟢 {liveCount} {tex.practicingNow}</p>
            )}
            {!state && (
              <p className="text-xs text-[#94A3B8] text-center mt-2">{tex.selectStateFirst}</p>
            )}
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
              {state && (
                <p className="text-xs text-gray-400 mt-2 text-center">🟢 {liveCount} {tex.practicingNow}</p>
              )}
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

      <div className="w-full max-w-lg mx-auto mt-8 mb-8">
        <h2 className="text-center text-xl font-bold text-[#0B1C3D] mb-6">
          {tex.howItWorks}
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-3xl mb-2">🗺️</div>
            <div className="font-semibold text-[#0B1C3D] text-sm">{tex.step1}</div>
          </div>
          <div className="text-center">
            <div className="text-3xl mb-2">🌍</div>
            <div className="font-semibold text-[#0B1C3D] text-sm">{tex.step2}</div>
          </div>
          <div className="text-center">
            <div className="text-3xl mb-2">🚗</div>
            <div className="font-semibold text-[#0B1C3D] text-sm">{tex.step3}</div>
          </div>
        </div>
      </div>

      {/* Pricing - PRO first (left on desktop, top on mobile), all text centered */}
      <div className="w-full max-w-[560px] mt-10 px-4">
        <h2 className="text-xl font-bold text-[#0B1C3D] text-center mb-2">{tex.pricingHeading}</h2>
        <p className="text-sm text-[#64748B] text-center mb-6 leading-relaxed max-w-md mx-auto">{tex.pricingSubtext}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Pro plan - first so left on desktop, top on mobile */}
          <div className="bg-[#0B1C3D] rounded-2xl p-6 border border-[#1e3a5f] shadow-sm text-center">
            <h3 className="text-base font-bold text-white mb-1">{tex.proTitle}</h3>
            <p className="text-sm text-[#94A3B8] mb-4">{tex.proDesc}</p>
            <ul className="space-y-2 text-sm text-[#CBD5E1] mb-4 text-center list-none">
              <li>{tex.feature1}</li>
              <li>{tex.feature2}</li>
              <li>{tex.feature3}</li>
              <li>{tex.feature4}</li>
              <li>{tex.feature5}</li>
            </ul>
            <p className="text-sm font-semibold text-[#F59E0B] mb-4">{tex.proNote}</p>
            <button type="button" onClick={() => router.push(`/upgrade?lang=${langCode}`)}
              className="w-full bg-[#F59E0B] text-[#0B1C3D] py-4 rounded-xl font-bold text-base hover:bg-[#FBBF24] transition-all">
              {tex.upgradBtn}
            </button>
            <p className="text-xs text-[#94A3B8] mt-3">{tex.cancelAnytime}</p>
          </div>
          {/* Free plan - second */}
          <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm flex flex-col text-center">
            <h3 className="text-base font-bold text-[#1E293B] mb-1">{tex.freeTitle}</h3>
            <p className="text-sm text-[#94A3B8] mb-3">{tex.freeDesc}</p>
            <p className="text-2xl font-bold text-[#0B1C3D] mb-4">$0</p>
            <ul className="space-y-2 text-sm text-[#94A3B8] mb-4 text-center list-none">
              <li>{tex.freeFeature1}</li>
              <li>{tex.freeFeature2}</li>
              <li>{tex.freeFeature3}</li>
              <li>{tex.freeFeature4}</li>
            </ul>
            <button
              type="button"
              onClick={() => document.getElementById('state-selector')?.scrollIntoView({ behavior: 'smooth' })}
              className="mt-auto w-full py-3 rounded-xl font-semibold text-sm border border-[#E2E8F0] text-[#1E293B] hover:bg-[#F8FAFC] hover:border-[#2563EB] hover:text-[#2563EB] transition-all"
            >
              {tex.startFree}
            </button>
          </div>
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