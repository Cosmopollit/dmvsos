-- Migration 004: CDL cluster code cleanup
-- Created: 2026-05-14
--
-- Three-part cleanup of CDL `cluster_code` namespace:
--
-- 4.1  Backfill `subcategory` on non-EN translation rows where the EN
--      parent has a single, unambiguous subcategory for that
--      (state, cluster_code) pair. Pre-step required before 4.2.
--
-- 4.2  Rename cluster_code to include a subcategory token so that the
--      same numeric slot no longer collides across CDL subtests:
--        wa_cdl_001 (general_knowledge) → wa_cdl_gk_001
--        wa_cdl_001 (air_brakes)        → wa_cdl_ab_001
--        wa_cdl_001 (combination_vehs)  → wa_cdl_cv_001
--      Resolves Variant A duplicates per audit 2026-05-14.
--
-- 4.3  Delete Variant B identical duplicates in CDL general_knowledge.
--      Two EN rows with same cluster_code AND identical question_text.
--      Keeps the newest (highest id when sorted), deletes the rest, plus
--      any non-EN siblings that pointed to the deleted EN.
--
-- Variant C (different questions sharing the same subcat cluster_code)
-- is NOT handled here — it requires Sonnet smart-match and runs as a
-- separate Node script after this migration applies.

-- ─── 4.1  Backfill subcategory on translations ─────────────────────────────

WITH en_unambiguous AS (
  SELECT cluster_code, state, MIN(subcategory) AS subcategory
  FROM questions
  WHERE category = 'cdl'
    AND language = 'en'
    AND cluster_code IS NOT NULL
    AND subcategory IS NOT NULL
  GROUP BY cluster_code, state
  HAVING COUNT(DISTINCT subcategory) = 1
)
UPDATE questions q
SET subcategory = en.subcategory
FROM en_unambiguous en
WHERE q.category = 'cdl'
  AND q.language <> 'en'
  AND q.subcategory IS NULL
  AND q.cluster_code = en.cluster_code
  AND q.state = en.state;

-- ─── 4.2  Rename cluster_codes (Variant A resolution) ──────────────────────
-- Filter pattern matches only the old format: state + _cdl_ + digits.
-- Already-renamed rows (containing `_gk_` / `_ab_` / `_cv_`) are skipped
-- naturally by the regex.

UPDATE questions
SET cluster_code = regexp_replace(cluster_code, '^([a-z]{2})_cdl_([0-9]+)$', '\1_cdl_gk_\2')
WHERE category = 'cdl'
  AND subcategory = 'general_knowledge'
  AND cluster_code ~ '^[a-z]{2}_cdl_[0-9]+$';

UPDATE questions
SET cluster_code = regexp_replace(cluster_code, '^([a-z]{2})_cdl_([0-9]+)$', '\1_cdl_ab_\2')
WHERE category = 'cdl'
  AND subcategory = 'air_brakes'
  AND cluster_code ~ '^[a-z]{2}_cdl_[0-9]+$';

UPDATE questions
SET cluster_code = regexp_replace(cluster_code, '^([a-z]{2})_cdl_([0-9]+)$', '\1_cdl_cv_\2')
WHERE category = 'cdl'
  AND subcategory = 'combination_vehicles'
  AND cluster_code ~ '^[a-z]{2}_cdl_[0-9]+$';

-- ─── 4.3  Delete Variant B (identical duplicates in general_knowledge) ─────
-- Strategy:
--   1. Find groups of EN rows sharing (state, cluster_code) AND
--      identical question_text in general_knowledge.
--   2. Keep one row per group (the one with the lexicographically largest
--      id — stable choice), mark the rest for deletion.
--   3. Cascade-delete all non-EN siblings whose (state, cluster_code)
--      matches a deleted EN's old key. Since the EN survives in the
--      same cluster_code, the surviving non-EN siblings still pair
--      correctly — we only drop true duplicate non-EN rows
--      (same state+cluster_code+language with multiple rows).

WITH duplicate_en AS (
  SELECT
    id,
    state,
    cluster_code,
    question_text,
    language,
    ROW_NUMBER() OVER (
      PARTITION BY state, cluster_code, question_text
      ORDER BY id DESC                  -- keep newest, delete older
    ) AS rn
  FROM questions
  WHERE category    = 'cdl'
    AND subcategory = 'general_knowledge'
    AND language    = 'en'
    AND cluster_code IS NOT NULL
)
DELETE FROM questions
WHERE id IN (SELECT id FROM duplicate_en WHERE rn > 1);

-- Same logic for any duplicate translation rows in general_knowledge
-- (same state+cluster_code+language with >1 row).
WITH duplicate_tr AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY state, cluster_code, language
      ORDER BY id DESC
    ) AS rn
  FROM questions
  WHERE category    = 'cdl'
    AND subcategory = 'general_knowledge'
    AND language   <> 'en'
    AND cluster_code IS NOT NULL
)
DELETE FROM questions
WHERE id IN (SELECT id FROM duplicate_tr WHERE rn > 1);

-- ─── Reload PostgREST schema cache (no schema change but safe to reload) ──

NOTIFY pgrst, 'reload schema';

-- ─── Verification queries (run after applying) ─────────────────────────────

-- 1. How many CDL rows now have new-format cluster_code per subcategory
-- SELECT subcategory,
--        COUNT(*) FILTER (WHERE cluster_code LIKE '%_cdl_gk_%') AS gk_named,
--        COUNT(*) FILTER (WHERE cluster_code LIKE '%_cdl_ab_%') AS ab_named,
--        COUNT(*) FILTER (WHERE cluster_code LIKE '%_cdl_cv_%') AS cv_named,
--        COUNT(*) FILTER (WHERE cluster_code ~ '^[a-z]{2}_cdl_[0-9]+$') AS still_old_format
-- FROM questions
-- WHERE category = 'cdl'
-- GROUP BY subcategory
-- ORDER BY subcategory;

-- 2. Remaining null-subcategory CDL translation rows (Variant A orphans)
-- SELECT language, COUNT(*)
-- FROM questions
-- WHERE category = 'cdl'
--   AND subcategory IS NULL
--   AND language <> 'en'
--   AND cluster_code IS NOT NULL
-- GROUP BY language
-- ORDER BY language;

-- 3. Any remaining Variant B identical-text dups in general_knowledge
-- SELECT state, cluster_code, COUNT(*) AS dups
-- FROM questions
-- WHERE category='cdl' AND subcategory='general_knowledge' AND language='en'
-- GROUP BY state, cluster_code, question_text
-- HAVING COUNT(*) > 1
-- LIMIT 20;
