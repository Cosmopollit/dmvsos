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

  const baseUrl = 'https://dmvsos.com';

  const staticPages = [
    { url: baseUrl, priority: 1.0 },
    { url: `${baseUrl}/category`, priority: 0.8 },
    { url: `${baseUrl}/upgrade`, priority: 0.9 },
  ];

  const statePages = states.map(state => ({
    url: `${baseUrl}/test?state=${state}&category=dmv`,
    priority: 0.7,
  }));

  return [...staticPages, ...statePages].map(page => ({
    url: page.url,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: page.priority,
  }));
}
