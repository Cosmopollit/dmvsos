'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import Image from 'next/image';
import { t } from '@/lib/translations';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { getSavedLang, saveLang } from '@/lib/lang';
import { flags } from '@/lib/flags';

const langs = [
  { label: 'EN', flag: flags.us, code: 'en' },
  { label: 'RU', flag: flags.ru, code: 'ru' },
  { label: 'ES', flag: flags.es, code: 'es' },
  { label: 'ZH', flag: flags.cn, code: 'zh' },
  { label: 'UA', flag: flags.ua, code: 'ua' },
];

function ResultContent() {
  const router = useRouter();
  const params = useSearchParams();
  const score = parseInt(params.get('score') || 0, 10);
  const total = Math.max(1, parseInt(params.get('total') || 3, 10));
  const percent = Math.round((score / total) * 100);
  const passed = total > 0 && score / total >= 0.7;

  const { user, isPro } = useAuth();

  const [testResults, setTestResults] = useState(null);
  const [expandedRefs, setExpandedRefs] = useState({});
  const [langOverride, setLangOverride] = useState(null);
  const [showLangMenu, setShowLangMenu] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('testResults');
      setTestResults(raw ? JSON.parse(raw) : null);
    } catch {
      setTestResults(null);
    }
  }, []);

  const questions = testResults?.questions ?? [];
  const userAnswers = testResults?.userAnswers ?? [];
  const elapsed = testResults?.elapsed ?? 0;
  const state = testResults?.state ?? 'washington';
  const category = testResults?.category ?? 'car';
  const lang = langOverride ?? testResults?.lang ?? getSavedLang();
  const currentLang = langs.find(l => l.code === lang) || langs[0];
  function switchLang(code) { setLangOverride(code); saveLang(code); setShowLangMenu(false); }
  const wrongQuestions = questions.filter((q, i) => userAnswers[i] !== q.correctAnswerIndex);
  const tex = t[lang] || t.en;
  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
  }

  async function handleAppleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: window.location.origin },
    });
  }

  async function handleFacebookSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: { redirectTo: window.location.origin },
    });
  }

  function stripQuestion(s) {
    return (s || '').replace(/^\d+\.\s*/, '');
  }
  function stripAnswer(s) {
    return (s || '').replace(/^[A-DА-Га-гa-d]\.\s*/, '');
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-6" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
      <div className="w-full max-w-lg flex flex-col items-center gap-5">
        {/* Header with nav */}
        <div className="w-full flex items-center justify-between">
          <button type="button" onClick={() => router.push(`/category?state=${state}&lang=${lang}`)}
            className="text-sm text-[#94A3B8] hover:text-[#2563EB] transition font-medium">
            {tex.back}
          </button>
          <a href="/" className="flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition">
            <Image src="/logo.png" alt="DMVSOS" width={24} height={24} className="rounded-md" />
            <span className="text-sm font-bold text-[#0B1C3D]">DMVSOS</span>
          </a>
          <div className="relative">
            <button type="button" onClick={() => setShowLangMenu(v => !v)} onBlur={() => setTimeout(() => setShowLangMenu(false), 150)}
              className="flex items-center gap-1 text-xs font-semibold text-[#64748B] bg-white border border-[#E2E8F0] rounded-full px-2.5 py-1.5 hover:border-[#2563EB] transition-colors">
              <span>{currentLang.flag}</span><span>{currentLang.label}</span><span className="text-[#94A3B8] text-[10px] ml-0.5">▾</span>
            </button>
            {showLangMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-lg z-50 py-1 min-w-[90px]">
                {langs.map(l => (
                  <button key={l.code} type="button" onMouseDown={() => switchLang(l.code)}
                    className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-[#F8FAFC] transition-colors ${lang === l.code ? 'text-[#2563EB]' : 'text-[#64748B]'}`}>
                    <span>{l.flag}</span> <span>{l.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Result card */}
        <div className="bg-white rounded-2xl p-8 w-full shadow-sm border border-[#E2E8F0] text-center">
          <div className="text-5xl mb-4">{passed ? '🎉' : '😓'}</div>
          <div
            className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold mb-4 ${
              passed ? 'bg-[#F0FDF4] text-[#16A34A]' : 'bg-[#FEF2F2] text-[#DC2626]'
            }`}
          >
            {passed ? tex.passed : tex.notPassed}
          </div>
          <div className="text-5xl font-bold text-[#0B1C3D] mb-1">{percent}%</div>
          <p className="text-[#94A3B8] text-sm mb-2">
            {(tex.resultText || 'You answered {score} out of {total} correctly').replace(/\{score\}/g, String(score)).replace(/\{total\}/g, String(total))}
          </p>
          {elapsed > 0 && (
            <p className="text-[#94A3B8] text-sm mb-6">{tex.completedIn} {formatTime(elapsed)}</p>
          )}
          {elapsed === 0 && <div className="mb-6" />}
          <div className="w-full h-1.5 bg-[#E2E8F0] rounded-full mb-6">
            <div
              className={`h-1.5 rounded-full transition-all duration-700 ${
                passed ? 'bg-[#16A34A]' : 'bg-[#DC2626]'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Sign in to save results */}
        {!user && (
          <div className="bg-white rounded-2xl p-6 w-full shadow-sm border border-[#E2E8F0] text-center">
            <h3 className="text-lg font-bold text-[#0B1C3D] mb-1">💾 {tex.saveResults}</h3>
            <p className="text-sm text-[#94A3B8] mb-4">{tex.saveSubtext}</p>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full bg-white text-[#1E293B] border border-[#E2E8F0] py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-3 hover:bg-[#F8FAFC] hover:border-[#2563EB] transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/><path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/><path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/></svg>
              {tex.continueGoogle}
            </button>
            <button
              type="button"
              onClick={handleAppleSignIn}
              className="w-full bg-black text-white border border-black py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-3 hover:bg-[#1a1a1a] transition-all mt-2"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="white" className="shrink-0"><path d="M13.4 9.3c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.7-3.2.7-.6 0-1.6-.7-2.7-.7-1.4 0-2.7.8-3.4 2-1.4 2.5-.4 6.2 1 8.2.7 1 1.5 2 2.5 2 1 0 1.4-.6 2.6-.6 1.2 0 1.6.6 2.6.6 1.1 0 1.8-.9 2.5-1.9.8-1.1 1.1-2.2 1.1-2.2s-2-.8-2-3.3zM11.5 3c.6-.7 1-1.6.8-2.5-.8 0-1.8.5-2.3 1.2-.5.6-1 1.5-.8 2.4.9.1 1.8-.4 2.3-1.1z"/></svg>
              {tex.continueApple}
            </button>
            <button
              type="button"
              onClick={handleFacebookSignIn}
              className="w-full bg-[#1877F2] text-white py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-3 hover:bg-[#166FE5] transition-all mt-2"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="white" className="shrink-0"><path d="M18 9a9 9 0 1 0-10.406 8.89v-6.29H5.309V9h2.285V7.017c0-2.258 1.344-3.505 3.4-3.505.985 0 2.015.176 2.015.176v2.215h-1.135c-1.118 0-1.467.694-1.467 1.406V9h2.496l-.399 2.6h-2.097v6.29A9.003 9.003 0 0 0 18 9z"/></svg>
              {tex.continueFacebook}
            </button>
          </div>
        )}

        {/* Question-by-question review */}
        {questions.length > 0 && (
          <div className="bg-white rounded-2xl p-6 w-full shadow-sm border border-[#E2E8F0]">
            <h2 className="text-lg font-bold text-[#0B1C3D] mb-4">{tex.questionReview}</h2>
            <ul className="space-y-4">
              {questions.map((q, i) => {
                const correct = userAnswers[i] === q.correctAnswerIndex;
                const correctText = q.answers?.[q.correctAnswerIndex];
                return (
                  <li
                    key={i}
                    className={`rounded-xl p-4 border text-left ${
                      correct ? 'bg-[#F0FDF4] border-[#16A34A]' : 'bg-[#FEF2F2] border-[#DC2626]'
                    }`}
                  >
                    {q.imageUrl && (
                      <div className="flex justify-center mb-3">
                        <img src={q.imageUrl} alt="" className="h-20 rounded-lg border border-[#E2E8F0] object-contain" />
                      </div>
                    )}
                    <div className="flex gap-2 items-start">
                      <span className="text-lg shrink-0">{correct ? '✅' : '❌'}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#1E293B]">
                          {stripQuestion(q.question)}
                        </p>
                        {!correct && correctText != null && (
                          <p className="text-sm text-[#16A34A] mt-1">
                            {tex.correct}: <strong>{stripAnswer(correctText)}</strong>
                          </p>
                        )}
                        {q.explanation && (
                          <p className="text-sm text-[#64748B] mt-1">
                            {q.explanation}
                          </p>
                        )}
                        {q.manualReference && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => setExpandedRefs(prev => ({ ...prev, [i]: !prev[i] }))}
                              className="flex items-center gap-1 text-xs text-[#94A3B8] hover:text-[#2563EB] transition-colors"
                            >
                              <span>📖</span>
                              <span className="underline underline-offset-2">
                                {q.manualSection || 'Driver Manual'}
                              </span>
                              <span className="text-[10px]">{expandedRefs[i] ? '▲' : '▼'}</span>
                            </button>
                            {expandedRefs[i] && (
                              <p className="mt-1.5 text-xs text-[#64748B] italic border-l-2 border-[#E2E8F0] pl-2 leading-relaxed">
                                "{q.manualReference}"
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Upgrade banner  ·  hidden for Pro users */}
        {!isPro && (
          <div className="bg-white rounded-2xl p-5 w-full border border-[#E2E8F0] shadow-sm">
            <p className="text-[#0B1C3D] font-bold text-base mb-1 text-center">{tex.upgradeModalTitle || 'Unlock Full Access'}</p>
            <p className="text-[#64748B] text-xs mb-4 text-center">One payment · 30 days access · No auto-renewal</p>
            <div className="flex gap-2 mb-3">
              {/* Quick Pass */}
              <div className="flex-1 border border-[#E2E8F0] rounded-xl p-3 text-center flex flex-col">
                <div className="text-xs font-bold text-[#2563EB] mb-0.5">Quick Pass</div>
                <div className="text-base font-black text-[#0B1C3D] mb-2">$7.99</div>
                <button type="button" onClick={() => router.push(`/upgrade?lang=${lang}&plan=quick_pass`)}
                  className="mt-auto w-full py-1.5 rounded-lg text-xs font-semibold bg-[#F1F5F9] text-[#0B1C3D] hover:bg-[#E2E8F0] transition">
                  Get it
                </button>
              </div>
              {/* Full Prep */}
              <div className="flex-1 border-2 border-[#2563EB] rounded-xl p-3 text-center flex flex-col bg-[#EFF6FF]">
                <div className="text-[9px] font-bold text-white bg-[#2563EB] rounded-full px-1.5 py-0.5 mb-1 mx-auto w-fit">POPULAR</div>
                <div className="text-xs font-bold text-[#2563EB] mb-0.5">Full Prep</div>
                <div className="text-base font-black text-[#0B1C3D] mb-2">$14.99</div>
                <button type="button" onClick={() => router.push(`/upgrade?lang=${lang}&plan=full_prep`)}
                  className="mt-auto w-full py-1.5 rounded-lg text-xs font-bold bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition">
                  Get it
                </button>
              </div>
              {/* Guaranteed Pass */}
              <div className="flex-1 border-2 border-[#F59E0B] rounded-xl p-3 text-center flex flex-col">
                <div className="text-[9px] font-bold text-[#0B1C3D] bg-[#F59E0B] rounded-full px-1.5 py-0.5 mb-1 mx-auto w-fit">🛡️</div>
                <div className="text-xs font-bold text-[#92400E] mb-0.5">Guaranteed</div>
                <div className="text-base font-black text-[#0B1C3D] mb-2">$39.99</div>
                <button type="button" onClick={() => router.push(`/upgrade?lang=${lang}&plan=guaranteed_pass`)}
                  className="mt-auto w-full py-1.5 rounded-lg text-xs font-semibold bg-[#0B1C3D] text-white hover:bg-[#1E3A5F] transition">
                  Get it
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Buttons */}
        <button
          type="button"
          onClick={() => router.push(`/category?state=${state}&lang=${lang}`)}
          className="w-full bg-[#2563EB] text-white py-3.5 rounded-xl font-semibold text-base hover:bg-[#1D4ED8] transition-all"
        >
          {tex.tryAgain}
        </button>
        {wrongQuestions.length > 0 && (
          <button
            type="button"
            onClick={() => {
              sessionStorage.setItem('retryQuestions', JSON.stringify(wrongQuestions));
              router.push(`/test?state=${state}&category=${category}&lang=${lang}&retry=true`);
            }}
            className="w-full bg-white border border-[#E2E8F0] text-[#1E293B] py-3.5 rounded-xl font-semibold text-base hover:border-[#2563EB] hover:text-[#2563EB] hover:bg-[#F8FAFC] transition-all"
          >
            {tex.retryWrong} ({wrongQuestions.length})
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push('/')}
          className="w-full bg-white border border-[#E2E8F0] text-[#1E293B] py-3.5 rounded-xl font-semibold text-base hover:border-[#2563EB] hover:text-[#2563EB] hover:bg-[#F8FAFC] transition-all"
        >
          {tex.home}
        </button>

        {/* Manual link */}
        <a
          href={`/manuals/${state}`}
          className="block w-full text-center text-sm text-[#2563EB] hover:underline font-medium py-2"
        >
          {tex.studyManual} →
        </a>
      </div>
    </main>
  );
}

export default function Result() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}><div className="w-6 h-6 border-2 border-[#94A3B8] border-t-transparent rounded-full animate-spin" /></main>}>
      <ResultContent />
    </Suspense>
  );
}
