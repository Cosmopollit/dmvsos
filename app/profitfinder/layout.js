export const metadata = {
  title: 'Profit Finder — калькулятор прибыли трака | DMVSOS',
  description:
    'Калькулятор прибыли для дальнобойщиков: ставка, пробег, топливо, deadhead, IFTA, толлы, фиксированные расходы. Считает чистую прибыль за неделю или месяц.',
  alternates: { canonical: 'https://dmvsos.com/profitfinder' },
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Profit Finder — калькулятор прибыли трака',
    description:
      'Считай прибыль по ставке, пробегу, топливу и фиксированным расходам. Режимы Неделя/Месяц, все мили / гружёные, чистая после налогов.',
    url: 'https://dmvsos.com/profitfinder',
    siteName: 'DMVSOS',
    type: 'website',
  },
};

export default function ProfitFinderLayout({ children }) {
  return children;
}
