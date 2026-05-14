-- Migration 003: Question quality verification + admin v2 support
-- Created: 2026-05-14

-- ─── new columns ───────────────────────────────────────────────────────────

ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality_score        SMALLINT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality_issues       TEXT[];
ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality_verified_at  TIMESTAMPTZ;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS translation_stale_at TIMESTAMPTZ;

-- ─── CHECK constraint ──────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questions_quality_score_range') THEN
    ALTER TABLE questions
      ADD CONSTRAINT questions_quality_score_range
      CHECK (quality_score IS NULL OR quality_score BETWEEN 1 AND 5);
  END IF;
END $$;

-- ─── indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_questions_state_cat_sub_lang
  ON questions (state, category, subcategory, language);

CREATE INDEX IF NOT EXISTS idx_questions_cluster_code
  ON questions (cluster_code)
  WHERE cluster_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_questions_quality_score
  ON questions (quality_score)
  WHERE quality_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_questions_translation_stale
  ON questions (translation_stale_at)
  WHERE translation_stale_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_questions_quality_verified_at
  ON questions (quality_verified_at)
  WHERE quality_verified_at IS NOT NULL;

-- ─── reload PostgREST schema cache ─────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
