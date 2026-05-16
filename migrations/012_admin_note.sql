-- Migration 012: admin_note column on questions
-- Created: 2026-05-15
--
-- Free-form note attached to an EN cluster row. Used to record what an admin
-- changed and why (e.g. "2026-05-15: rewrote per WA CDL manual rev 2025-04").
-- Stored on every language row but only edited via the EN editor; non-EN rows
-- inherit nothing automatically.

ALTER TABLE questions ADD COLUMN IF NOT EXISTS admin_note TEXT;

-- Partial index — most rows have no note, only index the ones that do
CREATE INDEX IF NOT EXISTS idx_questions_admin_note
  ON questions (cluster_code)
  WHERE admin_note IS NOT NULL;

NOTIFY pgrst, 'reload schema';
