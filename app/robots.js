export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin', '/profile'],
      },
    ],
    sitemap: 'https://www.dmvsos.com/sitemap.xml',
  };
}
