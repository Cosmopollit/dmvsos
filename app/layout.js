import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: 'DMVSOS — Free DMV Practice Tests for All 50 States',
  description: 'Free DMV practice tests for all 50 US states. Car, CDL, and Motorcycle tests in English, Russian, Spanish, and Chinese. Pass your DMV test on the first try.',
  keywords: 'DMV practice test, driving test, DMV test 2026, free DMV test',
  icons: { icon: '/logo.png' },
  openGraph: {
    title: 'DMVSOS — Free DMV Practice Tests',
    description: 'Pass your DMV test on the first try. Free practice tests for all 50 states.',
    url: 'https://dmvsos.com',
    siteName: 'DMVSOS',
    type: 'website',
    images: [{ url: 'https://dmvsos.com/logo.png', width: 512, height: 512, alt: 'DMVSOS' }],
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

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
