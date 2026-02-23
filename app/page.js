'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';

export default function Home() {
  const [lang, setLang] = useState('English');
  const [state, setState] = useState('');
  const [user, setUser] = useState(null);
  const [isPro, setIsPro] = useState(false);
  const [liveCount] = useState(() => Math.floor(Math.random() * 40) + 15);
  const [activeStep, setActiveStep] = useState(0);
  const stateSelectRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep(prev => prev < 3 ? prev + 1 : 0);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

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

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  const stateEmoji = { 'Washington (WA)': '🏔️', 'California (CA)': '🌴', 'New York (NY)': '🗽', 'Texas (TX)': '🤠', 'Florida (FL)': '🌊' };
  const steps = [
    { emoji: '📱', label: tex.step1, msg: tex.stepMsg1, color: '#3B82F6' },
    { emoji: '🏛️', label: tex.step2, msg: tex.stepMsg2, color: '#8B5CF6' },
    { emoji: '🪪', label: tex.step3, msg: tex.stepMsg3, color: '#10B981' },
    { emoji: '🚗', label: tex.step4, msg: tex.stepMsg4, color: '#F59E0B' },
  ];

  return (
    <main style={{ fontFamily: 'DM Sans, sans-serif', background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }} className="min-h-screen flex flex-col items-center py-8 px-4">

      {/* Background blobs */}
      <div className="fixed top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(26,86,219,0.08) 0%, transparent 70%)' }} />
      <div className="fixed bottom-[-150px] left-[-150px] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)' }} />

      {/* Header: centered logo + slogan, user pill absolute top-right */}
      <header className="relative w-full max-w-lg mx-auto mb-6 px-4">
        <div className="flex flex-col items-center text-center">
          <a href="/" className="cursor-pointer hover:opacity-90 transition">
            <img src="/logo.png" alt="DMVSOS" className="w-12 h-12 rounded-xl mx-auto mb-1" />
            <div className="text-[22px] sm:text-[26px] font-bold text-[#0B1C3D] tracking-tight">
              DMV<span className="text-[#2563EB]">SOS</span>
            </div>
            <p className="text-sm text-[#94A3B8]">{tex.slogan}</p>
          </a>
        </div>
        {user && (() => {
          const raw = user.user_metadata?.full_name || user.email || '';
          const firstName = raw.split(/\s+/)[0] || raw.split('@')[0] || '?';
          const initial = (raw || '?')[0].toUpperCase();
          return (
            <div className="absolute top-4 right-4 flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-full pl-1.5 pr-2.5 py-1 shadow-sm">
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
                className="hidden sm:block text-[11px] text-[#94A3B8] hover:text-[#64748B] hover:underline transition">
                Sign out
              </button>
            </div>
          );
        })()}
      </header>

      {/* Language bar - single row, scroll on mobile */}
      <div className="flex flex-nowrap gap-1.5 justify-center mb-4 overflow-x-auto pb-1 w-full max-w-lg mx-auto px-4">
        {langs.map((l) => (
          <button key={l.name} onClick={() => setLang(l.name)} type="button"
            className={`shrink-0 text-xs py-1 px-2.5 rounded-full whitespace-nowrap font-medium border border-[#E2E8F0] transition-all ${
              lang === l.name
                ? 'bg-[#0B1C3D] text-white border-[#0B1C3D]'
                : 'bg-white text-[#94A3B8] hover:border-[#2563EB] hover:text-[#2563EB]'
            }`}>
            {l.flag} {l.name}
          </button>
        ))}
      </div>

      {/* Main card */}
      <div id="state-selector" className="w-full max-w-lg mx-auto px-4 mb-8">
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 border border-[#E2E8F0]/40" style={{ borderTop: '4px solid #2563EB' }}>

        <h2 className="text-[22px] font-bold text-[#1E293B] mb-1">{tex.heroTitle}</h2>
        <p className="text-sm text-[#94A3B8] mb-7 leading-relaxed">{tex.heroSub}</p>

        {/* State */}
        <select
          ref={stateSelectRef}
          value={state}
          onChange={e => setState(e.target.value)}
          className="w-full px-4 py-4 border-2 border-[#E2E8F0] rounded-[10px] text-base text-[#1E293B] bg-[#F8FAFC] mb-6 focus:outline-none focus:border-[#2563EB] transition cursor-pointer"
        >
          <option value="">{tex.selectState}</option>
          {states.map(s => (
            <option key={s} value={s}>{stateEmoji[s] ? `${s} ${stateEmoji[s]}` : s}</option>
          ))}
        </select>

        {/* Single primary CTA - blue by default, amber for Pro when state selected */}
        {(() => {
          const isProWithState = user && isPro && state;
          const buttonLabel = !state ? tex.ctaNoState : (isProWithState ? tex.ctaProReady : tex.ctaReady);
          const isAmber = isProWithState;
          return (
            <>
              <button
                type="button"
                onClick={() => {
                  if (state) {
                    const slug = stateToSlug(state);
                    if (slug) router.push(`/category?state=${slug}&lang=${langCode}`);
                  } else {
                    document.getElementById('state-selector')?.scrollIntoView({ behavior: 'smooth' });
                    stateSelectRef.current?.focus();
                  }
                }}
                className={`w-full py-4 rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-all text-white cursor-pointer ${state ? 'btn-pulse' : ''} ${isAmber ? 'bg-[#F59E0B] hover:bg-[#D97706]' : 'bg-[#2563EB] hover:bg-[#1D4ED8]'}`}
              >
                {buttonLabel}
              </button>
              {isPro && state ? (
                <p className="text-xs text-center mt-3 text-[#B45309] font-medium">{tex.proActive}</p>
              ) : (
                <div className="flex flex-wrap gap-2 justify-center mt-3">
                  <span className="text-xs text-gray-400">{tex.trust1}</span>
                  <span className="text-xs text-gray-400">{tex.trust2}</span>
                  <span className="text-xs text-gray-400">{tex.trust3}</span>
                </div>
              )}
            </>
          );
        })()}
        {state && (
          <p className="text-xs text-gray-400 mt-2 text-center">🟢 {liveCount} {tex.practicingNow}</p>
        )}
        <button
          type="button"
          onClick={() => router.push(`/login?lang=${langCode}`)}
          className="w-full mt-4 text-xs text-[#94A3B8] hover:text-[#2563EB] transition"
        >
          {tex.alreadyHaveAccount}
        </button>

        </div>
      </div>

      {/* How it works - interactive steps */}
      <div className="w-full max-w-lg mx-auto mb-8 px-4">
        <h2 className="text-center text-lg font-bold text-[#0B1C3D] mb-6">
          {tex.howItWorks}
        </h2>

        <div className="grid grid-cols-4 gap-2">
          {steps.map((step, i) => (
            <div
              key={i}
              onClick={() => setActiveStep(i)}
              className="flex flex-col items-center p-3 rounded-2xl cursor-pointer"
              style={{
                background: activeStep === i ? `${step.color}18` : 'white',
                border: `2px solid ${activeStep === i ? step.color : '#F1F5F9'}`,
                transform: activeStep === i ? 'translateY(-6px)' : 'translateY(0)',
                boxShadow: activeStep === i ? `0 8px 20px ${step.color}30` : '0 2px 8px rgba(0,0,0,0.05)',
                transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            >
              <span
                className="text-3xl mb-2"
                style={{
                  transform: activeStep === i ? 'scale(1.3)' : 'scale(1)',
                  filter: activeStep === i ? `drop-shadow(0 4px 8px ${step.color}60)` : 'none',
                  transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  display: 'block',
                }}
              >
                {step.emoji}
              </span>
              <span
                className="text-xs text-center font-semibold leading-tight"
                style={{
                  color: activeStep === i ? step.color : '#94A3B8',
                  transition: 'color 0.3s'
                }}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-2 mt-5">
          {steps.map((step, i) => (
            <div
              key={i}
              onClick={() => setActiveStep(i)}
              className="rounded-full cursor-pointer"
              style={{
                width: activeStep === i ? '28px' : '8px',
                height: '8px',
                background: activeStep === i ? steps[i].color : '#E2E8F0',
                transition: 'all 0.4s ease',
              }}
            />
          ))}
        </div>

        <p
          className="text-center text-sm font-medium mt-4"
          style={{
            color: steps[activeStep].color,
            transition: 'color 0.3s',
            minHeight: '20px'
          }}
        >
          {steps[activeStep].msg}
        </p>
      </div>

      {/* Testimonials */}
      <div className="w-full max-w-lg mx-auto mb-8 px-4">
        <h2 className="text-center text-xl font-bold text-[#0B1C3D] mb-6">
          {tex.testimonialsTitle}
        </h2>
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex gap-1 mb-2">⭐⭐⭐⭐⭐</div>
            <p className="text-sm text-[#475569] mb-3">"Готовился на русском языке, всё понятно и чётко. Сдал с первого раза в Bellevue. Очень помогло что вопросы именно по Вашингтону."</p>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-sm">М</div>
              <div>
                <div className="text-sm font-semibold text-[#0B1C3D]">Михаил Д.</div>
                <div className="text-xs text-gray-400">Bellevue, WA</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex gap-1 mb-2">⭐⭐⭐⭐⭐</div>
            <p className="text-sm text-[#475569] mb-3">"Practiqué dos días en español y pasé el examen a la primera en Santa Monica. Los mejores $9.99 que gasté."</p>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center font-bold text-orange-600 text-sm">C</div>
              <div>
                <div className="text-sm font-semibold text-[#0B1C3D]">Carlos R.</div>
                <div className="text-xs text-gray-400">Santa Monica, CA</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex gap-1 mb-2">⭐⭐⭐⭐⭐</div>
            <p className="text-sm text-[#475569] mb-3">"用中文练习很方便，两天后在Fort Lauderdale一次通过考试！"</p>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center font-bold text-red-600 text-sm">W</div>
              <div>
                <div className="text-sm font-semibold text-[#0B1C3D]">Wei L.</div>
                <div className="text-xs text-gray-400">Fort Lauderdale, FL</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex gap-1 mb-2">⭐⭐⭐⭐⭐</div>
            <p className="text-sm text-[#475569] mb-3">"I was so nervous I was sure I'd fail. But after practicing here every day, I walked into the DOl in Tacoma feeling ready. Passed my written test on the first try!"</p>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center font-bold text-green-600 text-sm">S</div>
              <div>
                <div className="text-sm font-semibold text-[#0B1C3D]">Sarah M.</div>
                <div className="text-xs text-gray-400">Tacoma, WA</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className="w-full max-w-lg mx-auto mb-8 px-4">
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
      <p className="text-xs text-[#94A3B8] mt-8 text-center leading-relaxed max-w-lg mx-auto px-4">
        By continuing, you agree to our{' '}
        <a href="#" className="text-[#2563EB] font-medium">Terms</a> and{' '}
        <a href="#" className="text-[#2563EB] font-medium">Privacy Policy</a>.<br />
        Free for everyone. No credit card needed.
      </p>

    </main>
  );
}