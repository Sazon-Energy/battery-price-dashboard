-- Migration: Remove confidence scoring and auto-approval columns
-- Description: confidence_score and auto_approved were added for a
--               confidence-based auto-approval flow that was never built -
--               every candidate has always required manual review, and
--               auto_approved has never been set to true anywhere in the
--               codebase. Removing the unused columns.
-- Date: 2026-07-03

ALTER TABLE battery_candidates DROP COLUMN IF EXISTS confidence_score;
ALTER TABLE battery_candidates DROP COLUMN IF EXISTS auto_approved;
