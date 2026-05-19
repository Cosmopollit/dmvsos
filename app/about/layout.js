export const metadata = {
  title: 'About DMVSOS | Free DMV practice tests, 50 states, 5 languages',
  description:
    'DMVSOS is a one-person project by Evgenii. Free DMV practice tests built from official state Driver Handbooks. All 50 states, 5 languages, no subscription.',
  alternates: { canonical: 'https://dmvsos.com/about' },
  openGraph: {
    title: 'About DMVSOS',
    description:
      'Why dmvsos.com exists. Built around official state Driver Handbooks, in 5 languages.',
    url: 'https://dmvsos.com/about',
    siteName: 'DMVSOS',
    type: 'website',
  },
};

export default function AboutLayout({ children }) {
  return children;
}
