'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getSavedLang } from '@/lib/lang';
import { t } from '@/lib/translations';

// Local, page-scoped translations for the About page. Keyed by language code.
// Metadata + JSON-LD stay English on purpose (SEO / cookieless crawler = en).
const ABOUT_I18N = {
  en: {
    title: 'About DMVSOS',
    tagline: 'Built around state-official content.',
    intro1:
      "Most DMV prep is stuck on three things: English-only content, generic questions that don't match the state you're actually testing in, and monthly subscriptions that bill you forever after you got your license.",
    intro2Pre: '',
    intro2Strong: 'DMVSOS',
    intro2Post: ' fixes all three.',
    whatWeDo: 'What we do',
    li1Pre: 'Practice tests for ',
    li1Strong1: 'all 50 US states',
    li1Mid: ' + DC. Every question comes from that state’s ',
    li1Strong2: 'official Driver Handbook',
    li1Post: '.',
    li2Strong: '5 languages',
    li2Post: ': English, Spanish, Russian, Ukrainian, Chinese. Each question, each option, each explanation, all translated.',
    li3Strong: 'Car, CDL, and Motorcycle',
    li3Post: ' categories.',
    li4Strong: 'One-time payment.',
    li4Post:
      ' $19.99 (Moto), $29.99 (Auto), $49.99 (CDL Pro). 30 days of unlimited practice. No subscription. Extension is $9.99 if you need more time.',
    li5Strong: 'Free to start.',
    li5Post: ' 20 questions per state per language, no signup.',
    li6Strong: 'CDL Pro includes the Car tests too.',
    li6Post: ' One pass covers commercial and car prep.',
    whereFrom: 'Where the questions come from',
    where1:
      "We’re not selling you leaked exam answers. Nobody legitimate has those. Every question is written from the official state Driver Handbook (the same source the real DMV exam draws from), in the same format and difficulty. We cite the exact section of the handbook under each question.",
    where2Pre: 'If you spot a question that looks wrong, there’s a 🐛 Report button under every answer. It goes straight to our team via Telegram, and we fix the question that day or the next.',
    support: 'Support',
    supportPre: 'No call center, no chatbot maze. Write to us on Telegram: ',
    supportMid: ' or email ',
    supportPost: '. We read everything, usually reply within 4 hours.',
    contactLabel: 'Contact:',
    chargeStrong: 'Questions about a charge?',
    chargePost: ' Just message us and we’ll sort it out.',
    termsLabel: 'Terms / Privacy:',
    termsLink: 'Terms',
    privacyLink: 'Privacy Policy',
  },
  ru: {
    title: 'О DMVSOS',
    tagline: 'Основано на официальных материалах штатов.',
    intro1:
      'У большинства сервисов подготовки к DMV три беды: контент только на английском, общие вопросы, которые не совпадают со штатом, где вы реально сдаёте, и ежемесячные подписки, которые продолжают списывать деньги ещё долго после того, как вы получили права.',
    intro2Pre: '',
    intro2Strong: 'DMVSOS',
    intro2Post: ' решает все три.',
    whatWeDo: 'Что мы делаем',
    li1Pre: 'Пробные тесты для ',
    li1Strong1: 'всех 50 штатов США',
    li1Mid: ' и округа Колумбия. Каждый вопрос взят из ',
    li1Strong2: 'официального руководства водителя',
    li1Post: ' этого штата.',
    li2Strong: '5 языков',
    li2Post: ': английский, испанский, русский, украинский, китайский. Каждый вопрос, каждый вариант, каждое объяснение · всё переведено.',
    li3Strong: 'Категории: легковой автомобиль, CDL и мотоцикл',
    li3Post: '.',
    li4Strong: 'Разовая оплата.',
    li4Post:
      ' $19.99 (Мото), $29.99 (Авто), $49.99 (CDL Pro). 30 дней безлимитной практики. Без подписки. Продление · $9.99, если нужно больше времени.',
    li5Strong: 'Можно начать бесплатно.',
    li5Post: ' 20 вопросов на штат и язык, без регистрации.',
    li6Strong: 'CDL Pro включает и тесты для легковых.',
    li6Post: ' Один доступ покрывает подготовку и для коммерческого, и для легкового транспорта.',
    whereFrom: 'Откуда берутся вопросы',
    where1:
      'Мы не продаём вам «слитые» ответы с экзамена. Ни у кого честного их нет. Каждый вопрос составлен по официальному руководству водителя штата (тот же источник, из которого берёт вопросы настоящий экзамен DMV), в том же формате и той же сложности. Под каждым вопросом мы указываем точный раздел руководства.',
    where2Pre: 'Если вы заметили вопрос, который кажется неверным, под каждым ответом есть кнопка 🐛 «Сообщить». Она напрямую попадает к нашей команде через Telegram, и мы исправляем вопрос в тот же день или на следующий.',
    support: 'Поддержка',
    supportPre: 'Никаких колл-центров и лабиринтов из чат-ботов. Пишите нам в Telegram: ',
    supportMid: ' или на почту ',
    supportPost: '. Мы читаем всё и обычно отвечаем в течение 4 часов.',
    contactLabel: 'Контакты:',
    chargeStrong: 'Вопросы по оплате?',
    chargePost: ' Просто напишите нам, и мы во всём разберёмся.',
    termsLabel: 'Условия / Конфиденциальность:',
    termsLink: 'Условия',
    privacyLink: 'Политика конфиденциальности',
  },
  es: {
    title: 'Acerca de DMVSOS',
    tagline: 'Basado en el contenido oficial de cada estado.',
    intro1:
      'La mayoría de las apps de preparación para el DMV se quedan en tres cosas: contenido solo en inglés, preguntas genéricas que no coinciden con el estado donde realmente das el examen, y suscripciones mensuales que te siguen cobrando mucho después de obtener tu licencia.',
    intro2Pre: '',
    intro2Strong: 'DMVSOS',
    intro2Post: ' resuelve las tres.',
    whatWeDo: 'Qué hacemos',
    li1Pre: 'Exámenes de práctica para ',
    li1Strong1: 'los 50 estados de EE. UU.',
    li1Mid: ' y DC. Cada pregunta proviene del ',
    li1Strong2: 'Manual del Conductor oficial',
    li1Post: ' de ese estado.',
    li2Strong: '5 idiomas',
    li2Post: ': inglés, español, ruso, ucraniano y chino. Cada pregunta, cada opción y cada explicación, todo traducido.',
    li3Strong: 'Categorías: automóvil, CDL y motocicleta',
    li3Post: '.',
    li4Strong: 'Pago único.',
    li4Post:
      ' $19.99 (Moto), $29.99 (Auto), $49.99 (CDL Pro). 30 días de práctica ilimitada. Sin suscripción. La extensión cuesta $9.99 si necesitas más tiempo.',
    li5Strong: 'Empieza gratis.',
    li5Post: ' 20 preguntas por estado y por idioma, sin registro.',
    li6Strong: 'CDL Pro también incluye los exámenes de automóvil.',
    li6Post: ' Un solo acceso cubre la preparación comercial y la de automóvil.',
    whereFrom: 'De dónde vienen las preguntas',
    where1:
      'No te vendemos respuestas filtradas del examen. Nadie legítimo las tiene. Cada pregunta se redacta a partir del Manual del Conductor oficial del estado (la misma fuente de la que sale el examen real del DMV), con el mismo formato y dificultad. Citamos la sección exacta del manual debajo de cada pregunta.',
    where2Pre: 'Si encuentras una pregunta que parece incorrecta, hay un botón 🐛 «Reportar» debajo de cada respuesta. Llega directo a nuestro equipo por Telegram, y corregimos la pregunta ese mismo día o al siguiente.',
    support: 'Soporte',
    supportPre: 'Sin centros de llamadas ni laberintos de chatbots. Escríbenos por Telegram: ',
    supportMid: ' o por correo ',
    supportPost: '. Leemos todo y normalmente respondemos en 4 horas.',
    contactLabel: 'Contacto:',
    chargeStrong: '¿Dudas sobre un cobro?',
    chargePost: ' Solo escríbenos y lo resolvemos.',
    termsLabel: 'Términos / Privacidad:',
    termsLink: 'Términos',
    privacyLink: 'Política de Privacidad',
  },
  zh: {
    title: '关于 DMVSOS',
    tagline: '基于各州官方内容打造。',
    intro1:
      '大多数 DMV 备考工具都卡在三个问题上：内容只有英文、题目通用却和你实际考试的州对不上，还有月度订阅，在你拿到驾照之后还会一直扣费。',
    intro2Pre: '',
    intro2Strong: 'DMVSOS',
    intro2Post: ' 把这三点都解决了。',
    whatWeDo: '我们做什么',
    li1Pre: '为 ',
    li1Strong1: '全美 50 个州',
    li1Mid: '（含华盛顿特区）提供模拟考试。每道题都取自该州的 ',
    li1Strong2: '官方驾驶手册',
    li1Post: '。',
    li2Strong: '5 种语言',
    li2Post: '：英语、西班牙语、俄语、乌克兰语、中文。每道题、每个选项、每条解析，全部翻译。',
    li3Strong: '小车、CDL 和摩托车',
    li3Post: ' 三类。',
    li4Strong: '一次性付款。',
    li4Post:
      ' $19.99（摩托）、$29.99（小车）、$49.99（CDL Pro）。30 天无限练习。无订阅。如需更多时间，续期 $9.99。',
    li5Strong: '免费开始。',
    li5Post: ' 每个州每种语言 20 道题，无需注册。',
    li6Strong: 'CDL Pro 同时包含小车考试。',
    li6Post: ' 一次购买即可涵盖商用车和小车的备考。',
    whereFrom: '题目从何而来',
    where1:
      '我们不会向你兜售所谓泄露的考试答案，正规渠道根本没有这种东西。每道题都依据各州官方驾驶手册编写（与真实 DMV 考试同源），格式和难度一致。每道题下方都会标注手册的具体章节。',
    where2Pre: '如果你发现某道题看起来有误，每个答案下方都有一个 🐛 报告按钮。它会通过 Telegram 直接发给我们的团队，我们会在当天或第二天修正这道题。',
    support: '支持',
    supportPre: '没有呼叫中心，也没有绕来绕去的聊天机器人。通过 Telegram 联系我们：',
    supportMid: ' 或发邮件至 ',
    supportPost: '。我们会读每一条消息，通常 4 小时内回复。',
    contactLabel: '联系方式：',
    chargeStrong: '对扣费有疑问？',
    chargePost: ' 直接给我们留言，我们会帮你处理好。',
    termsLabel: '条款 / 隐私：',
    termsLink: '条款',
    privacyLink: '隐私政策',
  },
  ua: {
    title: 'Про DMVSOS',
    tagline: 'Створено на основі офіційних матеріалів штатів.',
    intro1:
      'Більшість сервісів підготовки до DMV застрягли на трьох речах: контент лише англійською, загальні запитання, що не збігаються зі штатом, де ви насправді складаєте іспит, і щомісячні підписки, які продовжують списувати кошти ще довго після того, як ви отримали права.',
    intro2Pre: '',
    intro2Strong: 'DMVSOS',
    intro2Post: ' вирішує всі три.',
    whatWeDo: 'Що ми робимо',
    li1Pre: 'Пробні тести для ',
    li1Strong1: 'усіх 50 штатів США',
    li1Mid: ' та округу Колумбія. Кожне запитання взято з ',
    li1Strong2: 'офіційного посібника водія',
    li1Post: ' цього штату.',
    li2Strong: '5 мов',
    li2Post: ': англійська, іспанська, російська, українська, китайська. Кожне запитання, кожен варіант, кожне пояснення · усе перекладено.',
    li3Strong: 'Категорії: легковий автомобіль, CDL і мотоцикл',
    li3Post: '.',
    li4Strong: 'Разова оплата.',
    li4Post:
      ' $19.99 (Мото), $29.99 (Авто), $49.99 (CDL Pro). 30 днів безлімітної практики. Без підписки. Продовження · $9.99, якщо потрібно більше часу.',
    li5Strong: 'Почати можна безкоштовно.',
    li5Post: ' 20 запитань на штат і мову, без реєстрації.',
    li6Strong: 'CDL Pro включає й тести для легкових.',
    li6Post: ' Один доступ покриває підготовку і до комерційного, і до легкового транспорту.',
    whereFrom: 'Звідки беруться запитання',
    where1:
      'Ми не продаємо вам «зливи» відповідей з іспиту. У жодної чесної людини їх немає. Кожне запитання складено за офіційним посібником водія штату (те саме джерело, з якого бере запитання справжній іспит DMV), у тому самому форматі та з тією самою складністю. Під кожним запитанням ми вказуємо точний розділ посібника.',
    where2Pre: 'Якщо ви помітили запитання, яке здається хибним, під кожною відповіддю є кнопка 🐛 «Повідомити». Вона напряму потрапляє до нашої команди через Telegram, і ми виправляємо запитання того ж дня або наступного.',
    support: 'Підтримка',
    supportPre: 'Жодних колл-центрів і лабіринтів із чат-ботів. Пишіть нам у Telegram: ',
    supportMid: ' або на пошту ',
    supportPost: '. Ми читаємо все й зазвичай відповідаємо протягом 4 годин.',
    contactLabel: 'Контакти:',
    chargeStrong: 'Питання щодо оплати?',
    chargePost: ' Просто напишіть нам, і ми все владнаємо.',
    termsLabel: 'Умови / Конфіденційність:',
    termsLink: 'Умови',
    privacyLink: 'Політика конфіденційності',
  },
};

export default function AboutPage() {
  // getSavedLang() returns 'en' on the server (cookieless crawler = en) and the
  // visitor's saved language on the client. Same lazy-init pattern as the FAQ page.
  const [lang] = useState(() => getSavedLang() || 'en');

  const tex = t[lang] || t.en;
  const tx = ABOUT_I18N[lang] || ABOUT_I18N.en;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        name: 'About DMVSOS',
        url: 'https://dmvsos.com/about',
        description: 'About DMVSOS | free DMV practice tests for all 50 US states in 5 languages, built from official state Driver Handbooks.',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home',  item: 'https://dmvsos.com' },
          { '@type': 'ListItem', position: 2, name: 'About', item: 'https://dmvsos.com/about' },
        ],
      },
    ],
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC] py-10 px-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto">
        {/* Logo + nav */}
        <Link href="/" className="inline-flex items-center gap-2 mb-8 hover:opacity-90 transition">
          <Image src="/logo.png" alt="DMVSOS" width={36} height={36} className="rounded-xl" />
          <span className="text-[22px] font-bold text-[#0B1C3D] tracking-tight">DMVSOS</span>
        </Link>

        <article className="bg-white rounded-2xl p-8 sm:p-10 shadow-sm border border-[#E2E8F0]">
          <h1 className="text-3xl font-bold text-[#0B1C3D] mb-2">{tx.title}</h1>
          <p className="text-[#64748B] text-sm mb-8">{tx.tagline}</p>

          <section className="space-y-5 text-[#1E293B] leading-relaxed">
            <p>{tx.intro1}</p>
            <p>
              {tx.intro2Pre}<strong>{tx.intro2Strong}</strong>{tx.intro2Post}
            </p>

            <h2 className="text-xl font-bold text-[#0B1C3D] pt-4">{tx.whatWeDo}</h2>
            <ul className="space-y-2 list-disc pl-6">
              <li>
                {tx.li1Pre}<strong>{tx.li1Strong1}</strong>{tx.li1Mid}<strong>{tx.li1Strong2}</strong>{tx.li1Post}
              </li>
              <li>
                <strong>{tx.li2Strong}</strong>{tx.li2Post}
              </li>
              <li>
                <strong>{tx.li3Strong}</strong>{tx.li3Post}
              </li>
              <li>
                <strong>{tx.li4Strong}</strong>{tx.li4Post}
              </li>
              <li>
                <strong>{tx.li5Strong}</strong>{tx.li5Post}
              </li>
              <li>
                <strong>{tx.li6Strong}</strong>{tx.li6Post}
              </li>
            </ul>

            <h2 className="text-xl font-bold text-[#0B1C3D] pt-4">{tx.whereFrom}</h2>
            <p>{tx.where1}</p>
            <p>{tx.where2Pre}</p>

            <h2 className="text-xl font-bold text-[#0B1C3D] pt-4">{tx.support}</h2>
            <p>
              {tx.supportPre}
              <a
                href="https://t.me/dmvsos_support_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#2563EB] underline underline-offset-2 font-medium"
              >
                @dmvsos_support_bot
              </a>
              {tx.supportMid}
              <a href="mailto:maindmvsos@gmail.com" className="text-[#2563EB] underline underline-offset-2 font-medium">
                maindmvsos@gmail.com
              </a>
              {tx.supportPost}
            </p>

            <div className="pt-6 mt-6 border-t border-[#E2E8F0] text-sm text-[#64748B] space-y-2">
              <p>
                <strong>{tx.contactLabel}</strong>{' '}
                <a href="mailto:maindmvsos@gmail.com" className="text-[#2563EB]">maindmvsos@gmail.com</a>
                {' '}·{' '}
                <a href="https://t.me/dmvsos_support_bot" target="_blank" rel="noopener noreferrer" className="text-[#2563EB]">@dmvsos_support_bot</a>
              </p>
              <p>
                <strong>{tx.chargeStrong}</strong>{tx.chargePost}
              </p>
              <p>
                <strong>{tx.termsLabel}</strong>{' '}
                <Link href="/terms" className="text-[#2563EB]">{tx.termsLink}</Link>
                {' · '}
                <Link href="/privacy" className="text-[#2563EB]">{tx.privacyLink}</Link>
              </p>
            </div>
          </section>
        </article>

        <div className="mt-6 text-center">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-[#2563EB] font-medium hover:underline">
            {tex.home || 'Home'}
          </Link>
        </div>
      </div>
    </main>
  );
}
