# Candidate Review Workflow Guide

## Overview
This guide explains the streamlined workflow for reviewing and approving battery candidates discovered by the automated crawler.

## What Changed

### 1. Simplified Database Schema
**File:** `migrations/005_remove_cross_references.sql`

Removed unnecessary cross-references between `battery_candidates` and `batteries` tables:
- Removed `battery_candidates.battery_id` (no need to track which battery was created)
- Removed `batteries.candidate_id` (no need to track source candidate)
- Removed `batteries.discovered_by` (not actively used)

**Rationale:** Candidates are uniquely identified by `normalized_url`. This is sufficient for any needed mapping. The candidate review process is one-time: discover → review → approve/reject → copy to batteries.

### 2. Web UI for Candidate Review
**URL:** `http://localhost:3000/candidates` (or your deployed domain)

A simple, read-only page that shows:
- Only pending candidates (filtered automatically)
- Sorted by discovery time (oldest first)
- Columns: ID, Manufacturer, Battery Name (clickable link), Discovery Time
- Discovery time is automatically localized to your browser's timezone

### 3. Batch SQL Operations
**File:** `migrations/BATCH_OPERATIONS.sql`

Three different methods for batch approval/rejection, choose what works best:

#### Method 1: PostgreSQL ARRAY (Recommended - Easiest)
```sql
UPDATE battery_candidates
SET status = 'approved', reviewed_at = NOW()
WHERE id = ANY(ARRAY[
  'uuid-1'::uuid,
  'uuid-2'::uuid,
  'uuid-3'::uuid
]::uuid[]);
```

#### Method 2: IN Clause (Good for spreadsheet exports)
```sql
UPDATE battery_candidates
SET status = 'approved', reviewed_at = NOW()
WHERE id IN (
  'uuid-1',
  'uuid-2',
  'uuid-3'
);
```

#### Method 3: Temporary Table (Best for large batches)
```sql
CREATE TEMP TABLE candidates_to_approve (id UUID);
INSERT INTO candidates_to_approve (id) VALUES ('uuid-1'), ('uuid-2');
UPDATE battery_candidates
SET status = 'approved', reviewed_at = NOW()
WHERE id IN (SELECT id FROM candidates_to_approve);
DROP TABLE candidates_to_approve;
```

## Complete Workflow

### Step 1: Apply Database Changes
Run the schema migration in Supabase SQL Editor:
```bash
# In Supabase SQL Editor, run:
migrations/005_remove_cross_references.sql
```

### Step 2: Review Candidates in Web UI
1. Navigate to `/candidates` page
2. Review the list of pending candidates
3. Click on battery names to view product pages
4. Note the IDs of candidates you want to approve or reject

### Step 3: Export IDs from Supabase
In Supabase SQL Editor:
1. Run a query to get IDs:
   ```sql
   SELECT id FROM battery_candidates WHERE status = 'pending' ORDER BY discovered_at;
   ```
2. Select the candidates you want to approve/reject
3. Copy the IDs

### Step 4: Batch Update Status
1. Open `migrations/BATCH_OPERATIONS.sql`
2. Choose your preferred method (Method 1 recommended)
3. Paste your candidate IDs
4. Run in Supabase SQL Editor to approve or reject

### Step 5: Copy Approved to Batteries Table
After approving candidates, run this SQL to copy them to the batteries table:
```sql
INSERT INTO batteries (name, target_url, supplier, battery_class_id, current_price, created_at, updated_at)
SELECT
  c.name,
  c.normalized_url as target_url,
  m.name as supplier,
  c.battery_class_id,
  c.discovered_price as current_price,
  NOW(), NOW()
FROM battery_candidates c
JOIN manufacturers m ON m.id = c.manufacturer_id
WHERE c.status = 'approved'
  AND NOT EXISTS (SELECT 1 FROM batteries b WHERE b.target_url = c.normalized_url);
```

### Step 6: Verify
Check your work:
```sql
-- Count by status
SELECT status, COUNT(*) FROM battery_candidates GROUP BY status;

-- Find approved candidates not yet copied
SELECT c.id, c.name FROM battery_candidates c
WHERE c.status = 'approved'
  AND NOT EXISTS (SELECT 1 FROM batteries b WHERE b.url = c.normalized_url);
```

## Tips for Efficiency

1. **Review in batches:** Group similar manufacturers or battery types together
2. **Use the ARRAY method:** Fastest for small-to-medium batches (< 50 IDs)
3. **Use temporary tables:** Best for large batches (> 50 IDs)
4. **Set rejection reasons:** Add meaningful rejection reasons for future reference
5. **Copy to batteries immediately:** Run the copy SQL right after approval to keep things clean

## Utility Queries

All utility queries are in `migrations/BATCH_OPERATIONS.sql`:
- Count candidates by status
- View pending candidates
- Find approved candidates not copied
- Check for duplicate URLs

## Next Steps

After this workflow is working well, consider:
- Adding batch selection UI (checkboxes in web interface)
- Creating API endpoints for approve/reject
- Adding bulk actions directly in the web UI
- Automating the copy-to-batteries step after approval
