# Database Migrations - Battery Discovery Feature

## Overview

These migrations add automated battery discovery functionality to the Battery Price Monitor application.

## Migration Files (Run in Order)

1. **001_create_manufacturers_table.sql** - Creates manufacturers table with seed data for 5 manufacturers
2. **002_create_battery_candidates_table.sql** - Creates battery_candidates table for discovered products
3. **004_update_batteries_table.sql** - Updates batteries table with discovery tracking columns
4. **008_remove_confidence_scoring.sql** - Drops the unused confidence_score/auto_approved columns (confidence-based auto-approval was never built)

**Note:** Discovery configuration is stored in `config/discovery-config.json` (not in database).

## How to Run Migrations

### Option 1: Supabase Dashboard (Recommended for Initial Setup)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of each migration file **in order** (001, 002, 004)
5. Click **Run** for each migration

### Option 2: Supabase CLI (if installed)

```bash
# Run all migrations
supabase db push

# Or run individually
psql $DATABASE_URL < migrations/001_create_manufacturers_table.sql
psql $DATABASE_URL < migrations/002_create_battery_candidates_table.sql
psql $DATABASE_URL < migrations/004_update_batteries_table.sql
```

### Option 3: Node.js Script (Custom)

You can create a script to run these migrations programmatically using the `@supabase/supabase-js` client with admin privileges.

## Database Schema

### New Tables

#### `manufacturers`
Stores battery manufacturer information for discovery targeting.

**Key columns:**
- `name`, `domain`, `catalog_url` - Manufacturer identification
- `include_keywords[]`, `exclude_keywords[]` - Content filtering rules
- `min_capacity_kwh`, `max_capacity_kwh` - Capacity range (1.0 - 15.0 kWh)
- `enabled` - Control which manufacturers are actively crawled
- `last_searched_at`, `last_products_found` - Discovery metrics

**Seed data included:**
- Anker (enabled, POC validated)
- EcoFlow (enabled, POC validated)
- Jackery (disabled, not yet tested)
- Bluetti (disabled, not yet tested)
- Goal Zero (disabled, not yet tested)

#### `battery_candidates`
Stores discovered battery products pending review and approval.

**Key columns:**
- `url`, `normalized_url` - Product URLs (normalized for deduplication)
- `name`, `manufacturer_id` - Product identification
- `extracted_specs` (JSONB) - Capacity, power, extraction metadata
- `status` - pending/approved/rejected
- `battery_id` - Link to batteries table when approved

**Extracted specs structure:**
```json
{
  "capacity_kwh": 3.84,
  "capacity_source": "product_name",
  "capacity_matched": "3,840Wh",
  "capacity_priority": 100,
  "power_w": 3800,
  "power_source": "body_text",
  "power_matched": "3800W",
  "power_priority": 10
}
```

### Updated Tables

#### `batteries`
Added two new columns:
- `candidate_id` - Reference to battery_candidates.id (if discovered automatically)
- `discovered_by` - 'manual' or 'auto' (how battery was added)

All existing batteries are marked as `discovered_by = 'manual'`.

### Configuration

#### Discovery Configuration (File-Based)
Discovery system configuration is stored in `config/discovery-config.json` and deployed with the application (not stored in database).

**See:** `config/README.md` for full configuration documentation

**Key settings:**
- `enabled` - Master switch for discovery
- `maxCandidatesPerRun` - Limit candidates per run (default: 5)
- `manufacturersPerRun` - Manufacturers to check per run (default: 1)
- `crawlDelayMs` - Delay between requests (default: 2000ms)

## Post-Migration Verification

After running migrations, verify the schema:

```sql
-- Check manufacturers table
SELECT name, domain, enabled FROM manufacturers ORDER BY name;

-- Check batteries table columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'batteries'
AND column_name IN ('candidate_id', 'discovered_by');

-- Check battery_candidates table structure
\d battery_candidates
```

## Next Steps

After running these migrations:

1. **Phase 2.3** - Build discovery script (`scripts/discover-batteries.js`)
2. **Phase 2.4** - Create API endpoints for candidate management
3. **Phase 2.5** - Build UI for reviewing candidates
4. **Phase 2.6** - Set up GitHub Actions automation

## Rollback (if needed)

To rollback these migrations:

```sql
-- Drop in reverse order
ALTER TABLE batteries DROP COLUMN IF EXISTS discovered_by;
ALTER TABLE batteries DROP COLUMN IF EXISTS candidate_id;
DROP TABLE IF EXISTS battery_candidates;
DROP TABLE IF EXISTS manufacturers;
```

## Notes

- All timestamps use `TIMESTAMPTZ` for proper timezone handling
- Foreign key constraints use `ON DELETE CASCADE` or `ON DELETE SET NULL` appropriately
- Indexes are created for common query patterns
- JSONB is used for `extracted_specs` to allow flexible spec storage
- Discovery configuration stored in `config/discovery-config.json` (version-controlled, deployed with app)
- All existing batteries are preserved and marked as manually added

## Testing

After migration, you can test with sample queries:

```sql
-- List enabled manufacturers
SELECT name, catalog_url, enabled
FROM manufacturers
WHERE enabled = true;

-- Check for pending candidates (should be empty initially)
SELECT COUNT(*) FROM battery_candidates WHERE status = 'pending';
```
