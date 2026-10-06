-- Migration: Explicit continuous / peak / surge power on classes and batteries
-- Description: battery_classes had only cpower_w (continuous) and ppower_w (shown as
--              "peak", but hand-entered from figures most product pages call "surge").
--              Peak (sustained for seconds) and surge (momentary, e.g. motor start)
--              are different specs, so each gets its own column.
--
--              battery_classes:
--                - cpower_w  -> continuous_power_w (stays NOT NULL; the only required
--                               value besides the name)
--                - ppower_w  -> surge_power_w (existing values move to surge), now nullable
--                - new peak_power_w, nullable (unknown for existing classes)
--                - capacity_kwh becomes nullable
--
--              batteries gains the same specs, all nullable for now: no battery has
--              them on its own row yet (discovered specs live in
--              battery_candidates.extracted_specs). The app marks continuous power as
--              required wherever a battery's specs are edited; tighten to NOT NULL in
--              a later migration once every battery has a value.
--
--              Columns are renamed rather than copied, so deploy the matching app
--              code immediately after running this.
-- Date: 2026-10-06

BEGIN;

-- 1. battery_classes: rename to descriptive names.
ALTER TABLE battery_classes RENAME COLUMN cpower_w TO continuous_power_w;
ALTER TABLE battery_classes RENAME COLUMN ppower_w TO surge_power_w;

-- 2. battery_classes: only continuous power (and the name) stay required.
ALTER TABLE battery_classes ALTER COLUMN surge_power_w DROP NOT NULL;
ALTER TABLE battery_classes ALTER COLUMN capacity_kwh DROP NOT NULL;
ALTER TABLE battery_classes ADD COLUMN IF NOT EXISTS peak_power_w INTEGER;

-- 3. batteries: per-battery specs, nullable until backfilled.
ALTER TABLE batteries ADD COLUMN IF NOT EXISTS capacity_kwh NUMERIC;
ALTER TABLE batteries ADD COLUMN IF NOT EXISTS continuous_power_w INTEGER;
ALTER TABLE batteries ADD COLUMN IF NOT EXISTS peak_power_w INTEGER;
ALTER TABLE batteries ADD COLUMN IF NOT EXISTS surge_power_w INTEGER;

COMMENT ON COLUMN battery_classes.continuous_power_w IS
  'Continuous (rated) output in watts. Required.';
COMMENT ON COLUMN battery_classes.peak_power_w IS
  'Peak output in watts, sustained for seconds. NULL = unknown.';
COMMENT ON COLUMN battery_classes.surge_power_w IS
  'Surge output in watts, momentary (e.g. motor start). NULL = unknown. Pre-2026-10 values came from ppower_w.';
COMMENT ON COLUMN battery_classes.capacity_kwh IS
  'Capacity in kilowatt-hours. NULL = unknown.';

COMMENT ON COLUMN batteries.capacity_kwh IS
  'Capacity in kilowatt-hours. NULL = not yet recorded.';
COMMENT ON COLUMN batteries.continuous_power_w IS
  'Continuous (rated) output in watts. Required by the app UI; nullable in the DB until backfilled.';
COMMENT ON COLUMN batteries.peak_power_w IS
  'Peak output in watts, sustained for seconds. NULL = unknown.';
COMMENT ON COLUMN batteries.surge_power_w IS
  'Surge output in watts, momentary (e.g. motor start). NULL = unknown.';

COMMIT;
