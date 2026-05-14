-- Migration 005: Delete orphan CDL translation rows
-- Created: 2026-05-14
--
-- After Migration 004 (cluster_code rename) and Variant C smart-match
-- (resolve-variant-c.js), some non-EN CDL rows point to cluster_codes
-- that no longer have a matching EN parent in the same (state, subcategory)
-- namespace. These orphan rows are:
--   1. Translations from before subcategory split (old wa_cdl_001 format
--      whose ENs have all been renamed to wa_cdl_gk_001 etc.)
--   2. Translations Sonnet could not confidently smart-match in Variant C
--      resolution (still pointing at the old shared cluster_code)
--   3. Translations of ENs that have been deleted at some earlier point
--
-- These rows are invisible to end users (the test page fetches questions
-- by cluster_code+state+language; if no EN sibling exists, nothing to
-- render). They waste storage and pollute admin views.
--
-- Preflight 2026-05-14 counted 9,288 orphan rows across ru/es/zh/ua.

DELETE FROM questions q
WHERE q.category = 'cdl'
  AND q.language <> 'en'
  AND q.cluster_code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM questions en
    WHERE en.category = 'cdl'
      AND en.language = 'en'
      AND en.cluster_code = q.cluster_code
      AND en.state = q.state
      AND (
        (q.subcategory IS NULL AND en.subcategory IS NULL)
        OR (q.subcategory IS NOT NULL AND en.subcategory = q.subcategory)
      )
  );

-- Reload PostgREST cache
NOTIFY pgrst, 'reload schema';

-- ─── Verification (run after applying) ─────────────────────────────────────

-- Should return 0 for all langs:
-- SELECT q.language, COUNT(*) AS orphans
-- FROM questions q
-- WHERE q.category='cdl' AND q.language<>'en' AND q.cluster_code IS NOT NULL
--   AND NOT EXISTS (
--     SELECT 1 FROM questions en
--     WHERE en.category='cdl' AND en.language='en'
--       AND en.cluster_code = q.cluster_code AND en.state = q.state
--       AND ((q.subcategory IS NULL AND en.subcategory IS NULL)
--            OR (q.subcategory IS NOT NULL AND en.subcategory = q.subcategory))
--   )
-- GROUP BY q.language
-- ORDER BY q.language;
