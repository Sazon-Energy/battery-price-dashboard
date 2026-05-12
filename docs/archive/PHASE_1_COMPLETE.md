# Phase 1 Complete: Database Infrastructure

**Date:** January 16, 2026
**Status:** ✅ COMPLETE - Ready for Phase 2

---

## What Was Done

Created complete database schema and configuration for automated battery discovery feature with 3 migration files and file-based configuration:

### Migration Files Created

1. **`migrations/001_create_manufacturers_table.sql`** (75 lines)
   - Creates `manufacturers` table
   - Includes seed data for 5 manufacturers (Anker, EcoFlow, Jackery, Bluetti, Goal Zero)
   - Anker and EcoFlow are enabled (POC validated)
   - Others disabled until ready for testing

2. **`migrations/002_create_battery_candidates_table.sql`** (89 lines)
   - Creates `battery_candidates` table for discovered products
   - JSONB `extracted_specs` column for flexible spec storage
   - Status workflow: pending → approved/rejected
   - Auto-approval tracking with confidence scoring
   - Automatic `updated_at` trigger

3. **`migrations/004_update_batteries_table.sql`** (36 lines)
   - Adds `candidate_id` column to link to discovery candidates
   - Adds `discovered_by` column ('manual' or 'auto')
   - Updates all existing batteries to `discovered_by = 'manual'`

### Configuration Files Created

4. **`config/discovery-config.json`** (Configuration)
   - File-based configuration (not stored in database)
   - Conservative defaults: 5 candidates max, 1 manufacturer per run
   - Auto-approve threshold: 50% confidence
   - Crawl delay: 2 seconds (polite crawling)
   - Version-controlled and deployed with application

5. **`config/discovery-config.schema.json`** (JSON Schema)
   - Validation schema for configuration file
   - Documents all configuration options
   - Enables IDE autocomplete and validation

6. **`config/README.md`** (Configuration Documentation)
   - Complete guide to all configuration options
   - Examples for different scenarios (conservative, aggressive, testing)
   - Environment-specific configuration patterns
   - Troubleshooting guide

### Documentation Created

7. **`migrations/README.md`** (Migration Documentation)
   - Complete migration instructions
   - Schema documentation
   - Verification queries
   - Rollback instructions

---

## Database Schema Summary

### New Tables

**`manufacturers`** - 14 columns, 2 indexes
- Stores manufacturer info with catalog URLs and filtering rules
- Seed data: 5 manufacturers (2 enabled, 3 disabled)
- Tracks last search time and products found

**`battery_candidates`** - 15 columns, 6 indexes
- Stores discovered products pending review
- JSONB specs with capacity/power extraction metadata
- Confidence scoring and auto-approval workflow
- Links to manufacturers and battery_classes

### Updated Tables

**`batteries`** - Added 2 columns
- `candidate_id` - Links to discovery candidate (if auto-discovered)
- `discovered_by` - Tracks origin: 'manual' or 'auto'

### Configuration (File-Based)

**`config/discovery-config.json`** - Discovery system settings
- **Not stored in database** - version-controlled and deployed with app
- Conservative defaults (5 candidates, 1 manufacturer per run)
- Configurable thresholds and crawl behavior
- See `config/README.md` for full documentation

---

## Key Features

### Content-Based Filtering
- Include keywords: Broad search across entire page
- Exclude keywords: Narrow search (title/description only) to avoid false positives

### Capacity Range
- Minimum: 1.0 kWh (filters out small handheld units)
- Maximum: 15.0 kWh (filters out large systems with expansions)
- Stored as REAL with 3 decimal places

### Auto-Approval Workflow
- Confidence score 0-100 based on data quality
- Auto-approve threshold: 50% (must have name + capacity/power)
- User can review and reject any candidate
- All approved candidates trigger existing price scraper

### Deduplication
- Normalized URLs (strips query parameters)
- Unique constraint on `normalized_url`
- Prevents re-processing same product

### POC Validation Data
- Anker: 100% discovery rate, 100% capacity accuracy
- EcoFlow: 100% discovery rate, ~70% capacity accuracy
- Configuration values proven in poc-crawler-v2.js

---

## How to Run Migrations

### Recommended: Supabase Dashboard

1. Open Supabase dashboard → SQL Editor
2. Run each migration file in order (001 → 002 → 004)
3. Copy/paste SQL and click Run

### Configuration

After migrations, the discovery script will read configuration from `config/discovery-config.json`. No database configuration needed!

### Verification Queries

After running migrations:

```sql
-- Check manufacturers (should show 5, with 2 enabled)
SELECT name, domain, enabled FROM manufacturers ORDER BY name;

-- Check batteries columns (should show new columns)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'batteries'
AND column_name IN ('candidate_id', 'discovered_by');
```

---

## What's Next: Phase 2.3

Now that the database infrastructure is ready, next step is to build the production discovery script.

### Phase 2.3 Tasks

1. **Create `scripts/discover-batteries.js`** - Production discovery script
   - Port logic from `poc-crawler-v2.js`
   - Add database integration (read config, write candidates)
   - Implement deduplication (check normalized URLs)
   - Load manufacturer config from database

2. **Test database integration**
   - Test with Anker (should find 5 batteries)
   - Test with EcoFlow (should find 10 batteries)
   - Verify candidates are properly stored
   - Verify deduplication works

3. **Add error handling**
   - Alert if 0 products found (manufacturer site may have changed)
   - Handle network errors gracefully
   - Log all discovery runs to console

---

## File Locations

### Migrations (`/migrations/`)

```
migrations/
├── README.md                                # Migration documentation
├── 001_create_manufacturers_table.sql       # Manufacturers table + seed data
├── 002_create_battery_candidates_table.sql  # Candidates table
└── 004_update_batteries_table.sql           # Update batteries table
```

### Configuration (`/config/`)

```
config/
├── README.md                        # Configuration documentation
├── discovery-config.json            # Discovery settings (edit this)
└── discovery-config.schema.json     # JSON Schema for validation
```

---

## Success Criteria Met

- [x] Created manufacturers table with seed data for 5 manufacturers
- [x] Created battery_candidates table with JSONB specs and workflow
- [x] Created file-based discovery configuration (not in database)
- [x] Updated batteries table with discovery tracking columns
- [x] Included POC-validated configuration from poc-crawler-v2.js
- [x] Added comprehensive documentation (migrations, configuration, verification)
- [x] All existing data preserved (batteries marked as 'manual')
- [x] Configuration is version-controlled and deployed with application

---

## Resource Impact

**Database Storage:**
- New tables: ~1KB base overhead
- Expected growth: ~20 candidates/month = 240/year
- Per-candidate storage: ~2KB (name, URL, specs, etc.)
- Yearly growth: ~480KB
- Free tier: 500MB
- **Utilization: <0.1%** ✅

**No Impact On:**
- GitHub Actions (not yet added)
- Price scraping (unchanged)
- Existing app functionality

---

## Design Decisions

### Why File-Based Configuration?

Discovery configuration is stored in `config/discovery-config.json` (not database) because:

1. **Infrequent Updates**: Configuration changes rarely compared to data
2. **Version Control**: Changes tracked in git with PR review
3. **Code Review**: Configuration changes go through normal code review process
4. **Deployment**: Configuration deployed with application code
5. **Environment-Specific**: Easy to override per environment (dev/staging/prod)
6. **No Database Round-Trip**: Faster to load, no database queries needed
7. **Simplicity**: One less table to manage, no need for config UI

Data that changes frequently or is user-generated (manufacturers, candidates, batteries) stays in the database.

### Other Notes

- All tables use `TIMESTAMPTZ` for proper timezone handling
- Foreign keys use appropriate `ON DELETE` actions
- Indexes created for common query patterns
- JSONB allows flexible spec storage without schema changes
- Comprehensive comments added to all tables and columns

---

**Status:** Phase 1 COMPLETE ✅
**Next:** Begin Phase 2.3 - Build production discovery script

**Created Files:**
- `/migrations/001_create_manufacturers_table.sql`
- `/migrations/002_create_battery_candidates_table.sql`
- `/migrations/004_update_batteries_table.sql`
- `/migrations/README.md`
- `/config/discovery-config.json`
- `/config/discovery-config.schema.json`
- `/config/README.md`
- `/PHASE_1_COMPLETE.md` (this file)
