# Database Migrations - Battery Discovery Feature

## Overview

These migrations add automated battery discovery functionality to the Battery Price Monitor application.

## Migration Files (Run in Order)

1. **001_create_manufacturers_table.sql** - Creates manufacturers table with seed data for 5 manufacturers
2. **002_create_battery_candidates_table.sql** - Creates battery_candidates table for discovered products
3. **004_update_batteries_table.sql** - Adds candidate_id/discovered_by to batteries (both later dropped by 005)
4. **005_remove_cross_references.sql** - Drops candidate_id/discovered_by/battery_id - see "Schema Evolution" in DATABASE_SCHEMA.md for why this was later revisited
5. **006_add_scrape_verified.sql** - Adds manufacturers.scrape_verified
6. **007_create_price_extraction_failures.sql** - Creates price_extraction_failures log table
7. **008_remove_confidence_scoring.sql** - Drops the unused confidence_score/auto_approved columns (confidence-based auto-approval was never built)
8. **009_varchar_to_text.sql** - Converts batteries.name/supplier and battery_classes.short_name from varchar(n) to text with explicit CHECK length constraints
9. **010_drop_long_description_json.sql** - Drops battery_classes.long_description_json (never read by any application code)
10. **011_drop_rejection_reason.sql** - Drops battery_candidates.rejection_reason (half-finished feature, never surfaced in the UI)
11. **012_add_battery_candidates_battery_id.sql** - Reintroduces battery_candidates.battery_id (one direction only), set at approval time
12. **013_add_batteries_manufacturer_id.sql** - Adds batteries.manufacturer_id FK, backfilled from the existing supplier text column

**Note:** Discovery configuration is stored in `config/discovery-config.json` (not in database).

## How to Run Migrations

### Option 1: Supabase Dashboard (Recommended for Initial Setup)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of each migration file **in numeric order** (see the list above)
5. Click **Run** for each migration

### Option 2: Supabase CLI (if installed)

```bash
# Run all migrations
supabase db push

# Or run individually, in numeric order
psql $DATABASE_URL < migrations/001_create_manufacturers_table.sql
psql $DATABASE_URL < migrations/002_create_battery_candidates_table.sql
# ...continue through the highest-numbered file
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
Migration 004 originally added `candidate_id` and `discovered_by`; both were dropped again by migration 005 (see DATABASE_SCHEMA.md's "Schema Evolution" section for the full history). As of migration 013, `batteries` instead has:
- `manufacturer_id` - FK to manufacturers(id), authoritative source of manufacturer identity
- `supplier` - kept as a denormalized text copy of `manufacturers.name` for display

The candidate-to-battery link lives on the other side of the relationship: `battery_candidates.battery_id` (added by migration 012), not a column on `batteries`.

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
AND column_name IN ('manufacturer_id', 'supplier');

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

This section originally described dropping `battery_candidates`/`manufacturers` entirely, written back when this was a fresh feature with no data. That's no longer safe - these tables now hold real production data (candidates history, manufacturer configuration). If you need to undo a specific migration, write a targeted reverse migration for just that file's changes instead of dropping tables wholesale.

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
