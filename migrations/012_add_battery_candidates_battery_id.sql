-- Migration: Reintroduce battery_candidates.battery_id (one-directional link)
-- Description: Migration 005 removed the bidirectional link between batteries and
--              battery_candidates, reasoning that normalized_url matching was
--              sufficient. In practice this breaks: correcting a batteries.target_url
--              after a manufacturer changes a URL slug (observed: EcoFlow
--              "-special-offer" -> "-flash-sale") silently orphans any downstream
--              matching against the old URL, even though
--              battery_candidates.normalized_url (never touched post-approval) still
--              correctly identifies the origin candidate. Adding back ONLY the
--              candidates -> batteries direction (not batteries -> candidates, which
--              was the redundant half migration 005 objected to).
-- Date: 2026-07-04

ALTER TABLE battery_candidates
  ADD COLUMN IF NOT EXISTS battery_id UUID REFERENCES batteries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_battery_candidates_battery_id ON battery_candidates(battery_id);

COMMENT ON COLUMN battery_candidates.battery_id IS
  'The batteries row this candidate became after approval, if any. Set at approval
   time in app/api/candidates/approve/route.js. NULL for rejected/pending candidates
   and for historical approved candidates that predate this column where best-effort
   URL backfill (below) could not find a match.';

-- Best-effort backfill for historical approved candidates that predate this column.
-- Matches only where normalized_url still coincidentally equals the current
-- target_url; any battery whose target_url was corrected/changed since approval will
-- NOT match here and battery_id will legitimately remain NULL (no data invented).
UPDATE battery_candidates bc
SET battery_id = b.id
FROM batteries b
WHERE bc.status = 'approved'
  AND bc.battery_id IS NULL
  AND bc.normalized_url = b.target_url;
