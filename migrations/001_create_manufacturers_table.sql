-- Migration: Create manufacturers table
-- Description: Stores battery manufacturer information for automated discovery
-- Date: 2026-01-16

CREATE TABLE IF NOT EXISTS manufacturers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  catalog_url TEXT NOT NULL,
  include_keywords TEXT[] NOT NULL DEFAULT '{}',
  exclude_keywords TEXT[] NOT NULL DEFAULT '{}',
  min_capacity_kwh REAL NOT NULL DEFAULT 1.0,
  max_capacity_kwh REAL NOT NULL DEFAULT 15.0,
  last_searched_at TIMESTAMPTZ,
  last_products_found INTEGER DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on enabled manufacturers for faster queries
CREATE INDEX idx_manufacturers_enabled ON manufacturers(enabled);

-- Create index on last_searched_at for scheduling
CREATE INDEX idx_manufacturers_last_searched ON manufacturers(last_searched_at);

-- Insert seed data for tested manufacturers
INSERT INTO manufacturers (
  name,
  domain,
  catalog_url,
  include_keywords,
  exclude_keywords,
  min_capacity_kwh,
  max_capacity_kwh,
  enabled,
  notes
) VALUES
(
  'Anker',
  'ankersolix.com',
  'https://www.ankersolix.com/collections/power-stations',
  ARRAY['portable power station', 'power station', 'kwh', 'wh', 'solix'],
  ARRAY['solar generator', 'expansion', 'expansion pack', 'add-on', 'bundle', 'kit', 'solar panel', 'accessory'],
  1.0,
  15.0,
  true,
  'POC validated: 100% discovery rate, 100% capacity accuracy (capacity in product names)'
),
(
  'EcoFlow',
  'us.ecoflow.com',
  'https://us.ecoflow.com/collections/portable-power-stations',
  ARRAY['portable power station', 'power station', 'kwh', 'wh', 'delta', 'river'],
  ARRAY['solar generator', 'expansion', 'expansion battery', 'add-on', 'bundle', 'kit', 'solar panel', 'accessory', 'smart plug'],
  1.0,
  15.0,
  true,
  'POC validated: 100% discovery rate, ~70% capacity accuracy (capacity often in body text, not product names)'
),
(
  'Jackery',
  'jackery.com',
  'https://www.jackery.com/collections/portable-power-stations',
  ARRAY['portable power station', 'power station', 'kwh', 'wh', 'explorer'],
  ARRAY['solar generator', 'expansion', 'expansion battery', 'add-on', 'bundle', 'kit', 'solar panel', 'accessory'],
  1.0,
  15.0,
  false,
  'Not yet tested - enable when ready to start discovery'
),
(
  'Bluetti',
  'bluettipower.com',
  'https://www.bluettipower.com/collections/portable-power-stations',
  ARRAY['portable power station', 'power station', 'kwh', 'wh', 'ac', 'eb'],
  ARRAY['solar generator', 'expansion', 'expansion battery', 'add-on', 'bundle', 'kit', 'solar panel', 'accessory'],
  1.0,
  15.0,
  false,
  'Not yet tested - enable when ready to start discovery'
),
(
  'Goal Zero',
  'goalzero.com',
  'https://www.goalzero.com/collections/portable-power-stations',
  ARRAY['portable power station', 'power station', 'kwh', 'wh', 'yeti'],
  ARRAY['solar generator', 'expansion', 'expansion battery', 'add-on', 'bundle', 'kit', 'solar panel', 'accessory', 'tank'],
  1.0,
  15.0,
  false,
  'Not yet tested - enable when ready to start discovery'
);

-- Add comment to table
COMMENT ON TABLE manufacturers IS 'Battery manufacturers for automated product discovery';
COMMENT ON COLUMN manufacturers.include_keywords IS 'Keywords that must be found on product pages (checked in entire page content)';
COMMENT ON COLUMN manufacturers.exclude_keywords IS 'Keywords that disqualify products (checked only in product title/description to avoid false positives)';
COMMENT ON COLUMN manufacturers.min_capacity_kwh IS 'Minimum battery capacity to track (default 1.0 kWh)';
COMMENT ON COLUMN manufacturers.max_capacity_kwh IS 'Maximum battery capacity to track (default 15.0 kWh, excludes large systems with expansions)';
COMMENT ON COLUMN manufacturers.last_products_found IS 'Number of products found in last discovery run (alert if 0)';
