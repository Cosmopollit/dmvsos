import { Inter, DM_Sans, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { getHreflangAlternates } from "@/lib/hreflang";
import PersonalGreeting from "./components/PersonalGreeting";
import NastyaGreeting from "./NastyaGreeting";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata = {
  metadataBase: new URL('https://dmvsos.com'),
  title: 'Free DMV Practice Test | 50 States | 5 Languages | DMVSOS',
  description: 'Free DMV practice tests for all 50 states in 5 languages: English, Spanish, Russian, Ukrainian, Chinese. Sourced from official state Driver Handbooks.',
  keywords: 'DMV practice test, free DMV test 2026, DMV test in Spanish, DMV test in Russian, DMV test in Chinese, DMV test in Ukrainian, driving test, CDL practice test, motorcycle permit test',
  // Favicons handled by Next.js App Router conventions:
  //   app/favicon.ico   (16/32, browser tab)
  //   app/icon.png      (192x192 from logo.png, what Google search results use)
  //   app/apple-icon.png (180x180)
  // No explicit icons block - the file convention auto-injects correct <link rel> tags.
  openGraph: {
    title: 'Free DMV Practice Test | 50 States | 5 Languages | DMVSOS',
    description: 'Free DMV practice tests for all 50 states in 5 languages: English, Spanish, Russian, Ukrainian, Chinese. Sourced from official state Driver Handbooks.',
    url: 'https://dmvsos.com',
    siteName: 'DMVSOS',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'DMVSOS, free DMV practice tests in 5 languages' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free DMV Practice Test | 50 States | 5 Languages | DMVSOS',
    description: 'Free DMV practice tests for all 50 states in 5 languages: English, Spanish, Russian, Ukrainian, Chinese. Sourced from official state Driver Handbooks.',
    images: ['/og-image.png'],
  },
  alternates: getHreflangAlternates('/'),
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': 'https://dmvsos.com/#website',
      name: 'DMVSOS',
      url: 'https://dmvsos.com',
      description: 'Free DMV practice tests for all 50 US states in 5 languages. Built from official Driver Handbooks. No subscription.',
      inLanguage: ['en', 'es', 'ru', 'uk', 'zh'],
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://dmvsos.com/?state={state_name}',
        },
        'query-input': 'required name=state_name',
      },
    },
    {
      '@type': 'Organization',
      '@id': 'https://dmvsos.com/#organization',
      name: 'DMVSOS',
      url: 'https://dmvsos.com',
      logo: 'https://dmvsos.com/logo.png',
      description: 'DMV/DOL knowledge test preparation platform. Free practice tests, 50 states, 5 languages, official Driver Handbook sourced.',
      foundingDate: '2025',
      knowsLanguage: ['en', 'es', 'ru', 'uk', 'zh'],
      areaServed: {
        '@type': 'Country',
        name: 'United States',
      },
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'Customer Support',
        email: 'maindmvsos@gmail.com',
        availableLanguage: ['English', 'Spanish', 'Russian', 'Ukrainian', 'Chinese'],
      },
    },
    {
      '@type': 'WebApplication',
      '@id': 'https://dmvsos.com/#app',
      name: 'DMVSOS',
      url: 'https://dmvsos.com',
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Any (web)',
      browserRequirements: 'Modern web browser',
      offers: [
        {
          '@type': 'Offer',
          name: 'Free practice',
          price: '0',
          priceCurrency: 'USD',
          description: '20 free practice questions per state per language. No signup required.',
        },
        {
          '@type': 'Offer',
          name: 'Moto Pass',
          price: '19.99',
          priceCurrency: 'USD',
          description: '30 days unlimited motorcycle practice tests, all 50 states, all 5 languages.',
        },
        {
          '@type': 'Offer',
          name: 'Auto Pass',
          price: '29.99',
          priceCurrency: 'USD',
          description: '30 days unlimited car (DMV) practice tests, all 50 states, all 5 languages.',
        },
        {
          '@type': 'Offer',
          name: 'CDL Pro',
          price: '49.99',
          priceCurrency: 'USD',
          description: '30 days unlimited CDL (Commercial Driver License) practice tests, with the Car tests included.',
        },
      ],
      featureList: [
        'Practice tests for all 50 US states',
        '5 languages: English, Spanish, Russian, Ukrainian, Chinese',
        'Car, CDL, and Motorcycle license categories',
        'Questions sourced from official state Driver Handbooks',
        'Inline manual quote citations',
        'Free practice without signup',
        'One-time payment, no subscription',
        'Telegram-based customer support',
      ],
    },
    {
      '@type': 'EducationalOrganization',
      '@id': 'https://dmvsos.com/#school',
      name: 'DMVSOS',
      url: 'https://dmvsos.com',
      description: 'Online DMV test prep platform. Practice the actual DMV knowledge test format in your native language.',
    },
  ],
};

export default async function RootLayout({ children }) {
  const cookieStore = await cookies();
  const lang = cookieStore.get('dmvsos_lang')?.value || 'en';
  return (
    <html lang={lang}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${inter.variable} ${dmSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          {children}
          <PersonalGreeting />
          <NastyaGreeting />
        </AuthProvider>
        <Analytics />
        <SpeedInsights />
        {/*
          GA4. @next/third-parties/google injects gtag.js with
          strategy="afterInteractive" so it doesn't block LCP.
          Gated on production so dev sessions don't pollute the property.
          Preview deployments on Vercel also have NODE_ENV=production —
          if you want to exclude previews, switch to checking
          process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'.
        */}
        {process.env.NODE_ENV === 'production' && (
          <GoogleAnalytics gaId="G-JGE08M8VEW" />
        )}
      </body>
    </html>
  );
}
