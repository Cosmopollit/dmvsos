import Image from 'next/image';
import Link from 'next/link';

export default function Terms() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="flex items-center gap-2 mb-8">
          <Image src="/logo.png" alt="DMVSOS" width={36} height={36} className="rounded-xl" />
          <span className="text-xl font-bold text-[#0B1C3D]">
            DMV<span className="text-[#2563EB]">SOS</span>
          </span>
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-8">
          <h1 className="text-2xl font-bold text-[#0B1C3D] mb-6">Terms of Service</h1>
          <p className="text-xs text-[#94A3B8] mb-2 italic">This document is available in English only / Этот документ доступен только на английском языке</p>
          <p className="text-sm text-[#94A3B8] mb-6">Last updated: February 23, 2026</p>

          <div className="space-y-6 text-[#334155] text-[15px] leading-relaxed">
            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">1. Acceptance of Terms</h2>
              <p>
                By accessing or using DMVSOS (&quot;the Service&quot;), you agree to be bound by these Terms of Service.
                If you do not agree to these terms, please do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">2. Description of Service</h2>
              <p>
                DMVSOS provides DMV, CDL, and motorcycle practice tests for educational purposes.
                Our practice tests are designed to help you prepare for your state&apos;s official exam
                but are not a substitute for official study materials provided by your state&apos;s DMV.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">3. No Guarantee of Results</h2>
              <p>
                While we strive to provide accurate and up-to-date practice questions, we do not guarantee
                that using our Service will result in passing your official DMV exam. Test content and
                passing requirements vary by state and may change without notice.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">4. Accounts</h2>
              <p>
                You may create an account using Google Sign-In. You are responsible for maintaining
                the security of your account. You must not share your account credentials with others.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">5. Paid Plans</h2>
              <p>
                DMVSOS offers one-time paid plans (Quick Pass, Full Prep, Guaranteed Pass) starting from $7.99,
                processed through Stripe. Each plan provides 30–90 days of access from the date of purchase.
                No subscription or auto-renewal. The Guaranteed Pass plan includes a full refund if you fail your DMV test.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">6. Acceptable Use</h2>
              <p>You agree not to:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Copy, redistribute, or sell the practice test content</li>
                <li>Use automated tools to scrape or download questions</li>
                <li>Attempt to circumvent any access restrictions</li>
                <li>Use the Service for any unlawful purpose</li>
              </ul>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">7. Intellectual Property</h2>
              <p>
                All content on DMVSOS, including questions, explanations, design, and code, is the
                property of DMVSOS and protected by applicable copyright laws. You may not reproduce
                or distribute any content without written permission.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">8. Limitation of Liability</h2>
              <p>
                DMVSOS is provided &quot;as is&quot; without warranties of any kind. We are not liable for any
                damages arising from your use of the Service, including but not limited to failing
                your official DMV exam.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">9. Changes to Terms</h2>
              <p>
                We may update these Terms at any time. Continued use of the Service after changes
                constitutes acceptance of the new Terms.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-[#0B1C3D] mb-2">10. Contact</h2>
              <p>
                For questions about these Terms, contact us at{' '}
                <a href="mailto:support@dmvsos.com" className="text-[#2563EB] hover:underline">support@dmvsos.com</a>.
              </p>
            </section>
          </div>
        </div>

        <Link href="/" className="inline-block mt-6 text-sm text-[#94A3B8] hover:text-[#2563EB] transition">
          &larr; Back to Home
        </Link>
      </div>
    </main>
  );
}
