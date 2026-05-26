'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// Self-service account section for /profile.
//
// Three actions, each behind its own collapsible row so the section
// stays calm visually until the user actually wants one of them:
//
//   - Change password — supabase.auth.updateUser({ password }). Works
//     even for OAuth-only accounts (it adds a password, doesn't replace).
//   - Change email — supabase.auth.updateUser({ email }). Supabase
//     emails both addresses; user must click both links to commit.
//   - Delete account — POST /api/account/delete. Server uses service
//     role to call auth.admin.deleteUser() since the client can't
//     delete its own auth row.

export default function AccountSettings({ user, lang, tex }) {
  const router = useRouter();
  const [open, setOpen] = useState(null); // 'password' | 'email' | 'delete' | null

  return (
    <div className="bg-white rounded-2xl p-6 w-full mt-5 shadow-sm border border-[#E2E8F0]">
      <h3 className="text-base font-bold text-[#0B1C3D] mb-4">{tex.accountSettingsTitle}</h3>
      <div className="space-y-2">
        <Row label={tex.changePasswordSection} active={open === 'password'} onClick={() => setOpen(open === 'password' ? null : 'password')}>
          <ChangePasswordForm user={user} tex={tex} onDone={() => setOpen(null)} />
        </Row>
        <Row label={tex.changeEmailSection} active={open === 'email'} onClick={() => setOpen(open === 'email' ? null : 'email')}>
          <ChangeEmailForm user={user} tex={tex} onDone={() => setOpen(null)} />
        </Row>
        <Row label={tex.deleteAccountSection} active={open === 'delete'} onClick={() => setOpen(open === 'delete' ? null : 'delete')} danger>
          <DeleteAccountForm user={user} lang={lang} tex={tex} router={router} onCancel={() => setOpen(null)} />
        </Row>
      </div>
    </div>
  );
}

function Row({ label, active, onClick, danger, children }) {
  return (
    <div className={`rounded-xl border ${active ? 'border-[#2563EB] bg-[#F8FAFC]' : 'border-[#E2E8F0]'}`}>
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left px-4 py-3 flex items-center justify-between text-sm font-medium ${danger ? 'text-[#DC2626]' : 'text-[#1E293B]'}`}
      >
        <span>{label}</span>
        <span className="text-xs text-[#94A3B8]">{active ? '−' : '+'}</span>
      </button>
      {active && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function ChangePasswordForm({ user, tex, onDone }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState(false);

  // OAuth-only accounts (e.g. signed up with Google) don't have a
  // password yet — they're "setting one for the first time", not
  // "changing", so we skip the current-password check for them.
  // Detect via app_metadata.provider; if it's anything other than
  // 'email', the account was created via OAuth.
  const provider = user?.app_metadata?.provider || 'email';
  const requiresCurrent = provider === 'email';

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError(tex.passwordsMustMatch); return; }
    if (password.length < 6)  { setError(tex.passwordTooShort);   return; }
    setBusy(true);
    try {
      // Re-verify current password before allowing the change. Closes
      // the "stolen session" hijack where an attacker with access to
      // an active browser silently locks the owner out by setting a
      // new password.
      if (requiresCurrent) {
        const { error: vErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });
        if (vErr) { setError(tex.currentPasswordWrong); return; }
      }
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) { setError(err.message); return; }
      setSuccess(true);
      setCurrentPassword(''); setPassword(''); setConfirm('');
      setTimeout(() => { setSuccess(false); onDone(); }, 1500);
    } catch { setError(tex.somethingWentWrong || 'Something went wrong'); }
    finally { setBusy(false); }
  }

  if (success) return <p className="text-xs text-[#16A34A]">{tex.passwordChangedSuccess}</p>;

  return (
    <form onSubmit={submit} className="space-y-2 pt-2">
      {!requiresCurrent && (
        <p className="text-xs text-[#64748B] pb-1">{tex.setPasswordFirstTimeHint}</p>
      )}
      {requiresCurrent && (
        <input type="password" required placeholder={tex.currentPasswordPlaceholder}
          value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm focus:border-[#2563EB] focus:outline-none" />
      )}
      <input type="password" required minLength={6} placeholder={tex.newPasswordPlaceholder}
        value={password} onChange={e => setPassword(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm focus:border-[#2563EB] focus:outline-none" />
      <input type="password" required minLength={6} placeholder={tex.confirmNewPasswordPlaceholder}
        value={confirm} onChange={e => setConfirm(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm focus:border-[#2563EB] focus:outline-none" />
      {error && <p className="text-xs text-[#DC2626]">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full bg-[#2563EB] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#1D4ED8] transition disabled:opacity-60">
        {busy ? '...' : tex.updatePasswordButton}
      </button>
    </form>
  );
}

function ChangeEmailForm({ user, tex, onDone }) {
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const [sent, setSent]         = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (newEmail.trim().toLowerCase() === (user.email || '').toLowerCase()) {
      setError(tex.emailSameAsCurrent);
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (err) { setError(err.message); return; }
      setSent(newEmail.trim());
    } catch { setError(tex.somethingWentWrong || 'Something went wrong'); }
    finally { setBusy(false); }
  }

  if (sent) {
    return (
      <div className="pt-2 space-y-2">
        <p className="text-xs text-[#16A34A]">
          {(tex.emailChangeRequestedMessage || '').replace('{email}', sent)}
        </p>
        <button type="button" onClick={onDone}
          className="text-xs text-[#94A3B8] hover:text-[#2563EB] transition">{tex.back}</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 pt-2">
      <p className="text-xs text-[#64748B]">{tex.changeEmailHint}</p>
      <input type="email" required placeholder={tex.newEmailPlaceholder}
        value={newEmail} onChange={e => setNewEmail(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm focus:border-[#2563EB] focus:outline-none" />
      {error && <p className="text-xs text-[#DC2626]">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full bg-[#2563EB] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#1D4ED8] transition disabled:opacity-60">
        {busy ? '...' : tex.changeEmailButton}
      </button>
    </form>
  );
}

function DeleteAccountForm({ user, lang, tex, router, onCancel }) {
  const [typedEmail, setTypedEmail]       = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [typedConfirmWord, setTypedConfirmWord] = useState('');
  const [busy, setBusy]                   = useState(false);
  const [error, setError]                 = useState('');

  const emailMatches = typedEmail.trim().toLowerCase() === (user.email || '').toLowerCase();

  // Different second-factor depending on how the user signed up. An
  // email/password user re-types their current password (cheap and
  // strong). An OAuth user has no password, so we ask them to retype
  // a literal confirmation word — a deliberate, deletion-specific
  // gesture that an automated session-hijack tool would have to script
  // explicitly. The same UX is universal across languages.
  const provider = user?.app_metadata?.provider || 'email';
  const isEmailAccount = provider === 'email';
  const CONFIRM_WORD = 'DELETE';
  const wordMatches = typedConfirmWord.trim() === CONFIRM_WORD;
  const ready = emailMatches && (isEmailAccount ? currentPassword.length > 0 : wordMatches);

  async function submit(e) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      // Re-verify the user before nuking the account — closes the
      // "stolen session" path where an attacker with an open browser
      // burns down the owner's Pro pass in two clicks.
      if (isEmailAccount) {
        const { error: vErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });
        if (vErr) { setError(tex.currentPasswordWrong); return; }
      }

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError(tex.somethingWentWrong); return; }

      const r = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setError(data.error || `HTTP ${r.status}`); return; }

      await supabase.auth.signOut();
      router.replace(`/?lang=${lang}&deleted=1`);
    } catch { setError(tex.somethingWentWrong || 'Something went wrong'); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3 pt-2">
      <p className="text-xs text-[#DC2626] font-medium">{tex.deleteAccountWarning}</p>
      <p className="text-xs text-[#64748B]">
        {(tex.deleteAccountConfirmPrompt || '').replace('{email}', user.email || '')}
      </p>
      <input type="email" required placeholder={user.email || ''}
        value={typedEmail} onChange={e => setTypedEmail(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm focus:border-[#DC2626] focus:outline-none" />

      {emailMatches && isEmailAccount && (
        <input type="password" required placeholder={tex.currentPasswordPlaceholder}
          value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm focus:border-[#DC2626] focus:outline-none" />
      )}
      {emailMatches && !isEmailAccount && (
        <>
          <p className="text-xs text-[#64748B]">
            {(tex.deleteAccountTypeWordPrompt || '').replace('{word}', CONFIRM_WORD)}
          </p>
          <input type="text" required placeholder={CONFIRM_WORD}
            value={typedConfirmWord} onChange={e => setTypedConfirmWord(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm focus:border-[#DC2626] focus:outline-none uppercase" />
        </>
      )}

      {error && <p className="text-xs text-[#DC2626]">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel}
          className="flex-1 bg-white border border-[#E2E8F0] text-[#1E293B] py-2 rounded-lg text-sm font-medium hover:bg-[#F8FAFC] transition">
          {tex.deleteAccountCancel || tex.back}
        </button>
        <button type="submit" disabled={!ready || busy}
          className="flex-1 bg-[#DC2626] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#B91C1C] transition disabled:opacity-40 disabled:cursor-not-allowed">
          {busy ? '...' : tex.deleteAccountConfirmedButton}
        </button>
      </div>
    </form>
  );
}
