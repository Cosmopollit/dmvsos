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

export default function sitemap() {
  const baseUrl = 'https://www.dmvsos.com';
  const now = new Date().toISOString();

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
    }
  }

  return pages;
}
