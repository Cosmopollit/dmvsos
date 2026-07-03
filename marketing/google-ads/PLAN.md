# Google Ads · План запуска DMVSOS

Стратегия: языковой арбитраж. НЕ бидимся на английские ключи (там Zutobi/DMV Genie
с CPC $1.5-3). Бидимся на русские/испанские/украинские/китайские запросы, где
конкуренции почти нет, и ведём на локализованные лендинги /ru/... /es/...
Цепочка «запрос → объявление → лендинг → тест» вся на языке юзера.

## Экономика (сверить с реальностью после 2 недель)
- Чек: $29.99 (Auto), $49.99 (CDL), $19.99 (Moto). Целевой CPA: **< $15**.
- Ожидание: RU CPC $0.15-0.50, CVR 3-6% → CPA $3-15. ES CPC $0.3-0.8.
- Правило: ad group живёт, только если CPA < $15 после ~$50 расхода. Иначе пауза.

## Структура аккаунта

| Кампания | Язык интерфейса юзера | Гео | Бюджет старт | Лендинги |
|---|---|---|---|---|
| DMVSOS-RU | Russian | США (вся) | $10/день | /ru/dmv-test(+штат) |
| DMVSOS-ES | Spanish | США | $10/день | /es/dmv-test(+штат) |
| DMVSOS-UA | Ukrainian | США | $5/день | /ua/dmv-test(+штат) |
| DMVSOS-ZH | Chinese (simpl.) | США | $5/день | /zh/dmv-test(+штат) |

Тип: **Search only** (никакого Display/Search Partners на старте — выключить обе галки).
Языковой таргетинг кампании = язык кампании + English (браузеры иммигрантов часто EN).

### Ad groups (в каждой кампании)
1. **Generic** — «экзамен dmv на русском» и т.п. → хаб /{lang}/dmv-test
2. **States** — топ-штаты диаспоры, ключ + лендинг штата:
   - RU/UA: california, washington, new-york, florida, illinois, new-jersey, pennsylvania
   - ES: california, texas, florida, new-york, arizona, new-jersey, illinois
   - ZH: california, new-york, washington, texas
3. **CDL** (только RU/UA — огромная траковая диаспора, чек $49.99) → /{lang}/dmv-test
4. **Moto** (опционально, позже)

Ключи и объявления: см. keywords_*.csv и ads_*.csv рядом (формат под Google Ads Editor
или ручную заливку). Match types: EXACT + PHRASE. Broad НЕ включать.

## Ставки
- Старт: Maximize Clicks с потолком CPC: RU/UA $0.50, ES $0.80, ZH $0.60.
- После 15-20 конверсий: переключить на tCPA $12.

## Конверсии (ОБЯЗАТЕЛЬНО до запуска)
1. Google Ads → Tools → Linked accounts → связать с GA4 property `www.dmvsos.com`
   (G-JGE08M8VEW). Оба под dmvsos Google-аккаунтом.
2. Tools → Conversions → Import → GA4 → импортировать **purchase** (Primary)
   и **begin_checkout** (Secondary, для сигнала на старте).
3. Auto-tagging (GCLID) в настройках аккаунта: ON. Ничего в код добавлять не надо —
   GA4 уже шлёт purchase с value (lib/gtag.js, задеплоено).

## Минус-слова (на уровне кампаний, все языки — см. negatives.txt)
Отсекаем «сервисные» запросы про офисы/записи/документы: appointment, запись,
офис, часы работы, horario, cita, oficina, renewal, замена, обмен прав, real id,
registration, регистрация автомобиля, plates, номера, работа, job, вакансии,
status, статус заявки.
(Запросы «бесплатно/gratis» НЕ минусуем — фримиум их конвертит.)

## Чек-лист запуска (порядок)
- [ ] ads.google.com → аккаунт на dmvsos Google-аккаунт, биллинг
- [ ] Связка GA4 ↔ Ads + импорт purchase/begin_checkout (см. выше)
- [ ] Залить кампании из CSV (Editor: Account → Import; или руками)
- [ ] Проверить Final URL каждого ad group ОТКРЫВАЕТСЯ (лендинги живые, локализованные)
- [ ] Выключить Display Network + Search Partners в каждой кампании
- [ ] Залить минус-слова списком на все кампании
- [ ] Лимит аккаунта: $30/день суммарно на старт
- [ ] Через 3-4 дня: Search Terms report → мусор в минуса
- [ ] Через 2 недели: CPA-ревью, пауза групп с CPA > $15, tCPA где есть конверсии

## Не-Ads Google (статус)
- **GSC**: sitemap 1270 URL засабмичен; 3 locale-сида отправлены. Еженедельно:
  URL Inspection → Request Indexing на 5-10 свежих /ru|/es лендингов
  (лимит ~10/день). Нужен Chrome с dmvsos-аккаунтом.
- **GA4**: purchase/begin_checkout уже живые. Через неделю после запуска Ads
  смотреть Advertising → Attribution.
- **YouTube Ads / PMax**: НЕ сейчас. После того как Search докажет CPA.
