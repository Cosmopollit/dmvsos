export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin', '/profile'],
      },
    ],
    sitemap: 'https://dmvsos.com/sitemap.xml',
  };
}
