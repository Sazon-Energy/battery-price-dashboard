-- Migration: Create price_extraction_failures table
-- Description: Logs cases where discovery found a valid battery product page but
--              the price extractor could not find a price. These are reviewed
--              periodically to fix scrapers or manually add the battery.
-- Date: 2026-05-12

CREATE TABLE IF NOT EXISTS price_extraction_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  manufacturer_id UUID REFERENCES manufacturers(id) ON DELETE CASCADE,
  product_name TEXT,
  extracted_specs JSONB DEFAULT '{}'::jsonb,
  failure_reason TEXT NOT NULL DEFAULT 'no_price_extracted',
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_price_failures_manufacturer ON price_extraction_failures(manufacturer_id);
CREATE INDEX idx_price_failures_attempted_at ON price_extraction_failures(attempted_at DESC);
CREATE INDEX idx_price_failures_normalized_url ON price_extraction_failures(normalized_url);

COMMENT ON TABLE price_extraction_failures IS
  'Logged when discovery identifies a battery product page but the price scraper cannot extract a price. Used to track which known-battery URLs need scraper improvements.';
COMMENT ON COLUMN price_extraction_failures.failure_reason IS
  'Why price extraction failed. Common values: no_price_extracted, scrape_error.';
