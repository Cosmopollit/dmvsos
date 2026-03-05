const states = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
  'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
  'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana',
  'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
  'missouri', 'montana', 'nebraska', 'nevada', 'new-hampshire', 'new-jersey',
  'new-mexico', 'new-york', 'north-carolina', 'north-dakota', 'ohio', 'oklahoma',
  'oregon', 'pennsylvania', 'rhode-island', 'south-carolina', 'south-dakota',
  'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
  'west-virginia', 'wisconsin', 'wyoming',
];

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const INDEX_URL = `${SUPABASE_URL}/storage/v1/object/public/manuals/manuals-index.json`;

async function fetchManualIndex() {
  try {
    const res = await fetch(INDEX_URL, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function sitemap() {
  const baseUrl = 'https://www.dmvsos.com';
  const now = new Date().toISOString();
  const index = await fetchManualIndex();

  const pages = [
    { url: baseUrl,                    lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${baseUrl}/upgrade`,       lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/dmv-test`,      lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${baseUrl}/manuals`,       lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${baseUrl}/login`,         lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/terms`,         lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${baseUrl}/privacy`,       lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
  ];

  // DMV test state landing pages — clean URLs, high SEO value
  for (const st of states) {
    pages.push({
      url: `${baseUrl}/dmv-test/${st}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    });
  }

  // Manual pages — state + category sub-pages
  for (const st of states) {
    pages.push({
      url: `${baseUrl}/manuals/${st}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    });
    for (const cat of ['car', 'cdl', 'motorcycle']) {
      pages.push({
        url: `${baseUrl}/manuals/${st}/${cat}`,
        lastModified: now,
        changeFrequency: 'monthly',
        priority: 0.75,
      });
      // Language sub-pages — only where PDFs actually exist
      const langs = index?.[st]?.[cat] ? Object.keys(index[st][cat]) : [];
      for (const lang of langs) {
        pages.push({
          url: `${baseUrl}/manuals/${st}/${cat}/${lang}`,
          lastModified: now,
          changeFrequency: 'monthly',
          priority: 0.7,
        });
      }
    }
  }

  return pages;
}
