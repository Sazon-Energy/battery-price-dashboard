-- =============================================================================
-- BATCH CANDIDATE OPERATIONS
-- =============================================================================
-- Use these SQL templates to efficiently approve or reject multiple candidates
--
-- WORKFLOW:
-- 1. Review candidates at: http://localhost:3000/candidates (or your deployed URL)
-- 2. In Supabase SQL Editor, export IDs of candidates to approve/reject
-- 3. Paste IDs into the appropriate template below
-- 4. Run the SQL to update all candidates in one command
-- =============================================================================

-- -----------------------------------------------------------------------------
-- METHOD 1: PostgreSQL ARRAY (Easiest - Just paste UUIDs between the braces)
-- -----------------------------------------------------------------------------

-- APPROVE multiple candidates (PostgreSQL array syntax)
-- Just paste your UUIDs between the { } braces, separated by commas
UPDATE battery_candidates
SET
  status = 'approved',
  reviewed_at = NOW()
WHERE id = ANY(ARRAY[
  'uuid-1-here'::uuid,
  'uuid-2-here'::uuid,
  'uuid-3-here'::uuid
]::uuid[]);

-- REJECT multiple candidates (PostgreSQL array syntax)
-- Add rejection reason if desired
UPDATE battery_candidates
SET
  status = 'rejected',
  reviewed_at = NOW(),
  rejection_reason = 'Does not meet criteria'  -- Optional: customize or remove this line
WHERE id = ANY(ARRAY[
  'uuid-1-here'::uuid,
  'uuid-2-here'::uuid,
  'uuid-3-here'::uuid
]::uuid[]);

-- -----------------------------------------------------------------------------
-- METHOD 2: IN Clause (Good for copy-paste from spreadsheet)
-- -----------------------------------------------------------------------------

-- APPROVE using IN clause
UPDATE battery_candidates
SET
  status = 'approved',
  reviewed_at = NOW()
WHERE id IN (
  'uuid-1-here',
  'uuid-2-here',
  'uuid-3-here'
);

-- REJECT using IN clause
UPDATE battery_candidates
SET
  status = 'rejected',
  reviewed_at = NOW(),
  rejection_reason = 'Does not meet criteria'
WHERE id IN (
  'uuid-1-here',
  'uuid-2-here',
  'uuid-3-here'
);

-- -----------------------------------------------------------------------------
-- METHOD 3: Temporary Table (Best for large batches from CSV export)
-- -----------------------------------------------------------------------------

-- Step 1: Create temp table and load IDs
CREATE TEMP TABLE candidates_to_approve (id UUID);

-- Step 2: Insert IDs (paste as many as needed)
INSERT INTO candidates_to_approve (id) VALUES
  ('uuid-1-here'),
  ('uuid-2-here'),
  ('uuid-3-here');

-- Step 3: Approve all at once
UPDATE battery_candidates
SET
  status = 'approved',
  reviewed_at = NOW()
WHERE id IN (SELECT id FROM candidates_to_approve);

-- Step 4: Clean up
DROP TABLE candidates_to_approve;

-- For rejection, use same pattern:
CREATE TEMP TABLE candidates_to_reject (id UUID);
INSERT INTO candidates_to_reject (id) VALUES
  ('uuid-1-here'),
  ('uuid-2-here');
UPDATE battery_candidates
SET
  status = 'rejected',
  reviewed_at = NOW(),
  rejection_reason = 'Does not meet criteria'
WHERE id IN (SELECT id FROM candidates_to_reject);
DROP TABLE candidates_to_reject;

-- -----------------------------------------------------------------------------
-- COPY APPROVED CANDIDATES TO BATTERIES TABLE
-- -----------------------------------------------------------------------------
-- After approving candidates, use this to copy them to the batteries table
-- This inserts all approved candidates that haven't been copied yet

INSERT INTO batteries (
  name,
  target_url,
  supplier,
  battery_class_id,
  current_price,
  created_at,
  updated_at
)
SELECT
  c.name,
  c.normalized_url as target_url,
  m.name as supplier,
  c.battery_class_id,
  c.discovered_price as current_price,
  NOW() as created_at,
  NOW() as updated_at
FROM battery_candidates c
JOIN manufacturers m ON m.id = c.manufacturer_id
WHERE c.status = 'approved'
  -- Only copy candidates that don't already exist in batteries
  -- (match by normalized URL to avoid duplicates)
  AND NOT EXISTS (
    SELECT 1 FROM batteries b
    WHERE b.target_url = c.normalized_url
  );

-- -----------------------------------------------------------------------------
-- UTILITY QUERIES
-- -----------------------------------------------------------------------------

-- Count candidates by status
SELECT status, COUNT(*)
FROM battery_candidates
GROUP BY status
ORDER BY status;

-- View pending candidates (oldest first)
SELECT
  id,
  name,
  manufacturers.name as manufacturer,
  discovered_at,
  confidence_score
FROM battery_candidates
JOIN manufacturers ON manufacturers.id = battery_candidates.manufacturer_id
WHERE status = 'pending'
ORDER BY discovered_at ASC
LIMIT 20;

-- Find approved candidates not yet copied to batteries
SELECT
  c.id,
  c.name,
  m.name as manufacturer,
  c.normalized_url
FROM battery_candidates c
JOIN manufacturers m ON m.id = c.manufacturer_id
WHERE c.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM batteries b WHERE b.target_url = c.normalized_url
  )
ORDER BY c.reviewed_at DESC;

-- Verify no duplicate URLs before copying to batteries
SELECT normalized_url, COUNT(*) as count
FROM battery_candidates
WHERE status = 'approved'
GROUP BY normalized_url
HAVING COUNT(*) > 1;
