import { Inter, DM_Sans, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

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
  metadataBase: new URL('https://www.dmvsos.com'),
  title: 'DMVSOS — Pass Your DMV Test First Try',
  description: 'Free DMV practice tests for all 50 states in 5 languages. No signup required.',
  keywords: 'DMV practice test, driving test, DMV test 2026, free DMV test',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32', type: 'image/x-icon' },
      { url: '/logo.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
  openGraph: {
    title: 'DMVSOS — Pass Your DMV Test First Try',
    description: 'Free DMV practice tests for all 50 states in 5 languages. No signup required.',
    url: 'https://www.dmvsos.com',
    siteName: 'DMVSOS',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'DMVSOS — Free DMV Practice Tests' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DMVSOS — Pass Your DMV Test First Try',
    description: 'Free DMV practice tests for all 50 states in 5 languages. No signup required.',
    images: ['/og-image.png'],
  },
  alternates: {
    canonical: 'https://www.dmvsos.com',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      name: 'DMVSOS',
      url: 'https://www.dmvsos.com',
      description: 'Free DMV practice tests for all 50 US states in multiple languages.',
    },
    {
      '@type': 'Organization',
      name: 'DMVSOS',
      url: 'https://www.dmvsos.com',
      logo: 'https://www.dmvsos.com/logo.png',
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
        <AuthProvider>{children}</AuthProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
