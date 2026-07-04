-- Migration: Add batteries.manufacturer_id FK, normalizing manufacturer identity
-- Description: batteries.supplier is free TEXT duplicating the manufacturer_id FK
--              relationship that battery_candidates already models properly. It has
--              already drifted: 'Growatt' exists in batteries.supplier with no
--              matching manufacturers row (added manually, not via the discovery
--              pipeline). This migration inserts the missing Growatt row, backfills
--              manufacturer_id by matching supplier text to manufacturers.name, and
--              adds the FK going forward. supplier is kept as a denormalized
--              display-convenience column (read directly in app/page.js);
--              manufacturer_id is the authoritative source of truth if the two ever
--              diverge again.
-- Date: 2026-07-04

-- 1. Insert the missing Growatt manufacturer row. domain/catalog_url are placeholders
--    pending confirmation - correct before enabling discovery for this manufacturer.
INSERT INTO manufacturers (name, domain, catalog_url, enabled, scrape_verified, notes)
VALUES (
  'Growatt',
  'growatt.com',
  'https://www.growatt.com',
  false,
  false,
  'Added retroactively during schema cleanup to match an existing batteries.supplier value that had no manufacturers row. domain/catalog_url are placeholders - verify before enabling discovery.'
)
ON CONFLICT (name) DO NOTHING;

-- 2. Add the FK column (nullable - mirrors battery_class_id's nullability pattern).
ALTER TABLE batteries
  ADD COLUMN IF NOT EXISTS manufacturer_id UUID REFERENCES manufacturers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_batteries_manufacturer_id ON batteries(manufacturer_id);

-- 3. Backfill by matching existing free-text supplier to manufacturers.name.
UPDATE batteries b
SET manufacturer_id = m.id
FROM manufacturers m
WHERE b.supplier = m.name
  AND b.manufacturer_id IS NULL;

COMMENT ON COLUMN batteries.manufacturer_id IS
  'Authoritative FK to manufacturers. batteries.supplier is kept as a denormalized
   display-convenience copy of manufacturers.name - if they ever diverge, trust
   manufacturer_id.';
COMMENT ON COLUMN batteries.supplier IS
  'Denormalized display copy of manufacturers.name (see manufacturer_id for the
   authoritative FK). Kept to avoid a join rewrite in app/page.js.';
