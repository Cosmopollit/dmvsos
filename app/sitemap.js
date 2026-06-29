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
  const baseUrl = 'https://dmvsos.com';
  const now = new Date().toISOString();

  const pages = [
    { url: baseUrl,                    lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${baseUrl}/dmv-test`,      lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${baseUrl}/manuals`,       lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    // /login and /upgrade intentionally excluded — they are noindex (auth/paywall
    // utility pages), so listing them in the sitemap would be a mixed signal.
    { url: `${baseUrl}/terms`,         lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${baseUrl}/privacy`,       lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${baseUrl}/about`,         lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/faq`,           lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/vs`,            lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
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

  // Localized DMV-test routes (ru/es/zh/ua) under a /[locale]/ path prefix.
  // These have genuinely localized, server-rendered bodies + hreflang, so each
  // language gets its own indexable URL. EN stays at the root above. The home
  // and /manuals tree get their own locale block further below.
  const dmvLocales = ['ru', 'es', 'zh', 'ua'];
  for (const locale of dmvLocales) {
    pages.push({
      url: `${baseUrl}/${locale}/dmv-test`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    });
    for (const st of states) {
      pages.push({
        url: `${baseUrl}/${locale}/dmv-test/${st}`,
        lastModified: now,
        changeFrequency: 'monthly',
        priority: 0.85,
      });
    }
  }

  // Manual hubs: state + category. The per-language leaf pages
  // (/manuals/{state}/{cat}/{lang}) are intentionally OMITTED: ~242 thin
  // PDF-link pages were ~half the sitemap, diluting crawl budget and sitting
  // as "Discovered - currently not indexed". The category page already lists
  // every language, so the leaves added URLs without unique value. They still
  // resolve for users; they just no longer compete for crawl budget.
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

  // Localized routes (ru/es/zh/ua) for the home + manuals tree — genuinely
  // localized server bodies + hreflang, each its own indexable URL. EN stays
  // at the root above. (PDF leaf /manuals/{state}/{cat}/{lang} stays omitted.)
  const manualLocales = ['ru', 'es', 'zh', 'ua'];
  for (const locale of manualLocales) {
    pages.push({ url: `${baseUrl}/${locale}`,         lastModified: now, changeFrequency: 'weekly',  priority: 1.0 });
    pages.push({ url: `${baseUrl}/${locale}/manuals`, lastModified: now, changeFrequency: 'weekly',  priority: 0.9 });
    for (const st of states) {
      pages.push({
        url: `${baseUrl}/${locale}/manuals/${st}`,
        lastModified: now,
        changeFrequency: 'monthly',
        priority: 0.8,
      });
      for (const cat of ['car', 'cdl', 'motorcycle']) {
        pages.push({
          url: `${baseUrl}/${locale}/manuals/${st}/${cat}`,
          lastModified: now,
          changeFrequency: 'monthly',
          priority: 0.75,
        });
      }
    }
  }

  return pages;
}
