-- Migration: Add scrape_verified flag to manufacturers
-- Description: Separates "user wants discovery enabled" (enabled) from
--              "price scraper has been verified to work on this manufacturer's pages" (scrape_verified).
--              Discovery only runs where BOTH are true.
-- Date: 2026-05-12

ALTER TABLE manufacturers
  ADD COLUMN IF NOT EXISTS scrape_verified BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN manufacturers.scrape_verified IS
  'True only if the price scraper has been validated against this manufacturer''s product pages. Discovery runs only where enabled AND scrape_verified.';

-- Seed: based on Phase 2.7 status (Anker and EcoFlow have working scrapers)
UPDATE manufacturers SET scrape_verified = true  WHERE name IN ('Anker', 'EcoFlow');
UPDATE manufacturers SET scrape_verified = false WHERE name IN ('Jackery', 'Bluetti', 'Goal Zero');
