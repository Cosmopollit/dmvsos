export const metadata = {
  title: 'About DMVSOS — Built by an immigrant, for immigrants',
  description:
    'DMVSOS is a one-person project by Evgenii, an immigrant who went through the US DMV process himself. Free DMV practice tests, 50 states, 5 languages, no subscription.',
  alternates: { canonical: 'https://dmvsos.com/about' },
  openGraph: {
    title: 'About DMVSOS',
    description:
      'Why dmvsos.com exists. Built by an immigrant for the immigrant community.',
    url: 'https://dmvsos.com/about',
    siteName: 'DMVSOS',
    type: 'website',
  },
};

export default function AboutLayout({ children }) {
  return children;
}
