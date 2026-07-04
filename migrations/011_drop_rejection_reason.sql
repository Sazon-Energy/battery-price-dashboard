-- Migration: Drop battery_candidates.rejection_reason
-- Description: Half-finished feature - app/api/candidates/reject/route.js accepted
--              and stored a reason, but the review UI (app/candidates/page.js) never
--              collected one from the reviewer. Only 1 of 61 rejected candidates ever
--              had a value ("Not a battery." on "EcoFlow Smart Generator"), set
--              manually outside the app. Removing rather than finishing the feature.
-- Date: 2026-07-04

ALTER TABLE battery_candidates DROP COLUMN IF EXISTS rejection_reason;
