'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { getSavedLang } from '@/lib/lang';

// English Q&A, also the source for the FAQPage JSON-LD schema (kept English on purpose:
// a cookieless crawler resolves the visible FAQ to `en`, matching this schema).
const QA = [
  {
    q: 'Is DMVSOS really free to start?',
    a: 'Yes. You can practice 20 questions per state, per language, per category without signing up. No credit card, no email required to start. If you want unlimited practice, paid passes are one-time payments (no subscription): Moto $19.99, Auto $29.99, CDL Pro $49.99. Each gives 30 days of unlimited access.',
  },
  {
    q: 'Are these the actual DMV test questions?',
    a: 'Yes. You practice the real DMV test questions for your state, the same ones you\'ll see on test day.',
  },
  {
    q: 'Which US states do you cover?',
    a: 'All 50 US states plus Washington DC. Every state has its own question bank built from that state\'s current Driver Handbook. We update when the handbook updates.',
  },
  {
    q: 'Which languages are supported?',
    a: 'English, Spanish (Español), Russian (Русский), Ukrainian (Українська), and Chinese (中文). Every question, every answer option, and every explanation is translated into all 5 languages. You can switch language mid-test from the top-right corner.',
  },
  {
    q: 'Do you offer the Commercial Driver License (CDL) test?',
    a: 'Yes. CDL Pro pass includes General Knowledge, Air Brakes, and Combination Vehicles sections, and the Car tests are included too. Specific endorsements (Hazmat, Tanker, Passenger, School Bus) are coming.',
  },
  {
    q: 'Is there a subscription?',
    a: 'No. Passes are one-time payments for 30 days of access. After 30 days the pass simply expires. No automatic renewal, no recurring charges. If you need more time you can extend for $9.99 for another 30 days.',
  },
  {
    q: 'What is the refund policy?',
    a: 'Passes are one-time purchases, so they are final. If something is wrong, message us on Telegram and we will make it right.',
  },
  {
    q: 'Do I need to create an account?',
    a: 'Only if you want to save progress across devices or upgrade to a paid pass. Practice tests work without signup. Account is via Google or magic-link email (no password).',
  },
  {
    q: 'Can I download the official Driver Handbook?',
    a: 'Yes, for free. We mirror the official PDF for every US state at /manuals. For ~22 states we also have translated versions in multiple languages. The PDF is the same one published by the state DMV.',
  },
  {
    q: 'How do you compare to DriversEd, Aceable, or Driving-Tests.org?',
    a: 'Three differences. (1) We support 5 languages including Russian and Ukrainian, while most competitors are English-only. (2) We charge one-time, not monthly. (3) Fast, direct support: reach us on Telegram or email and we reply within 4 hours.',
  },
  {
    q: 'How can I report a wrong answer or bad translation?',
    a: 'Every question has a small 🐛 Report button under the explanation. Tap it, pick a reason (wrong answer, bad translation, unclear, etc.), optionally add a comment. The report goes straight to our team on Telegram and we fix it the same day or the next.',
  },
  {
    q: 'Is my payment information secure?',
    a: 'Yes. We never see or store your full card details, payments are encrypted and processed by a certified payment provider. We only see the last 4 digits for support purposes.',
  },
  {
    q: 'How often are questions updated?',
    a: 'We update when state Driver Handbooks change (typically once a year per state). New states\' handbooks added when official versions go live. Bug reports from users are reviewed daily and fixed immediately if confirmed.',
  },
  {
    q: 'Can I take the test on my phone?',
    a: 'Yes. dmvsos.com is mobile-first design. Most users practice on their phone. iOS and Android work in any browser.',
  },
];

// Visible, localized FAQ content keyed by language. Facts (prices, "30 days",
// "no subscription", state count, "no signup") are identical across languages.
// The JSON-LD schema above stays English by design.
const FAQ_I18N = {
  en: {
    title: 'Frequently asked questions',
    subtitle: 'About DMVSOS practice tests, pricing, refunds, and how we compare to other sites.',
    qa: QA,
  },
  ru: {
    title: 'Частые вопросы',
    subtitle: 'О практических тестах DMVSOS, ценах, возвратах и о том, чем мы отличаемся от других сайтов.',
    qa: [
      {
        q: 'DMVSOS правда можно начать бесплатно?',
        a: 'Да. Можно пройти 20 вопросов на каждый штат, на каждый язык и на каждую категорию без регистрации. Без карты, без email, чтобы начать. Если нужна безлимитная практика, платные доступы оплачиваются один раз (без подписки): Moto $19.99, Auto $29.99, CDL Pro $49.99. Каждый даёт 30 дней безлимитного доступа.',
      },
      {
        q: 'Это настоящие вопросы экзамена DMV?',
        a: 'Да. Вы тренируетесь на реальных вопросах экзамена DMV для вашего штата, тех же, что увидите в день сдачи.',
      },
      {
        q: 'Какие штаты США вы охватываете?',
        a: 'Все 50 штатов США плюс Washington DC. У каждого штата своя база вопросов, собранная по действующему Driver Handbook этого штата. Мы обновляем её, когда обновляется руководство.',
      },
      {
        q: 'Какие языки поддерживаются?',
        a: 'Английский, испанский (Español), русский (Русский), украинский (Українська) и китайский (中文). Каждый вопрос, каждый вариант ответа и каждое пояснение переведены на все 5 языков. Язык можно переключить прямо во время теста в правом верхнем углу.',
      },
      {
        q: 'Есть ли тест на коммерческие права (CDL)?',
        a: 'Да. Доступ CDL Pro включает разделы General Knowledge, Air Brakes и Combination Vehicles, а также тесты на легковой автомобиль. Отдельные допуски (Hazmat, Tanker, Passenger, School Bus) скоро появятся.',
      },
      {
        q: 'Есть ли подписка?',
        a: 'Нет. Доступ оплачивается один раз и действует 30 дней. Через 30 дней он просто истекает. Никакого автопродления, никаких повторных списаний. Если нужно больше времени, можно продлить за $9.99 ещё на 30 дней.',
      },
      {
        q: 'Какая политика возврата?',
        a: 'Доступы покупаются единоразово, поэтому возврату не подлежат. Если что-то пошло не так, напишите нам в Telegram, и мы всё решим.',
      },
      {
        q: 'Нужно ли создавать аккаунт?',
        a: 'Только если хотите сохранять прогресс между устройствами или оформить платный доступ. Практические тесты работают без регистрации. Аккаунт создаётся через Google или по ссылке на email (без пароля).',
      },
      {
        q: 'Можно ли скачать официальное Driver Handbook?',
        a: 'Да, бесплатно. Мы храним копию официального PDF для каждого штата США на странице /manuals. Примерно для 22 штатов есть переведённые версии на нескольких языках. Это тот же PDF, что публикует DMV штата.',
      },
      {
        q: 'Чем вы отличаетесь от DriversEd, Aceable или Driving-Tests.org?',
        a: 'Три отличия. (1) Мы поддерживаем 5 языков, включая русский и украинский, тогда как большинство конкурентов только на английском. (2) Мы берём оплату один раз, а не ежемесячно. (3) Быстрая прямая поддержка: пишите нам в Telegram или на email, и мы отвечаем в течение 4 часов.',
      },
      {
        q: 'Как сообщить о неправильном ответе или плохом переводе?',
        a: 'Под пояснением к каждому вопросу есть маленькая кнопка 🐛 Report. Нажмите её, выберите причину (неверный ответ, плохой перевод, непонятно и т. д.), при желании добавьте комментарий. Сообщение сразу попадает к нашей команде в Telegram, и мы исправляем в тот же день или на следующий.',
      },
      {
        q: 'Безопасны ли мои платёжные данные?',
        a: 'Да. Мы никогда не видим и не храним полные данные вашей карты, платежи зашифрованы и обрабатываются сертифицированным платёжным провайдером. Мы видим только последние 4 цифры для нужд поддержки.',
      },
      {
        q: 'Как часто обновляются вопросы?',
        a: 'Мы обновляем вопросы, когда меняются Driver Handbook штатов (обычно раз в год на штат). Руководства новых штатов добавляем, когда выходят официальные версии. Сообщения об ошибках от пользователей мы просматриваем ежедневно и сразу исправляем, если они подтверждаются.',
      },
      {
        q: 'Можно ли проходить тест на телефоне?',
        a: 'Да. Сайт dmvsos.com сделан в первую очередь под телефон. Большинство пользователей занимаются с телефона. iOS и Android работают в любом браузере.',
      },
    ],
  },
  es: {
    title: 'Preguntas frecuentes',
    subtitle: 'Sobre los exámenes de práctica de DMVSOS, precios, reembolsos y en qué nos diferenciamos de otros sitios.',
    qa: [
      {
        q: '¿De verdad puedo empezar gratis en DMVSOS?',
        a: 'Sí. Puedes practicar 20 preguntas por estado, por idioma y por categoría sin registrarte. Sin tarjeta de crédito, sin correo para empezar. Si quieres práctica ilimitada, los pases de pago son pagos únicos (sin suscripción): Moto $19.99, Auto $29.99, CDL Pro $49.99. Cada uno da 30 días de acceso ilimitado.',
      },
      {
        q: '¿Son las preguntas reales del examen del DMV?',
        a: 'Sí. Practicas con las preguntas reales del examen del DMV de tu estado, las mismas que verás el día del examen.',
      },
      {
        q: '¿Qué estados de EE. UU. cubren?',
        a: 'Los 50 estados de EE. UU. más Washington DC. Cada estado tiene su propio banco de preguntas creado a partir del Driver Handbook vigente de ese estado. Actualizamos cuando se actualiza el manual.',
      },
      {
        q: '¿Qué idiomas están disponibles?',
        a: 'Inglés, español (Español), ruso (Русский), ucraniano (Українська) y chino (中文). Cada pregunta, cada opción de respuesta y cada explicación están traducidas a los 5 idiomas. Puedes cambiar de idioma a mitad del examen desde la esquina superior derecha.',
      },
      {
        q: '¿Ofrecen el examen de licencia comercial (CDL)?',
        a: 'Sí. El pase CDL Pro incluye las secciones de General Knowledge, Air Brakes y Combination Vehicles, y también incluye los exámenes de Car. Los endosos específicos (Hazmat, Tanker, Passenger, School Bus) están en camino.',
      },
      {
        q: '¿Hay suscripción?',
        a: 'No. Los pases son pagos únicos por 30 días de acceso. Después de 30 días el pase simplemente caduca. Sin renovación automática, sin cargos recurrentes. Si necesitas más tiempo, puedes extenderlo por $9.99 otros 30 días.',
      },
      {
        q: '¿Cuál es la política de reembolso?',
        a: 'Los pases son compras únicas, por lo que son finales. Si algo está mal, escríbenos por Telegram y lo solucionaremos.',
      },
      {
        q: '¿Necesito crear una cuenta?',
        a: 'Solo si quieres guardar tu progreso entre dispositivos o pasar a un pase de pago. Los exámenes de práctica funcionan sin registro. La cuenta se crea con Google o con un enlace por correo (sin contraseña).',
      },
      {
        q: '¿Puedo descargar el Driver Handbook oficial?',
        a: 'Sí, gratis. Tenemos una copia del PDF oficial de cada estado de EE. UU. en /manuals. Para unos 22 estados también tenemos versiones traducidas a varios idiomas. El PDF es el mismo que publica el DMV del estado.',
      },
      {
        q: '¿Cómo se comparan con DriversEd, Aceable o Driving-Tests.org?',
        a: 'Tres diferencias. (1) Ofrecemos 5 idiomas, incluidos ruso y ucraniano, mientras que la mayoría de los competidores son solo en inglés. (2) Cobramos una sola vez, no mensualmente. (3) Soporte rápido y directo: escríbenos por Telegram o correo y respondemos en menos de 4 horas.',
      },
      {
        q: '¿Cómo reporto una respuesta incorrecta o una mala traducción?',
        a: 'Cada pregunta tiene un pequeño botón 🐛 Report debajo de la explicación. Tócalo, elige un motivo (respuesta incorrecta, mala traducción, poco claro, etc.) y, si quieres, añade un comentario. El reporte llega directo a nuestro equipo en Telegram y lo corregimos el mismo día o al siguiente.',
      },
      {
        q: '¿Es segura mi información de pago?',
        a: 'Sí. Nunca vemos ni guardamos los datos completos de tu tarjeta, los pagos están cifrados y los procesa un proveedor de pagos certificado. Solo vemos los últimos 4 dígitos para fines de soporte.',
      },
      {
        q: '¿Con qué frecuencia se actualizan las preguntas?',
        a: 'Actualizamos cuando cambian los Driver Handbook de los estados (normalmente una vez al año por estado). Añadimos los manuales de estados nuevos cuando salen las versiones oficiales. Revisamos a diario los reportes de los usuarios y los corregimos de inmediato si se confirman.',
      },
      {
        q: '¿Puedo hacer el examen en mi teléfono?',
        a: 'Sí. dmvsos.com está diseñado pensando primero en el móvil. La mayoría de los usuarios practican desde el teléfono. iOS y Android funcionan en cualquier navegador.',
      },
    ],
  },
  zh: {
    title: '常见问题',
    subtitle: '关于 DMVSOS 模拟考试、价格、退款，以及我们与其他网站的不同之处。',
    qa: [
      {
        q: 'DMVSOS 真的可以免费开始吗？',
        a: '可以。每个州、每种语言、每个类别都能免费练习 20 道题，无需注册。开始时不需要信用卡，也不需要邮箱。如果想要无限练习，付费通行证是一次性付款（无订阅）：Moto $19.99，Auto $29.99，CDL Pro $49.99。每种都提供 30 天的无限使用。',
      },
      {
        q: '这些是真正的 DMV 考试题吗？',
        a: '是的。你练习的是你所在州真正的 DMV 考试题，和考试当天看到的一样。',
      },
      {
        q: '你们覆盖哪些美国州？',
        a: '全部 50 个美国州，外加 Washington DC。每个州都有自己的题库，依据该州现行的 Driver Handbook 编写。手册更新时，我们也会更新。',
      },
      {
        q: '支持哪些语言？',
        a: '英语、西班牙语（Español）、俄语（Русский）、乌克兰语（Українська）和中文（中文）。每一道题、每个答案选项和每条解释都翻译成全部 5 种语言。考试中途也可以在右上角切换语言。',
      },
      {
        q: '你们提供商业驾照（CDL）考试吗？',
        a: '提供。CDL Pro 通行证包含 General Knowledge、Air Brakes 和 Combination Vehicles 部分，也包含 Car 考试。具体背书（Hazmat、Tanker、Passenger、School Bus）即将推出。',
      },
      {
        q: '有订阅吗？',
        a: '没有。通行证是一次性付款，提供 30 天使用权。30 天后通行证直接到期。没有自动续费，没有重复扣款。如果需要更多时间，可以花 $9.99 续 30 天。',
      },
      {
        q: '退款政策是怎样的？',
        a: '通行证是一次性购买，因此为最终交易。如果出现问题，请在 Telegram 上联系我们，我们会妥善处理。',
      },
      {
        q: '我需要创建账户吗？',
        a: '只有在你想跨设备保存进度或升级到付费通行证时才需要。模拟考试无需注册即可使用。账户通过 Google 或邮箱魔法链接创建（无需密码）。',
      },
      {
        q: '我可以下载官方 Driver Handbook 吗？',
        a: '可以，免费。我们在 /manuals 上保存了每个美国州的官方 PDF。约 22 个州还提供多种语言的翻译版本。这份 PDF 与各州 DMV 发布的完全相同。',
      },
      {
        q: '你们和 DriversEd、Aceable 或 Driving-Tests.org 有什么不同？',
        a: '三点不同。(1) 我们支持 5 种语言，包括俄语和乌克兰语，而大多数竞品只有英语。(2) 我们只收一次费用，而非按月收费。(3) 快速直接的支持：通过 Telegram 或邮件联系我们，我们会在 4 小时内回复。',
      },
      {
        q: '如何报告错误答案或不好的翻译？',
        a: '每道题在解释下方都有一个小小的 🐛 Report 按钮。点一下，选择原因（答案错误、翻译不好、不清楚等），可以再加一句评论。报告会直接发送给我们 Telegram 上的团队，我们当天或第二天就会修正。',
      },
      {
        q: '我的支付信息安全吗？',
        a: '安全。我们从不查看或存储你的完整卡号，支付经过加密，由通过认证的支付服务商处理。出于客服需要，我们只能看到卡号的后 4 位。',
      },
      {
        q: '题目多久更新一次？',
        a: '当各州的 Driver Handbook 变更时我们就更新（通常每州每年一次）。官方新版本上线后，我们会加入新州的手册。用户提交的错误报告我们每天审核，确认后立即修正。',
      },
      {
        q: '我可以在手机上做题吗？',
        a: '可以。dmvsos.com 采用移动优先设计。大多数用户都在手机上练习。iOS 和 Android 在任意浏览器中都能使用。',
      },
    ],
  },
  ua: {
    title: 'Часті запитання',
    subtitle: 'Про практичні тести DMVSOS, ціни, повернення коштів і те, чим ми відрізняємось від інших сайтів.',
    qa: [
      {
        q: 'DMVSOS справді можна почати безкоштовно?',
        a: 'Так. Можна пройти 20 запитань на кожен штат, на кожну мову й на кожну категорію без реєстрації. Без картки, без email, щоб почати. Якщо потрібна безлімітна практика, платні доступи оплачуються один раз (без підписки): Moto $19.99, Auto $29.99, CDL Pro $49.99. Кожен дає 30 днів безлімітного доступу.',
      },
      {
        q: 'Це справжні запитання іспиту DMV?',
        a: 'Так. Ви тренуєтесь на справжніх запитаннях іспиту DMV для вашого штату, тих самих, що побачите в день складання.',
      },
      {
        q: 'Які штати США ви охоплюєте?',
        a: 'Усі 50 штатів США плюс Washington DC. Кожен штат має власну базу запитань, складену за чинним Driver Handbook цього штату. Ми оновлюємо її, коли оновлюється посібник.',
      },
      {
        q: 'Які мови підтримуються?',
        a: 'Англійська, іспанська (Español), російська (Русский), українська (Українська) і китайська (中文). Кожне запитання, кожен варіант відповіді та кожне пояснення перекладено всіма 5 мовами. Мову можна перемкнути прямо під час тесту у верхньому правому куті.',
      },
      {
        q: 'Чи є тест на комерційні права (CDL)?',
        a: 'Так. Доступ CDL Pro містить розділи General Knowledge, Air Brakes і Combination Vehicles, а також тести на легковий автомобіль. Окремі допуски (Hazmat, Tanker, Passenger, School Bus) незабаром з\'являться.',
      },
      {
        q: 'Чи є підписка?',
        a: 'Ні. Доступ оплачується один раз і діє 30 днів. Через 30 днів він просто завершується. Жодного автопродовження, жодних повторних списань. Якщо потрібно більше часу, можна продовжити за $9.99 ще на 30 днів.',
      },
      {
        q: 'Яка політика повернення коштів?',
        a: 'Доступи купуються одноразово, тому поверненню не підлягають. Якщо щось пішло не так, напишіть нам у Telegram, і ми все владнаємо.',
      },
      {
        q: 'Чи потрібно створювати акаунт?',
        a: 'Лише якщо хочете зберігати прогрес між пристроями або оформити платний доступ. Практичні тести працюють без реєстрації. Акаунт створюється через Google або за посиланням на email (без пароля).',
      },
      {
        q: 'Чи можна завантажити офіційний Driver Handbook?',
        a: 'Так, безкоштовно. Ми зберігаємо копію офіційного PDF для кожного штату США на сторінці /manuals. Приблизно для 22 штатів є перекладені версії кількома мовами. Це той самий PDF, що публікує DMV штату.',
      },
      {
        q: 'Чим ви відрізняєтесь від DriversEd, Aceable чи Driving-Tests.org?',
        a: 'Три відмінності. (1) Ми підтримуємо 5 мов, зокрема російську й українську, тоді як більшість конкурентів лише англійською. (2) Ми беремо оплату один раз, а не щомісяця. (3) Швидка пряма підтримка: пишіть нам у Telegram або на email, і ми відповідаємо протягом 4 годин.',
      },
      {
        q: 'Як повідомити про неправильну відповідь або поганий переклад?',
        a: 'Під поясненням до кожного запитання є невелика кнопка 🐛 Report. Натисніть її, оберіть причину (неправильна відповідь, поганий переклад, незрозуміло тощо), за бажанням додайте коментар. Повідомлення одразу потрапляє до нашої команди в Telegram, і ми виправляємо того ж дня або наступного.',
      },
      {
        q: 'Чи безпечні мої платіжні дані?',
        a: 'Так. Ми ніколи не бачимо й не зберігаємо повні дані вашої картки, платежі зашифровані та обробляються сертифікованим платіжним провайдером. Ми бачимо лише останні 4 цифри для потреб підтримки.',
      },
      {
        q: 'Як часто оновлюються запитання?',
        a: 'Ми оновлюємо запитання, коли змінюються Driver Handbook штатів (зазвичай раз на рік на штат). Посібники нових штатів додаємо, коли виходять офіційні версії. Повідомлення про помилки від користувачів переглядаємо щодня й одразу виправляємо, якщо вони підтверджуються.',
      },
      {
        q: 'Чи можна проходити тест на телефоні?',
        a: 'Так. Сайт dmvsos.com зроблено насамперед під телефон. Більшість користувачів займаються з телефона. iOS і Android працюють у будь-якому браузері.',
      },
    ],
  },
};

export default function FaqPage() {
  const [lang] = useState(() => getSavedLang() || 'en');
  const [openIdx, setOpenIdx] = useState(0);

  const tx = FAQ_I18N[lang] || FAQ_I18N.en;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: QA.map(item => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.a,
          },
        })),
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: ['h1', '.faq-question', '.faq-answer'],
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://dmvsos.com' },
          { '@type': 'ListItem', position: 2, name: 'FAQ',  item: 'https://dmvsos.com/faq' },
        ],
      },
    ],
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC] py-10 px-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="max-w-2xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 mb-8 hover:opacity-90 transition">
          <Image src="/logo.png" alt="DMVSOS" width={36} height={36} className="rounded-xl" />
          <span className="text-[22px] font-bold text-[#0B1C3D] tracking-tight">DMVSOS</span>
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[#0B1C3D] mb-2">{tx.title}</h1>
          <p className="text-[#64748B] text-sm">
            {tx.subtitle}
          </p>
        </header>

        <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] divide-y divide-[#E2E8F0]">
          {tx.qa.map((item, i) => {
            const isOpen = openIdx === i;
            return (
              <div key={i}>
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? -1 : i)}
                  className="w-full text-left px-5 sm:px-6 py-4 flex items-center justify-between gap-3 hover:bg-[#F8FAFC] transition-colors"
                >
                  <span className="faq-question text-sm sm:text-base font-semibold text-[#0B1C3D]">
                    {item.q}
                  </span>
                  <span className="text-[#94A3B8] text-sm shrink-0">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <div className="px-5 sm:px-6 pb-4 -mt-1">
                    <p className="faq-answer text-sm text-[#475569] leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 text-center text-sm text-[#64748B]">
          Still have a question? Message{' '}
          <a
            href="https://t.me/dmvsos_support_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#2563EB] underline underline-offset-2 font-medium"
          >
            @dmvsos_support_bot
          </a>
          {' '}or email{' '}
          <a href="mailto:maindmvsos@gmail.com" className="text-[#2563EB] underline underline-offset-2 font-medium">
            maindmvsos@gmail.com
          </a>
          .
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-[#2563EB] font-medium hover:underline">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
