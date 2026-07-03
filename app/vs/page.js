import Link from 'next/link';
import { getServerLang } from '@/lib/lang-server';
import SiteHeader from '@/app/components/SiteHeader';
import GradientButton from '@/app/components/GradientButton';

export const metadata = {
  title: 'DMVSOS vs DriversEd, Aceable, Driving-Tests | 2026 Comparison',
  description:
    'Honest comparison of DMV practice test platforms. Pricing, languages, states covered, free tier, refund policy. DMVSOS vs DriversEd vs Aceable vs Driving-Tests.org.',
  alternates: { canonical: 'https://dmvsos.com/vs' },
  openGraph: {
    title: 'DMVSOS vs DriversEd, Aceable, Driving-Tests',
    description: 'How DMVSOS compares to other DMV practice test sites. Pricing, free tier, language support, refund policy.',
    url: 'https://dmvsos.com/vs',
    siteName: 'DMVSOS',
    type: 'website',
  },
};

// Comparison rows localized per language. Feature labels and English cell text
// are translated; brand/competitor names, prices, numbers and section codes
// (General Knowledge, Air Brakes, etc.) stay as-is.
const COMPARISON_I18N = {
  en: [
    {
      feature: 'Free tier',
      dmvsos: '20 questions per state, no signup',
      driversed: 'Limited preview only',
      aceable: '5 sample questions',
      drivingtests: 'Yes (ads, full free)',
    },
    {
      feature: 'Pricing model',
      dmvsos: 'One-time $19.99–$49.99 / 30 days',
      driversed: 'Subscription $20–$30 / month',
      aceable: 'One-time $30–$100',
      drivingtests: 'Free (ad-supported)',
    },
    {
      feature: 'Subscription auto-renew',
      dmvsos: 'No, never',
      driversed: 'Yes',
      aceable: 'No',
      drivingtests: 'N/A',
    },
    {
      feature: 'States covered',
      dmvsos: 'All 50 + DC',
      driversed: 'All 50',
      aceable: 'Only states with regulatory approval (~10)',
      drivingtests: 'All 50',
    },
    {
      feature: 'Languages',
      dmvsos: 'English, Spanish, Russian, Ukrainian, Chinese',
      driversed: 'English, Spanish',
      aceable: 'English only',
      drivingtests: 'English, Spanish',
    },
    {
      feature: 'Official driver handbook PDF',
      dmvsos: 'All 50 states, up to 27 languages, free download',
      driversed: 'Links to state DMV websites',
      aceable: 'No',
      drivingtests: 'Links to state DMV websites',
    },
    {
      feature: 'CDL practice',
      dmvsos: 'Yes: General Knowledge, Air Brakes, Combination',
      driversed: 'Yes',
      aceable: 'No',
      drivingtests: 'Yes',
    },
    {
      feature: 'Motorcycle practice',
      dmvsos: 'Yes',
      driversed: 'Yes',
      aceable: 'No',
      drivingtests: 'Yes',
    },
    {
      feature: 'Refund policy',
      dmvsos: 'All sales final',
      driversed: '72h with conditions',
      aceable: 'Varies by state',
      drivingtests: 'N/A',
    },
    {
      feature: 'Question source citation',
      dmvsos: 'Yes: official handbook section under each question',
      driversed: 'No',
      aceable: 'No',
      drivingtests: 'No',
    },
    {
      feature: 'Support',
      dmvsos: 'Direct Telegram + email (founder replies in <4h)',
      driversed: 'Email + call center',
      aceable: 'Email + phone',
      drivingtests: 'Email',
    },
    {
      feature: 'CDL Pro includes Car tests',
      dmvsos: 'Yes, one pass covers both',
      driversed: 'No',
      aceable: 'No',
      drivingtests: 'No',
    },
  ],
  ru: [
    {
      feature: 'Бесплатный доступ',
      dmvsos: '20 вопросов на штат, без регистрации',
      driversed: 'Только ограниченный просмотр',
      aceable: '5 примеров вопросов',
      drivingtests: 'Да (с рекламой, полностью бесплатно)',
    },
    {
      feature: 'Модель оплаты',
      dmvsos: 'Разово $19.99–$49.99 / 30 дней',
      driversed: 'Подписка $20–$30 / месяц',
      aceable: 'Разово $30–$100',
      drivingtests: 'Бесплатно (за счёт рекламы)',
    },
    {
      feature: 'Автопродление подписки',
      dmvsos: 'Нет, никогда',
      driversed: 'Да',
      aceable: 'Нет',
      drivingtests: 'Нет',
    },
    {
      feature: 'Охват штатов',
      dmvsos: 'Все 50 + DC',
      driversed: 'Все 50',
      aceable: 'Только штаты с разрешением регулятора (~10)',
      drivingtests: 'Все 50',
    },
    {
      feature: 'Языки',
      dmvsos: 'Английский, испанский, русский, украинский, китайский',
      driversed: 'Английский, испанский',
      aceable: 'Только английский',
      drivingtests: 'Английский, испанский',
    },
    {
      feature: 'Официальное руководство водителя (PDF)',
      dmvsos: 'Все 50 штатов, до 27 языков, бесплатная загрузка',
      driversed: 'Ссылки на сайты DMV штатов',
      aceable: 'Нет',
      drivingtests: 'Ссылки на сайты DMV штатов',
    },
    {
      feature: 'Практика CDL',
      dmvsos: 'Да: General Knowledge, Air Brakes, Combination',
      driversed: 'Да',
      aceable: 'Нет',
      drivingtests: 'Да',
    },
    {
      feature: 'Практика на мотоцикл',
      dmvsos: 'Да',
      driversed: 'Да',
      aceable: 'Нет',
      drivingtests: 'Да',
    },
    {
      feature: 'Политика возврата',
      dmvsos: 'Все продажи окончательны',
      driversed: '72 часа с условиями',
      aceable: 'Зависит от штата',
      drivingtests: 'Нет',
    },
    {
      feature: 'Указание источника вопроса',
      dmvsos: 'Да: раздел официального руководства под каждым вопросом',
      driversed: 'Нет',
      aceable: 'Нет',
      drivingtests: 'Нет',
    },
    {
      feature: 'Поддержка',
      dmvsos: 'Прямой Telegram + email (основатель отвечает за <4 ч)',
      driversed: 'Email + колл-центр',
      aceable: 'Email + телефон',
      drivingtests: 'Email',
    },
    {
      feature: 'CDL Pro включает тесты на легковой автомобиль',
      dmvsos: 'Да, один доступ покрывает оба',
      driversed: 'Нет',
      aceable: 'Нет',
      drivingtests: 'Нет',
    },
  ],
  es: [
    {
      feature: 'Acceso gratuito',
      dmvsos: '20 preguntas por estado, sin registro',
      driversed: 'Solo vista previa limitada',
      aceable: '5 preguntas de muestra',
      drivingtests: 'Sí (con anuncios, totalmente gratis)',
    },
    {
      feature: 'Modelo de precios',
      dmvsos: 'Pago único $19.99–$49.99 / 30 días',
      driversed: 'Suscripción $20–$30 / mes',
      aceable: 'Pago único $30–$100',
      drivingtests: 'Gratis (con anuncios)',
    },
    {
      feature: 'Renovación automática de suscripción',
      dmvsos: 'No, nunca',
      driversed: 'Sí',
      aceable: 'No',
      drivingtests: 'No aplica',
    },
    {
      feature: 'Estados cubiertos',
      dmvsos: 'Los 50 + DC',
      driversed: 'Los 50',
      aceable: 'Solo estados con aprobación regulatoria (~10)',
      drivingtests: 'Los 50',
    },
    {
      feature: 'Idiomas',
      dmvsos: 'Inglés, español, ruso, ucraniano, chino',
      driversed: 'Inglés, español',
      aceable: 'Solo inglés',
      drivingtests: 'Inglés, español',
    },
    {
      feature: 'Manual oficial del conductor (PDF)',
      dmvsos: 'Los 50 estados, hasta 27 idiomas, descarga gratuita',
      driversed: 'Enlaces a los sitios del DMV de cada estado',
      aceable: 'No',
      drivingtests: 'Enlaces a los sitios del DMV de cada estado',
    },
    {
      feature: 'Práctica de CDL',
      dmvsos: 'Sí: General Knowledge, Air Brakes, Combination',
      driversed: 'Sí',
      aceable: 'No',
      drivingtests: 'Sí',
    },
    {
      feature: 'Práctica de motocicleta',
      dmvsos: 'Sí',
      driversed: 'Sí',
      aceable: 'No',
      drivingtests: 'Sí',
    },
    {
      feature: 'Política de reembolso',
      dmvsos: 'Todas las ventas son finales',
      driversed: '72 h con condiciones',
      aceable: 'Varía según el estado',
      drivingtests: 'No aplica',
    },
    {
      feature: 'Cita de la fuente de la pregunta',
      dmvsos: 'Sí: sección del manual oficial bajo cada pregunta',
      driversed: 'No',
      aceable: 'No',
      drivingtests: 'No',
    },
    {
      feature: 'Soporte',
      dmvsos: 'Telegram directo + email (el fundador responde en <4 h)',
      driversed: 'Email + centro de llamadas',
      aceable: 'Email + teléfono',
      drivingtests: 'Email',
    },
    {
      feature: 'CDL Pro incluye exámenes de Car',
      dmvsos: 'Sí, un solo pase cubre ambos',
      driversed: 'No',
      aceable: 'No',
      drivingtests: 'No',
    },
  ],
  zh: [
    {
      feature: '免费额度',
      dmvsos: '每州 20 道题，无需注册',
      driversed: '仅限有限预览',
      aceable: '5 道示例题',
      drivingtests: '是（含广告，完全免费）',
    },
    {
      feature: '收费模式',
      dmvsos: '一次性 $19.99–$49.99 / 30 天',
      driversed: '订阅 $20–$30 / 月',
      aceable: '一次性 $30–$100',
      drivingtests: '免费（广告支持）',
    },
    {
      feature: '订阅自动续费',
      dmvsos: '不，从不',
      driversed: '是',
      aceable: '否',
      drivingtests: '不适用',
    },
    {
      feature: '覆盖的州',
      dmvsos: '全部 50 个 + DC',
      driversed: '全部 50 个',
      aceable: '仅限获监管批准的州（约 10 个）',
      drivingtests: '全部 50 个',
    },
    {
      feature: '语言',
      dmvsos: '英语、西班牙语、俄语、乌克兰语、中文',
      driversed: '英语、西班牙语',
      aceable: '仅英语',
      drivingtests: '英语、西班牙语',
    },
    {
      feature: '官方驾驶手册 PDF',
      dmvsos: '全部 50 个州，多达 27 种语言，免费下载',
      driversed: '链接到各州 DMV 网站',
      aceable: '否',
      drivingtests: '链接到各州 DMV 网站',
    },
    {
      feature: 'CDL 练习',
      dmvsos: '是：General Knowledge、Air Brakes、Combination',
      driversed: '是',
      aceable: '否',
      drivingtests: '是',
    },
    {
      feature: '摩托车练习',
      dmvsos: '是',
      driversed: '是',
      aceable: '否',
      drivingtests: '是',
    },
    {
      feature: '退款政策',
      dmvsos: '所有销售均为最终交易',
      driversed: '72 小时内有条件退款',
      aceable: '因州而异',
      drivingtests: '不适用',
    },
    {
      feature: '题目来源标注',
      dmvsos: '是：每道题下方标注官方手册章节',
      driversed: '否',
      aceable: '否',
      drivingtests: '否',
    },
    {
      feature: '客服支持',
      dmvsos: '直接 Telegram + 邮件（创始人 <4 小时回复）',
      driversed: '邮件 + 呼叫中心',
      aceable: '邮件 + 电话',
      drivingtests: '邮件',
    },
    {
      feature: 'CDL Pro 包含 Car 考试',
      dmvsos: '是，一个通行证两者都涵盖',
      driversed: '否',
      aceable: '否',
      drivingtests: '否',
    },
  ],
  ua: [
    {
      feature: 'Безкоштовний доступ',
      dmvsos: '20 запитань на штат, без реєстрації',
      driversed: 'Лише обмежений перегляд',
      aceable: '5 прикладів запитань',
      drivingtests: 'Так (з рекламою, повністю безкоштовно)',
    },
    {
      feature: 'Модель оплати',
      dmvsos: 'Разово $19.99–$49.99 / 30 днів',
      driversed: 'Підписка $20–$30 / місяць',
      aceable: 'Разово $30–$100',
      drivingtests: 'Безкоштовно (за рахунок реклами)',
    },
    {
      feature: 'Автопродовження підписки',
      dmvsos: 'Ні, ніколи',
      driversed: 'Так',
      aceable: 'Ні',
      drivingtests: 'Немає',
    },
    {
      feature: 'Охоплення штатів',
      dmvsos: 'Усі 50 + DC',
      driversed: 'Усі 50',
      aceable: 'Лише штати з дозволом регулятора (~10)',
      drivingtests: 'Усі 50',
    },
    {
      feature: 'Мови',
      dmvsos: 'Англійська, іспанська, російська, українська, китайська',
      driversed: 'Англійська, іспанська',
      aceable: 'Лише англійська',
      drivingtests: 'Англійська, іспанська',
    },
    {
      feature: 'Офіційний посібник водія (PDF)',
      dmvsos: 'Усі 50 штатів, до 27 мов, безкоштовне завантаження',
      driversed: 'Посилання на сайти DMV штатів',
      aceable: 'Ні',
      drivingtests: 'Посилання на сайти DMV штатів',
    },
    {
      feature: 'Практика CDL',
      dmvsos: 'Так: General Knowledge, Air Brakes, Combination',
      driversed: 'Так',
      aceable: 'Ні',
      drivingtests: 'Так',
    },
    {
      feature: 'Практика на мотоцикл',
      dmvsos: 'Так',
      driversed: 'Так',
      aceable: 'Ні',
      drivingtests: 'Так',
    },
    {
      feature: 'Політика повернення',
      dmvsos: 'Усі продажі остаточні',
      driversed: '72 години з умовами',
      aceable: 'Залежить від штату',
      drivingtests: 'Немає',
    },
    {
      feature: 'Зазначення джерела запитання',
      dmvsos: 'Так: розділ офіційного посібника під кожним запитанням',
      driversed: 'Ні',
      aceable: 'Ні',
      drivingtests: 'Ні',
    },
    {
      feature: 'Підтримка',
      dmvsos: 'Прямий Telegram + email (засновник відповідає за <4 год)',
      driversed: 'Email + колл-центр',
      aceable: 'Email + телефон',
      drivingtests: 'Email',
    },
    {
      feature: 'CDL Pro містить тести на легковий автомобіль',
      dmvsos: 'Так, один доступ покриває обидва',
      driversed: 'Ні',
      aceable: 'Ні',
      drivingtests: 'Ні',
    },
  ],
};

// Visible page chrome localized per language. Brand/competitor names, prices,
// numbers and "2026" stay as-is. The JSON-LD schema below stays English (a
// cookieless crawler resolves the visible page to `en`, matching this schema).
const VS_I18N = {
  en: {
    h1: 'DMVSOS vs DriversEd, Aceable, Driving-Tests',
    intro:
      'Honest feature comparison of the four most popular DMV practice test platforms in 2026. We left some boxes blank for competitors when we genuinely don’t know, and called out where they win.',
    featureHeader: 'Feature',
    pickTitle: 'Which one should you pick?',
    pickDmvsosName: 'DMVSOS',
    pickDmvsosRest:
      ' if you want practice in a non-English language, hate subscriptions, or need official handbook downloads in one place.',
    pickDrivingTestsName: 'Driving-Tests.org',
    pickDrivingTestsRest:
      ' if budget is zero and you don’t mind ads. Solid free tier in English & Spanish.',
    pickAceableName: 'Aceable',
    pickAceableRest:
      ' if you need a state-approved teen driver ed course (different product: they’re mainly drivers ed, not just DMV prep).',
    pickDriversedName: 'DriversEd.com',
    pickDriversedRest:
      ' if you want a polished subscription with call-center support and don’t mind paying monthly.',
    ctaTitle: 'Try DMVSOS free, no signup',
    ctaText:
      'Pick your state, start practicing in your language, see if the questions match the actual DMV format. Decide later if you want a pass.',
    ctaStart: 'Start free practice test',
    ctaManuals: 'Browse manuals',
    ctaFaq: 'FAQ',
    disclaimer:
      'Comparison data current as of 2026. Pricing and features change over time, and we keep this table updated. We claim no affiliation with DriversEd.com, Aceable, or Driving-Tests.org.',
  },
  ru: {
    h1: 'DMVSOS против DriversEd, Aceable, Driving-Tests',
    intro:
      'Честное сравнение функций четырёх самых популярных платформ практических тестов DMV в 2026 году. Часть ячеек у конкурентов мы оставили пустыми, когда правда не знаем, и отметили, в чём они выигрывают.',
    featureHeader: 'Функция',
    pickTitle: 'Что выбрать именно вам?',
    pickDmvsosName: 'DMVSOS',
    pickDmvsosRest:
      ', если хотите тренироваться не на английском, не любите подписки или хотите скачать официальные руководства в одном месте.',
    pickDrivingTestsName: 'Driving-Tests.org',
    pickDrivingTestsRest:
      ', если бюджет нулевой и вы не против рекламы. Хороший бесплатный уровень на английском и испанском.',
    pickAceableName: 'Aceable',
    pickAceableRest:
      ', если нужен одобренный штатом курс вождения для подростков (другой продукт: это в первую очередь курсы вождения, а не только подготовка к DMV).',
    pickDriversedName: 'DriversEd.com',
    pickDriversedRest:
      ', если хотите аккуратную подписку с поддержкой колл-центра и не против платить ежемесячно.',
    ctaTitle: 'Попробуйте DMVSOS бесплатно, без регистрации',
    ctaText:
      'Выберите штат, начните тренироваться на своём языке, посмотрите, совпадают ли вопросы с реальным форматом DMV. Решите позже, нужен ли вам доступ.',
    ctaStart: 'Начать бесплатный тест',
    ctaManuals: 'Открыть руководства',
    ctaFaq: 'Частые вопросы',
    disclaimer:
      'Данные сравнения актуальны на 2026 год. Цены и функции со временем меняются, и мы поддерживаем эту таблицу в актуальном состоянии. Мы не заявляем о какой-либо связи с DriversEd.com, Aceable или Driving-Tests.org.',
  },
  es: {
    h1: 'DMVSOS frente a DriversEd, Aceable, Driving-Tests',
    intro:
      'Comparación honesta de funciones de las cuatro plataformas de exámenes de práctica del DMV más populares en 2026. Dejamos algunas casillas en blanco para los competidores cuando de verdad no lo sabemos, y señalamos en qué ganan.',
    featureHeader: 'Función',
    pickTitle: '¿Cuál deberías elegir?',
    pickDmvsosName: 'DMVSOS',
    pickDmvsosRest:
      ' si quieres practicar en un idioma que no sea inglés, no soportas las suscripciones o necesitas descargar los manuales oficiales en un solo lugar.',
    pickDrivingTestsName: 'Driving-Tests.org',
    pickDrivingTestsRest:
      ' si tu presupuesto es cero y no te molestan los anuncios. Buen nivel gratuito en inglés y español.',
    pickAceableName: 'Aceable',
    pickAceableRest:
      ' si necesitas un curso de manejo para adolescentes aprobado por el estado (es otro producto: son principalmente cursos de manejo, no solo preparación para el DMV).',
    pickDriversedName: 'DriversEd.com',
    pickDriversedRest:
      ' si quieres una suscripción pulida con soporte de centro de llamadas y no te importa pagar mensualmente.',
    ctaTitle: 'Prueba DMVSOS gratis, sin registro',
    ctaText:
      'Elige tu estado, empieza a practicar en tu idioma y comprueba si las preguntas coinciden con el formato real del DMV. Decide más tarde si quieres un pase.',
    ctaStart: 'Comenzar examen de práctica gratis',
    ctaManuals: 'Ver manuales',
    ctaFaq: 'Preguntas frecuentes',
    disclaimer:
      'Datos de comparación vigentes a 2026. Los precios y las funciones cambian con el tiempo, y mantenemos esta tabla actualizada. No afirmamos tener ninguna afiliación con DriversEd.com, Aceable ni Driving-Tests.org.',
  },
  zh: {
    h1: 'DMVSOS 对比 DriversEd、Aceable、Driving-Tests',
    intro:
      '对 2026 年最受欢迎的四个 DMV 模拟考试平台做诚实的功能对比。在我们确实不清楚时，某些竞品的格子留空，并指出他们在哪些方面更胜一筹。',
    featureHeader: '功能',
    pickTitle: '你该选哪一个？',
    pickDmvsosName: 'DMVSOS',
    pickDmvsosRest:
      '：如果你想用非英语练习、讨厌订阅，或想在一个地方下载官方手册。',
    pickDrivingTestsName: 'Driving-Tests.org',
    pickDrivingTestsRest:
      '：如果预算为零且不介意广告。英语和西班牙语的免费版本扎实。',
    pickAceableName: 'Aceable',
    pickAceableRest:
      '：如果你需要经各州批准的青少年驾驶教育课程（这是另一种产品：他们主要是驾驶教育，而不仅仅是 DMV 备考）。',
    pickDriversedName: 'DriversEd.com',
    pickDriversedRest:
      '：如果你想要带呼叫中心支持的精致订阅，且不介意按月付费。',
    ctaTitle: '免费试用 DMVSOS，无需注册',
    ctaText:
      '选择你所在的州，用你的语言开始练习，看看题目是否符合真实的 DMV 格式。是否购买通行证可以稍后再决定。',
    ctaStart: '开始免费模拟考试',
    ctaManuals: '浏览手册',
    ctaFaq: '常见问题',
    disclaimer:
      '对比数据截至 2026 年。价格和功能会随时间变化，我们会持续更新此表。我们声明与 DriversEd.com、Aceable 或 Driving-Tests.org 没有任何关联。',
  },
  ua: {
    h1: 'DMVSOS проти DriversEd, Aceable, Driving-Tests',
    intro:
      'Чесне порівняння функцій чотирьох найпопулярніших платформ практичних тестів DMV у 2026 році. Частину клітинок у конкурентів ми залишили порожніми, коли справді не знаємо, і зазначили, у чому вони виграють.',
    featureHeader: 'Функція',
    pickTitle: 'Що обрати саме вам?',
    pickDmvsosName: 'DMVSOS',
    pickDmvsosRest:
      ', якщо хочете тренуватися не англійською, не любите підписки або хочете завантажити офіційні посібники в одному місці.',
    pickDrivingTestsName: 'Driving-Tests.org',
    pickDrivingTestsRest:
      ', якщо бюджет нульовий і ви не проти реклами. Добрий безкоштовний рівень англійською та іспанською.',
    pickAceableName: 'Aceable',
    pickAceableRest:
      ', якщо потрібен схвалений штатом курс водіння для підлітків (інший продукт: це насамперед курси водіння, а не лише підготовка до DMV).',
    pickDriversedName: 'DriversEd.com',
    pickDriversedRest:
      ', якщо хочете акуратну підписку з підтримкою колл-центру і не проти платити щомісяця.',
    ctaTitle: 'Спробуйте DMVSOS безкоштовно, без реєстрації',
    ctaText:
      'Оберіть штат, почніть тренуватися своєю мовою, подивіться, чи збігаються запитання зі справжнім форматом DMV. Рішення про доступ ухвалите пізніше.',
    ctaStart: 'Почати безкоштовний тест',
    ctaManuals: 'Відкрити посібники',
    ctaFaq: 'Часті запитання',
    disclaimer:
      'Дані порівняння актуальні на 2026 рік. Ціни та функції з часом змінюються, і ми підтримуємо цю таблицю в актуальному стані. Ми не заявляємо про жодний зв’язок із DriversEd.com, Aceable чи Driving-Tests.org.',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'DMVSOS vs DriversEd, Aceable, Driving-Tests.org | Comparison',
  description: 'Feature-by-feature comparison of leading DMV practice test platforms.',
  url: 'https://dmvsos.com/vs',
  publisher: { '@type': 'Organization', name: 'DMVSOS', url: 'https://dmvsos.com' },
  mainEntity: {
    '@type': 'Table',
    about: 'DMV practice test platform comparison',
  },
};

export default async function VsPage() {
  const lang = await getServerLang();
  const tx = VS_I18N[lang] || VS_I18N.en;
  const rows = COMPARISON_I18N[lang] || COMPARISON_I18N.en;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <SiteHeader initialLang={lang} />

      <main className="w-full max-w-4xl mx-auto px-4 pt-4 pb-10 flex-1">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[#0B1C3D] mb-2">
            {tx.h1}
          </h1>
          <p className="text-[#64748B] text-sm">
            {tx.intro}
          </p>
        </header>

        <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-[#0B1C3D] sticky left-0 bg-[#F8FAFC]">{tx.featureHeader}</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#2563EB]">DMVSOS</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#64748B]">DriversEd.com</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#64748B]">Aceable</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#64748B]">Driving-Tests.org</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.feature} className={i % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFC]'}>
                    <td className="px-4 py-3 font-medium text-[#0B1C3D] sticky left-0 bg-inherit">{row.feature}</td>
                    <td className="px-4 py-3 text-[#1E40AF] font-medium">{row.dmvsos}</td>
                    <td className="px-4 py-3 text-[#475569]">{row.driversed}</td>
                    <td className="px-4 py-3 text-[#475569]">{row.aceable}</td>
                    <td className="px-4 py-3 text-[#475569]">{row.drivingtests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <section className="mt-8 bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-6">
          <h2 className="text-xl font-bold text-[#0B1C3D] mb-3">{tx.pickTitle}</h2>
          <ul className="space-y-3 text-sm text-[#1E293B] leading-relaxed">
            <li>
              <strong className="text-[#2563EB]">{tx.pickDmvsosName}</strong>{tx.pickDmvsosRest}
            </li>
            <li>
              <strong>{tx.pickDrivingTestsName}</strong>{tx.pickDrivingTestsRest}
            </li>
            <li>
              <strong>{tx.pickAceableName}</strong>{tx.pickAceableRest}
            </li>
            <li>
              <strong>{tx.pickDriversedName}</strong>{tx.pickDriversedRest}
            </li>
          </ul>
        </section>

        <section className="mt-6 bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-6">
          <h2 className="text-xl font-bold text-[#0B1C3D] mb-3">{tx.ctaTitle}</h2>
          <p className="text-sm text-[#475569] mb-4">
            {tx.ctaText}
          </p>
          <GradientButton href="/" variant="blue" className="mb-3">
            {tx.ctaStart}
          </GradientButton>
          <div className="flex flex-wrap gap-3">
            <Link href="/manuals" className="inline-flex items-center gap-2 bg-white border border-[#E2E8F0] text-[#1E293B] px-5 py-3 rounded-xl font-semibold text-sm hover:border-[#2563EB] hover:text-[#2563EB] transition">
              {tx.ctaManuals}
            </Link>
            <Link href="/faq" className="inline-flex items-center gap-2 bg-white border border-[#E2E8F0] text-[#1E293B] px-5 py-3 rounded-xl font-semibold text-sm hover:border-[#2563EB] hover:text-[#2563EB] transition">
              {tx.ctaFaq}
            </Link>
          </div>
        </section>

        <p className="mt-8 text-xs text-[#94A3B8] text-center leading-relaxed">
          {tx.disclaimer}
        </p>
      </main>
    </div>
  );
}
