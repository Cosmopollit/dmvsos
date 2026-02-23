export default function sitemap() {
  const states = [
    'alabama', 'alaska', 'arizona', 'arkansas', 'california',
    'colorado', 'connecticut', 'delaware', 'florida', 'georgia',
    'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas',
    'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts',
    'michigan', 'minnesota', 'mississippi', 'missouri', 'montana',
    'nebraska', 'nevada', 'new-hampshire', 'new-jersey', 'new-mexico',
    'new-york', 'north-carolina', 'north-dakota', 'ohio', 'oklahoma',
    'oregon', 'pennsylvania', 'rhode-island', 'south-carolina',
    'south-dakota', 'tennessee', 'texas', 'utah', 'vermont',
    'virginia', 'washington', 'west-virginia', 'wisconsin', 'wyoming'
  ];

  const categories = ['dmv', 'cdl', 'moto'];
  const baseUrl = 'https://dmvsos.com';

  const staticPages = [
    { url: baseUrl, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${baseUrl}/login`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/upgrade`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const categoryPages = states.map(state => ({
    url: `${baseUrl}/category?state=${state}`,
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  const testPages = states.flatMap(state =>
    categories.map(cat => ({
      url: `${baseUrl}/test?state=${state}&category=${cat}`,
      changeFrequency: 'monthly',
      priority: 0.7,
    }))
  );

  return [...staticPages, ...categoryPages, ...testPages].map(page => ({
    ...page,
    lastModified: new Date(),
  }));
}
