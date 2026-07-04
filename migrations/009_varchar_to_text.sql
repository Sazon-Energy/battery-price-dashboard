-- Migration: Convert VARCHAR columns to TEXT
-- Description: batteries.name, batteries.supplier, and battery_classes.short_name were
--              created via the Supabase Studio table editor (which defaults new text
--              columns to varchar(n)), unlike every other text column in this schema,
--              which was created via a tracked migration using TEXT explicitly. Postgres
--              stores varchar(n) and text identically internally - there is no
--              performance/storage difference - so the length cap was just an accidental
--              UI default, not a deliberate design decision. Replacing the implicit
--              varchar(n) cap with an explicit CHECK constraint so the length guardrail
--              is visible and independently adjustable instead of hidden in the type.
--              This is a metadata-only change in Postgres (no table rewrite).
-- Date: 2026-07-04

ALTER TABLE batteries ALTER COLUMN name TYPE TEXT;
ALTER TABLE batteries ADD CONSTRAINT batteries_name_length CHECK (length(name) <= 500);

ALTER TABLE batteries ALTER COLUMN supplier TYPE TEXT;
ALTER TABLE batteries ADD CONSTRAINT batteries_supplier_length CHECK (length(supplier) <= 500);

ALTER TABLE battery_classes ALTER COLUMN short_name TYPE TEXT;
ALTER TABLE battery_classes ADD CONSTRAINT battery_classes_short_name_length CHECK (length(short_name) <= 200);
