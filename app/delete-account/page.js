import Link from 'next/link';

// Account-deletion instructions page. Required by Google Play's Data safety
// form (the "Delete account URL" must resolve publicly and name the app,
// list the deletion steps, and state what data is deleted or kept).
// Server-rendered, no client JS needed.
export default function DeleteAccount() {
  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-lg mx-auto px-5 py-12">
        <h1 className="text-3xl font-black text-[#0B1C3D] mb-2">
          Delete your DMVSOS account
        </h1>
        <p className="text-sm text-[#64748B] mb-8">
          Applies to the DMVSOS: DMV Practice Test app (by Cosmopollit) and the
          dmvsos.com website. One account works on both, so deleting it removes
          access everywhere.
        </p>

        <section className="bg-white rounded-2xl border border-[#E2E8F0] p-6 mb-5 shadow-sm">
          <h2 className="text-base font-bold text-[#0B1C3D] mb-3">
            Delete from the app
          </h2>
          <ol className="list-decimal ml-5 space-y-2 text-sm text-[#334155]">
            <li>Open the DMVSOS app and sign in</li>
            <li>Go to Profile, then Settings</li>
            <li>Choose Delete account</li>
            <li>Confirm with your password (or type DELETE for Google or Apple sign-in accounts)</li>
          </ol>
        </section>

        <section className="bg-white rounded-2xl border border-[#E2E8F0] p-6 mb-5 shadow-sm">
          <h2 className="text-base font-bold text-[#0B1C3D] mb-3">
            Or request deletion
          </h2>
          <p className="text-sm text-[#334155]">
            Message our support on Telegram at{' '}
            <a href="https://t.me/dmvsos_support_bot" className="text-[#2563EB] underline">
              t.me/dmvsos_support_bot
            </a>{' '}
            from any device. Include the email address of your account. We
            verify the request and delete the account within 30 days.
          </p>
        </section>

        <section className="bg-white rounded-2xl border border-[#E2E8F0] p-6 mb-8 shadow-sm">
          <h2 className="text-base font-bold text-[#0B1C3D] mb-3">
            What is deleted, what is kept
          </h2>
          <ul className="list-disc ml-5 space-y-2 text-sm text-[#334155]">
            <li>
              Deleted permanently: your account and sign-in identities (email,
              Google, Apple), profile, test history, and active passes.
            </li>
            <li>
              Kept: payment transaction records that we are legally required to
              retain for accounting and tax purposes. They are stored by our
              payment processors and are no longer linked to an active account.
            </li>
          </ul>
        </section>

        <p className="text-xs text-[#94A3B8]">
          Questions? Write to us on Telegram:{' '}
          <a href="https://t.me/dmvsos_support_bot" className="underline">
            t.me/dmvsos_support_bot
          </a>
        </p>
        <p className="text-xs text-[#94A3B8] mt-4">
          <Link href="/" className="underline">Back to dmvsos.com</Link>
        </p>
      </div>
    </main>
  );
}
