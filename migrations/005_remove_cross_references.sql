-- Migration: Remove cross-reference columns between candidates and batteries
-- Description: Simplify schema by removing unused bidirectional references
-- Date: 2026-01-18

-- Remove battery_id from battery_candidates
-- (No need to track which battery was created from candidate)
DROP INDEX IF EXISTS idx_battery_candidates_battery_id;
ALTER TABLE battery_candidates
DROP COLUMN IF EXISTS battery_id;

-- Remove candidate_id and discovered_by from batteries
-- (No need to track which candidate created the battery)
DROP INDEX IF EXISTS idx_batteries_candidate_id;
DROP INDEX IF EXISTS idx_batteries_discovered_by;
ALTER TABLE batteries
DROP COLUMN IF EXISTS candidate_id,
DROP COLUMN IF EXISTS discovered_by;

-- Rationale:
-- Candidates are uniquely identified by normalized_url
-- This is sufficient for mapping between tables if needed
-- Candidates flow: discover → review → approve/reject → copy to batteries (one-time)
-- No ongoing relationship needed after approval
