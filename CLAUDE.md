# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

DMVSOS (dmvsos.com) - A DMV/DOL knowledge test prep platform for US immigrants. Supports all 50 states, 3 license categories (Car, CDL, Motorcycle), and 5 languages (EN, RU, ES, ZH, UA). Freemium model with Stripe subscriptions ($9.99/mo Pro plan).

## Commands

- `npm run dev` - Start dev server (Next.js on localhost:3000)
- `npm run build` - Production build
- `npm run lint` - ESLint
- No test suite exists

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, Tailwind CSS 4
- **Database/Auth**: Supabase (Postgres + OAuth via Google, Apple coming soon)
- **Payments**: Stripe (subscriptions via checkout sessions + webhooks)
- **Hosting**: Vercel (with Analytics + Speed Insights)
- **Scripts**: Anthropic Claude SDK (devDependency) for question generation/translation

## Architecture

### Data Flow
Questions live in **Supabase `questions` table**, not in static JSON files. The static JSON files in `public/data/{lang}/{state}.json` are legacy/backup exports. The test page (`app/test/page.js`) queries Supabase directly filtering by `state`, `category`, and `language`.

### Auth & Pro Status
- `lib/AuthContext.js` - React context providing `{ user, isPro, loading }` via `useAuth()` hook
- Pro status is determined by querying the `profiles` table (`is_pro` column) matched by email
- Stripe webhook (`app/api/webhook/route.js`) handles `checkout.session.completed`, `customer.subscription.deleted`, `customer.subscription.updated`, and `invoice.payment_failed` to toggle `is_pro`

### i18n System
- No i18n framework. All UI strings are in a single `lib/translations.js` file as a `t` object keyed by language code
- Language preference stored in localStorage + cookie (`dmvsos_lang`) via `lib/lang.js`
- Root layout reads cookie server-side to set `<html lang>`
- Every page reads `lang` from URL search params or `getSavedLang()`, then does `const tex = t[lang] || t.en`

### User Flow
1. **Home** (`/`) - State selector, language switcher, hero, pricing, demo question
2. **Category** (`/category?state=X&lang=Y`) - Pick license type: Car, CDL, Motorcycle
3. **Test** (`/test?state=X&category=Y&lang=Z`) - Quiz engine. Free users get 20 questions auto-started. Pro users choose mode: Real (40), Extended (80), Marathon (all). Shows upgrade modal after 20 questions for free users.
4. **Result** (`/result?score=X&total=Y&lang=Z`) - Score, question review, retry wrong answers. Test data passed via `sessionStorage`.
5. **Profile** (`/profile`) - User info, pro badge, test history from `test_sessions` table

### Page-Specific Layouts
Each route under `app/` has its own `layout.js` that exports route-specific SEO metadata (title, description). The root `app/layout.js` handles fonts (Inter, DM Sans, Geist Mono), JSON-LD schema, and wraps everything in `<AuthProvider>`.

### Keyboard Shortcuts in Test
Keys 1-4 select answer options, Enter/Space advances to next question. Implemented via refs (`handleSelectRef`, `handleNextRef`) to avoid stale closure issues.

## Database Schema (Supabase)

### `questions`
`id`, `state` (slug like "washington"), `category` ("car"/"cdl"/"motorcycle"), `language` ("en"/"ru"/"es"/"zh"/"ua"), `question_text`, `option_a`, `option_b`, `option_c`, `option_d`, `correct_answer` (0-3 index), `explanation`, `image_url`, `manual_version`

### `test_sessions`
`id`, `user_id`, `state`, `category`, `score`, `total`, `lang`, `created_at`

### `profiles`
`email` (unique), `is_pro` (boolean), `stripe_customer_id`

## Key Conventions

- **State slugs**: Lowercase hyphenated (e.g., "new-york", "south-carolina"). `lib/states.js` has `stateToSlug()` for converting display names like "New York (NY)" to slugs.
- **Category mapping**: URL uses "dmv"/"cdl"/"moto", DB uses "car"/"cdl"/"motorcycle". Mapped in `test/page.js`.
- **Answer stripping**: Options have prefixes like "A. " stripped with regex `/^[A-DА-Га-гa-d]\.\s*/` throughout the codebase.
- **All client components**: Every page uses `'use client'` with `<Suspense>` wrapper around content that reads `useSearchParams()`.
- **Design palette**: Navy `#0B1C3D`, Blue `#2563EB`, Amber/Pro `#F59E0B`, Gray `#94A3B8`/`#64748B`, Success `#16A34A`, Error `#DC2626`.
- **Mobile-first**: Max width `max-w-lg` for most pages, `max-w-md` for forms.

## Admin

Password-protected admin panel at `/admin` - manages questions (CRUD + CSV bulk upload) and image uploads to Supabase Storage. Auth is via `ADMIN_PASSWORD` env var with rate limiting.

## Content Pipeline (`scripts/`)

Offline tooling for managing the question database. All scripts require `SUPABASE_SERVICE_ROLE_KEY` env var; AI scripts also require `ANTHROPIC_API_KEY`. Scripts use direct Supabase REST API calls (not the JS SDK).

### Manual Pipeline (RAG context for AI)
1. **`download-manuals.js`** - Downloads official driver manual PDFs from state DMV websites, uploads to Supabase Storage bucket `manuals`, creates `manuals-index.json`. Supports `--state=X`, `--check` (verify links), `--dry-run`. Covers ~30 states with multi-language PDFs (CA, WA, PA, IA, MA have the most languages).
2. **`extract-manuals.js`** - Downloads PDFs from Supabase Storage, extracts text via `pdf-parse`, saves to `.manuals-text/{state}-{category}-{lang}.txt`. These text files are used as RAG context by verify-answers and write-explanations.
3. **`upload-local-manuals.js`** - One-time script for uploading locally downloaded manuals (from a zip) to Supabase Storage + extracting text.

### Question Quality Pipeline
4. **`verify-answers.js`** - 4-phase AI verification of all questions:
   - Phase 1: Load all questions for a language from Supabase
   - Phase 2: Haiku batch verification (batches of 10) with manual RAG excerpts. Verdicts: correct/wrong/invalid/uncertain
   - Phase 3: Sonnet escalation for "uncertain" verdicts (must give definitive answer)
   - Phase 4: Write corrections (fix `correct_answer`), deletions (broken questions), and explanations to DB
   - Creates rollback files (`.verify-answers-{lang}-rollback.json`) and reports
   - Usage: `node scripts/verify-answers.js --lang=en` or `--all-langs`, `--dry-run`, `--state=texas`
   - EN stats (32,864 questions): 88.8% correct, 9.3% wrong (fixed), 1.5% invalid (deleted)

5. **`write-explanations.js`** - Generates 1-2 sentence explanations for questions missing them. Uses Haiku with manual RAG context. Writes explanations in the question's language (non-EN questions get English manual as reference).
   - Usage: `node scripts/write-explanations.js --lang=en` or `--all-langs`, `--dry-run`
   - Progress files: `.write-explanations-{lang}-progress.json`

### Question Generation & Images
6. **`generate-questions.js`** - Generate questions using Claude API
7. **`translate-to-ua.js`** - Translate questions to Ukrainian
8. **`upload-to-supabase.js`** - Bulk upload questions from JSON to Supabase
9. **`match-signs-v2.js`** - Match road sign images to questions using Claude vision
10. **`expand-images.js`** - Expand image matching to more questions
11. **`download-signs.js`** / **`download-images.js`** - Download sign/image assets

### Script Conventions
- All scripts support `--dry-run` for preview without DB writes
- Progress files (`.{script}-{lang}-progress.json`) allow resuming interrupted runs
- Concurrent processing with configurable `--concurrency=N` (default 5)
- Rate limit handling: auto-retry on 429 with `retry-after`, wait 60s on 529 (overloaded)
- Manual text (RAG) falls back to English when non-EN manual isn't available

### Manuals Page (`/manuals`)
Separate page for downloading official state driver manual PDFs. Fetches `manuals-index.json` from Supabase Storage to list available PDFs by state/category/language. Has its own i18n (not using `lib/translations.js`).

## Environment Variables

Required for web app: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_PASSWORD`, `NEXT_PUBLIC_SITE_URL`

Required for scripts: `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`
