-- Migration: Update batteries table
-- Description: Add columns to track discovery source and link to candidates
-- Date: 2026-01-16

-- Add candidate_id column to link batteries to their discovery candidate
ALTER TABLE batteries
ADD COLUMN IF NOT EXISTS candidate_id UUID REFERENCES battery_candidates(id) ON DELETE SET NULL;

-- Add discovered_by column to track how battery was added
ALTER TABLE batteries
ADD COLUMN IF NOT EXISTS discovered_by TEXT DEFAULT 'manual' CHECK (discovered_by IN ('manual', 'auto'));

-- Create index for candidate lookups
CREATE INDEX IF NOT EXISTS idx_batteries_candidate_id ON batteries(candidate_id);

-- Create index for filtering by discovery method
CREATE INDEX IF NOT EXISTS idx_batteries_discovered_by ON batteries(discovered_by);

-- Add comments
COMMENT ON COLUMN batteries.candidate_id IS 'Reference to battery_candidates.id if battery was discovered automatically';
COMMENT ON COLUMN batteries.discovered_by IS 'How battery was added: "manual" (user added) or "auto" (discovered by crawler)';

-- Update existing batteries to be marked as manual
UPDATE batteries
SET discovered_by = 'manual'
WHERE discovered_by IS NULL;

-- Make discovered_by NOT NULL after setting defaults
ALTER TABLE batteries
ALTER COLUMN discovered_by SET NOT NULL;
