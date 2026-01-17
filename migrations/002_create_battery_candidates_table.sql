-- Migration: Create battery_candidates table
-- Description: Stores discovered battery products pending review and approval
-- Date: 2026-01-16

CREATE TABLE IF NOT EXISTS battery_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  manufacturer_id UUID NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,

  -- Extracted specifications (stored as JSONB for flexibility)
  extracted_specs JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Discovery metadata
  discovered_price REAL,
  battery_class_id UUID REFERENCES battery_classes(id) ON DELETE SET NULL,
  confidence_score REAL NOT NULL DEFAULT 0.0 CHECK (confidence_score >= 0 AND confidence_score <= 100),

  -- Approval workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  auto_approved BOOLEAN NOT NULL DEFAULT false,
  rejection_reason TEXT,

  -- Links to batteries table (set when approved)
  battery_id UUID REFERENCES batteries(id) ON DELETE SET NULL,

  -- Timestamps
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_battery_candidates_status ON battery_candidates(status);
CREATE INDEX idx_battery_candidates_manufacturer ON battery_candidates(manufacturer_id);
CREATE INDEX idx_battery_candidates_discovered_at ON battery_candidates(discovered_at DESC);
CREATE INDEX idx_battery_candidates_normalized_url ON battery_candidates(normalized_url);
CREATE INDEX idx_battery_candidates_battery_id ON battery_candidates(battery_id);

-- Create GIN index for JSONB specs for efficient querying
CREATE INDEX idx_battery_candidates_specs ON battery_candidates USING GIN (extracted_specs);

-- Add comments
COMMENT ON TABLE battery_candidates IS 'Discovered battery products pending review and approval';
COMMENT ON COLUMN battery_candidates.url IS 'Original product URL as discovered';
COMMENT ON COLUMN battery_candidates.normalized_url IS 'URL with query parameters stripped for deduplication';
COMMENT ON COLUMN battery_candidates.extracted_specs IS 'JSON object with capacity_kwh, power_w, capacity_source, power_source, etc.';
COMMENT ON COLUMN battery_candidates.confidence_score IS 'Discovery confidence (0-100). Higher = more confident. Based on data quality.';
COMMENT ON COLUMN battery_candidates.auto_approved IS 'True if candidate met auto-approval threshold (50% confidence)';
COMMENT ON COLUMN battery_candidates.battery_id IS 'Set to batteries.id when candidate is approved and added to tracking';

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_battery_candidates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER battery_candidates_updated_at
  BEFORE UPDATE ON battery_candidates
  FOR EACH ROW
  EXECUTE FUNCTION update_battery_candidates_updated_at();

-- Example extracted_specs structure:
-- {
--   "capacity_kwh": 3.84,
--   "capacity_source": "product_name",
--   "capacity_matched": "3,840Wh",
--   "capacity_priority": 100,
--   "power_w": 3800,
--   "power_source": "body_text",
--   "power_matched": "3800W",
--   "power_priority": 10
-- }
