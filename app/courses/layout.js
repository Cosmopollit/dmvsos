export const metadata = {
  title: 'Driving Courses | Traffic school, defensive driving, drivers ed | DMVSOS',
  description:
    'Online driving courses to dismiss a traffic ticket, lower your insurance, or get certified. Traffic school, defensive driving, and online drivers ed partners, coming soon to DMVSOS.',
  alternates: { canonical: 'https://dmvsos.com/courses' },
  openGraph: {
    title: 'Driving Courses | DMVSOS',
    description:
      'Online courses to dismiss a ticket, lower your insurance, or get certified. Coming soon to DMVSOS.',
    url: 'https://dmvsos.com/courses',
    siteName: 'DMVSOS',
    type: 'website',
  },
};

export default function CoursesLayout({ children }) {
  return children;
}
