# DMVSOS - Project Context

**Domain:** dmvsos.com
**Purpose:** Multilingual DMV practice test platform for immigrants preparing for US driving tests.

## Tech Stack

- **Framework:** Next.js 16.1.6 (App Router)
- **Styling:** Tailwind CSS v4, inline styles, DM Sans (headlines) + Inter (body)
- **Database & Auth:** Supabase (PostgreSQL + OAuth with PKCE flow)
- **Payments:** Stripe ($9.99/month recurring subscription)
- **Hosting:** Vercel (auto-deploy from `main`)
- **AI:** Anthropic SDK (dev dependency, used in scripts for question generation/translation)
- **Analytics:** Vercel Analytics + Speed Insights

---

## Pages & Current State

| Route | Status | Description |
|-------|--------|-------------|
| `/` | Working | Homepage: language selector, state selector, hero section, how-it-works steps, stats, pricing, testimonials, FAQ, footer. Header has login button + logo. |
| `/category` | Working | Test type selector: Car (DMV), CDL, Motorcycle. Passes state & lang to `/test`. |
| `/test` | Working | Main test interface. Loads questions from Supabase. Free users get 20 questions auto-start. Pro users see mode selector (Real 40 / Extended 80 / Marathon all). Keyboard shortcuts (1-4, Enter/Space). Motivational messages. Upgrade banner at Q20 for free users. |
| `/result` | Working | Score display, error review, retry wrong answers (via sessionStorage). Logs test session to `test_sessions` table. |
| `/upgrade` | Working | Pro pricing page with Stripe checkout CTA. |
| `/login` | Working | Google & Apple OAuth via Supabase. |
| `/auth/callback` | Working | OAuth callback handler. |
| `/profile` | Working | User dashboard: test history from `test_sessions`, pro status. |
| `/success` | Working | Post-payment confirmation page. |
| `/admin` | Working | Password-protected question management. CRUD, bulk CSV upload, image upload to Supabase Storage. Rate-limited (5 attempts/15 min). |
| `/terms` | Working | Terms of service (static). |
| `/privacy` | Working | Privacy policy (static). |

### API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/create-checkout` | POST | Creates Stripe checkout session for subscription. |
| `/api/webhook` | POST | Stripe webhook: handles `checkout.session.completed`, `subscription.deleted/updated`, `invoice.payment_failed`. Updates `profiles.is_pro`. |
| `/api/admin-auth` | POST | Validates admin password, returns token. |
| `/api/admin/questions` | POST | Question CRUD (save, bulk upload, delete). |
| `/api/migrate` | POST | Data migration endpoint. |

---

## Working Features

1. **Multi-language UI** - 5 languages: English, Russian, Spanish, Chinese, Ukrainian. Full UI translation via `lib/translations.js` (~800+ strings).
2. **State selection** - All 50 US states supported.
3. **Test categories** - Car (DMV), CDL, Motorcycle.
4. **Question loading** - From Supabase `questions` table, shuffled randomly.
5. **Test modes** - Free (20 questions), Pro: Real (40), Extended (80), Marathon (all).
6. **Auth** - Google & Apple OAuth via Supabase PKCE flow. Session sync middleware.
7. **Payments** - Stripe subscription ($9.99/month) with webhook handling for activation/cancellation.
8. **Admin panel** - Full question management with CSV bulk upload and image support.
9. **Test results** - Score display, error review, retry wrong answers.
10. **Test history** - Logged to `test_sessions`, viewable in `/profile`.
11. **SEO** - Sitemap, robots.txt, JSON-LD schema (WebSite, Organization, FAQPage), OG tags.
12. **Security** - HSTS, X-Frame-Options, CSP headers, Supabase RLS.
13. **Keyboard shortcuts** - 1-4 to select answers, Enter/Space to advance.

---

## Database Structure (Supabase)

### Table: `questions`
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| state | varchar | State slug (e.g., "california") |
| category | varchar | "car", "cdl", or "motorcycle" |
| language | varchar | "en", "ru", "es", "zh", "ua" |
| question_text | text | The question |
| option_a | text | Answer option A |
| option_b | text | Answer option B |
| option_c | text | Answer option C |
| option_d | text | Answer option D |
| correct_answer | integer | Correct answer index (0-3) |
| image_url | text (nullable) | URL to question image |
| created_at | timestamp | Auto-generated |

### Table: `profiles`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (matches Supabase auth user ID) |
| email | varchar (unique) | User email |
| is_pro | boolean | Pro subscription status (default: false) |
| stripe_customer_id | varchar (nullable) | Stripe customer reference |
| created_at | timestamp | Auto-generated |

### Table: `test_sessions`
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | uuid (FK) | References profiles.id |
| state | varchar | State slug |
| category | varchar | Test category |
| score | integer | Correct answers |
| total | integer | Total questions |
| lang | varchar (nullable) | Language code |
| created_at | timestamp | Auto-generated |

### Storage: `question-images` bucket
- Path pattern: `{state}/{language}/{category}/{questionIndex}.{ext}`

---

## What Still Needs to Be Fixed

### Critical Issues

1. **Upload script language code mismatch** - `scripts/upload-to-supabase.js` maps Ukrainian directory (`ua`) to language code `uk` in the database (`LANG_MAP = { ..., ua: 'uk' }`). But the app queries Supabase using `.eq('language', 'ua')`. This means Ukrainian questions uploaded via the script won't be found by the test page. The mapping should be `ua: 'ua'`, not `ua: 'uk'`.

2. **Chinese data directory mismatch** - Chinese question files are stored in `/public/data/cn/` (50 files), but there is no `/public/data/zh/` directory. The upload script correctly maps `cn` -> `zh` for the database, so this only matters if anything tries to read the JSON files directly using `zh` as directory name.

3. **Very low question counts** - Most states have only 4 questions per category (car: 4, cdl: 4, motorcycle: 4). This is far below the test modes that promise 40/80/all questions. Users will get the same 4 questions regardless of mode selection.

### Minor Issues

4. **Junk files in English data** - `/public/data/en/` contains two stray files from a failed script run:
   - `tenessee-translate-cli-russian-test.json.ru.json`
   - `texas-translate-cli-russian-test.json.ru.json`

5. **Ukrainian translations incomplete** - Only 32/50 states have Ukrainian question data files (missing: North Carolina through Wyoming alphabetically).

6. **Chinese (zh) language in sitemap** - `app/sitemap.js` lists `zh` as a supported language, but if Ukrainian data is stored as `uk` in DB, the sitemap won't match actual data.

7. **Category key inconsistency** - Category page uses `dmv`/`cdl`/`moto` as IDs, while the database and JSON files use `car`/`cdl`/`motorcycle`. The test page has a mapping (`categoryMap`) to bridge this, but it's an unnecessary layer of indirection.

---

## Design Decisions Already Made

1. **Fonts** - DM Sans for hero headlines (Anthropic-inspired thin/large style), Inter for everything else.
2. **Color palette** - Navy `#0B1C3D` (primary dark), Blue `#2563EB` (CTA), Amber `#F59E0B` (pro/premium), Green `#10B981` (success), Red `#DC2626` (error).
3. **Freemium model** - Free: 20 questions per test. Pro ($9.99/month): 40/80/all question modes.
4. **Data source** - Questions served from Supabase database (not static JSON files). JSON files are source data for bulk upload scripts.
5. **Auth** - Google + Apple OAuth only (no email/password).
6. **Language persistence** - Saved to both localStorage (`dmvsos_lang`) and cookie (1-year expiry).
7. **Mobile-first** - Responsive design with `sm:` breakpoints.
8. **No component library** - Pure Tailwind CSS with inline styles.
9. **Login in header** - Login button moved to header (not a separate nav item).
10. **Language switcher** - Separate row of flag buttons on homepage.
11. **Hyphens over em dashes** - UI text uses hyphens, not em dashes.
12. **Question shuffling** - Fisher-Yates shuffle on load for randomized test experience.

---

## Project Structure

```
dmvsos/
├── app/
│   ├── page.js              # Homepage
│   ├── layout.js             # Root layout (fonts, analytics)
│   ├── globals.css           # Tailwind + custom keyframes
│   ├── category/page.js      # Test type selector
│   ├── test/page.js          # Test interface
│   ├── result/page.js        # Results & review
│   ├── upgrade/page.js       # Pro upgrade page
│   ├── login/page.js         # OAuth login
│   ├── auth/callback/route.js # OAuth callback
│   ├── profile/page.js       # User dashboard
│   ├── success/page.js       # Payment success
│   ├── admin/page.js         # Question management
│   ├── privacy/page.js       # Privacy policy
│   ├── terms/page.js         # Terms of service
│   ├── robots.js             # SEO robots.txt
│   ├── sitemap.js            # Sitemap generation
│   └── api/
│       ├── create-checkout/route.js
│       ├── webhook/route.js
│       ├── admin-auth/route.js
│       ├── admin/questions/route.js
│       └── migrate/route.js
├── lib/
│   ├── supabase.js           # Supabase client (PKCE)
│   ├── AuthContext.js         # React auth context (user, isPro)
│   ├── translations.js       # All UI strings (5 languages)
│   ├── lang.js               # Language persistence helpers
│   └── states.js             # US states list + slug util
├── public/data/              # Source question files (for upload to Supabase)
│   ├── en/ (52 files, includes 2 junk)
│   ├── ru/ (50 files)
│   ├── es/ (50 files)
│   ├── cn/ (50 files, Chinese - uploaded as "zh")
│   └── ua/ (32 files, Ukrainian - incomplete)
├── scripts/
│   ├── generate-questions.js  # AI question generation (Anthropic)
│   ├── translate-to-ua.js     # Ukrainian translation script
│   ├── upload-to-supabase.js  # Bulk DB upload
│   └── clean-prefixes.js      # Question text cleanup
├── middleware.js              # Auth session sync
├── next.config.mjs            # Security headers, image config
└── .env.local                 # Secrets (Supabase, Stripe, admin)
```

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
NEXT_PUBLIC_STRIPE_PRICE_ID
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_SITE_URL          # https://dmvsos.com
ADMIN_PASSWORD
```
