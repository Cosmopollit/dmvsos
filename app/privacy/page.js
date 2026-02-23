'use client';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function Privacy() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#F8FAFC] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <a href="/" className="flex items-center gap-2 mb-8">
          <Image src="/logo.png" alt="DMVSOS" width={36} height={36} className="rounded-xl" />
          <span className="text-xl font-bold text-[#0B1C3D]">
            DMV<span className="text-[#2563EB]">SOS</span>
          </span>
        </a>

        <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-8">
          <h1 className="text-2xl font-bold text-[#0B1C3D] mb-6">Privacy Policy</h1>
          <p className="text-sm text-[#94A3B8] mb-6">Last updated: February 23, 2026</p>

          <div className="space-y-6 text-[#334155] text-[15px] leading-relaxed">
            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">1. Information We Collect</h2>
              <p>When you use DMVSOS, we may collect:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li><strong>Account information:</strong> name and email address from Google Sign-In</li>
                <li><strong>Usage data:</strong> test scores, progress, and selected state/category preferences</li>
                <li><strong>Payment information:</strong> processed securely by Stripe; we do not store card details</li>
                <li><strong>Device data:</strong> browser type, language preference, and general location (country/state level)</li>
              </ul>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">2. How We Use Your Information</h2>
              <p>We use your information to:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Provide and improve the practice test experience</li>
                <li>Save your progress and test history</li>
                <li>Process Pro subscription payments</li>
                <li>Send important service updates (no marketing emails)</li>
              </ul>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">3. Data Storage</h2>
              <p>
                Your data is stored securely using Supabase (hosted on AWS). All data is encrypted
                in transit (TLS) and at rest. Our servers are located in the United States.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">4. Third-Party Services</h2>
              <p>We use the following third-party services:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li><strong>Supabase:</strong> authentication and database</li>
                <li><strong>Stripe:</strong> payment processing</li>
                <li><strong>Google:</strong> OAuth sign-in</li>
                <li><strong>Vercel:</strong> hosting and deployment</li>
              </ul>
              <p className="mt-2">
                Each service has its own privacy policy. We do not sell your data to any third parties.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">5. Cookies and Local Storage</h2>
              <p>
                We use browser local storage to save your language preference and session data.
                We do not use tracking cookies or third-party advertising cookies.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">6. Your Rights</h2>
              <p>You have the right to:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Access your personal data</li>
                <li>Request deletion of your account and data</li>
                <li>Export your test history</li>
                <li>Opt out of any communications</li>
              </ul>
              <p className="mt-2">
                To exercise these rights, contact us at{' '}
                <a href="mailto:support@dmvsos.com" className="text-[#2563EB] hover:underline">support@dmvsos.com</a>.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">7. Children&apos;s Privacy</h2>
              <p>
                DMVSOS is intended for users preparing for a driver&apos;s license, typically age 15.5 and older.
                We do not knowingly collect information from children under 13.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">8. Data Retention</h2>
              <p>
                We retain your data for as long as your account is active. If you delete your account,
                we will remove your personal data within 30 days, except where required by law.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">9. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify registered users
                of significant changes via email.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">10. Contact</h2>
              <p>
                For privacy-related questions, contact us at{' '}
                <a href="mailto:support@dmvsos.com" className="text-[#2563EB] hover:underline">support@dmvsos.com</a>.
              </p>
            </section>
          </div>
        </div>

        <button
          onClick={() => router.push('/')}
          className="mt-6 text-sm text-[#94A3B8] hover:text-[#2563EB] transition"
        >
          &larr; Back to Home
        </button>
      </div>
    </main>
  );
}
