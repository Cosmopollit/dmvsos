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
  metadataBase: new URL('https://dmvsos.com'),
  title: 'DMVSOS — Free DMV Practice Tests for All 50 States',
  description: 'Free DMV practice tests for all 50 US states. Car, CDL, and Motorcycle tests in English, Russian, Spanish, and Chinese. Pass your DMV test on the first try.',
  keywords: 'DMV practice test, driving test, DMV test 2026, free DMV test',
  icons: {
    icon: '/logo.png',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'DMVSOS — Free DMV Practice Tests',
    description: 'Pass your DMV test on the first try. Free practice tests for all 50 states.',
    url: 'https://dmvsos.com',
    siteName: 'DMVSOS',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DMVSOS — Free DMV Practice Tests',
    description: 'Pass your DMV test on the first try.',
  },
  alternates: {
    canonical: 'https://dmvsos.com',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      name: 'DMVSOS',
      url: 'https://dmvsos.com',
      description: 'Free DMV practice tests for all 50 US states in multiple languages.',
    },
    {
      '@type': 'Organization',
      name: 'DMVSOS',
      url: 'https://dmvsos.com',
      logo: 'https://dmvsos.com/logo.png',
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
