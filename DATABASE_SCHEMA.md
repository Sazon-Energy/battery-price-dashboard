# Database Schema

**Generated:** 2026-01-18
**Source:** Direct query from Supabase

---

## Overview

This document describes all tables in the battery price monitoring system. Use this as the authoritative reference when writing SQL queries or migrations.

---

## batteries

**Purpose:** Main table tracking battery products and their current prices.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (auto-generated) |
| name | text | Battery product name (CHECK length <= 500) |
| supplier | text | Manufacturer name, denormalized display copy of `manufacturers.name` (CHECK length <= 500) |
| manufacturer_id | uuid | Foreign key to manufacturers(id), nullable - authoritative source of manufacturer identity |
| target_url | text | Product page URL |
| current_price | real | Most recent price in USD |
| battery_class_id | uuid | Foreign key to battery_classes(id), nullable - populated manually via Supabase Studio, not by app code |
| created_at | timestamptz | When record was created |
| updated_at | timestamptz | Last update timestamp |

**Key Points:**
- `supplier` is a denormalized display copy of `manufacturers.name`, kept so `app/page.js` can read it without a join; `manufacturer_id` is authoritative if they ever diverge
- `target_url` is used for the product URL, not `url`
- Foreign key to `battery_classes` for capacity/power specs, but only manually populated (4/26 rows as of 2026-07) - not set by any app code path

**Relationships:**
- `battery_class_id` → `battery_classes.id`
- `manufacturer_id` → `manufacturers.id`
- Has many `price_history` records
- Referenced by `battery_candidates.battery_id` (the candidate a battery was approved from, if known)

---

## battery_classes

**Purpose:** Battery capacity and power specifications (e.g., "3kWh / 3kW").

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (auto-generated) |
| short_name | text | Display name (e.g., "3kWh / 3kW") (CHECK length <= 200) |
| capacity_kwh | real | Battery capacity in kilowatt-hours |
| cpower_w | integer | Continuous power output in watts |
| ppower_w | integer | Peak power output in watts |
| created_at | timestamptz | When record was created |
| updated_at | timestamptz | Last update timestamp |

**Key Points:**
- Defines standard battery classes for grouping similar products
- Used for filtering and comparison

**Relationships:**
- Referenced by `batteries.battery_class_id`
- Referenced by `battery_candidates.battery_class_id`

---

## battery_candidates

**Purpose:** Discovered battery products pending review and approval.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (auto-generated) |
| url | text | Original discovered URL |
| normalized_url | text | URL with query params stripped (unique) |
| name | text | Battery product name |
| manufacturer_id | uuid | Foreign key to manufacturers(id) |
| extracted_specs | jsonb | Extracted capacity/power specs with metadata |
| discovered_price | real | Price at time of discovery |
| battery_class_id | uuid | Foreign key to battery_classes(id), nullable - populated manually via Supabase Studio, not by app code |
| status | text | 'pending', 'approved', or 'rejected' |
| battery_id | uuid | Foreign key to batteries(id), nullable - set at approval time; NULL for pending/rejected candidates and historical rows that predate this column |
| discovered_at | timestamptz | When candidate was discovered |
| reviewed_at | timestamptz | When candidate was reviewed (nullable) |
| created_at | timestamptz | When record was created |
| updated_at | timestamptz | Last update timestamp |

**Key Points:**
- `manufacturer_id` IS a foreign key (unlike batteries.supplier which is a denormalized text copy)
- `normalized_url` must be unique (used for deduplication)
- All candidates require manual review - there is no auto-approval
- After approval, `app/api/candidates/approve/route.js` copies data into `batteries` and sets `battery_id` on this row to the new battery's id

**Relationships:**
- `manufacturer_id` → `manufacturers.id`
- `battery_class_id` → `battery_classes.id` (nullable)
- `battery_id` → `batteries.id` (nullable)

**Workflow:**
1. Discovery service creates candidates with status='pending'
2. User reviews and sets status='approved' or 'rejected' via the `/candidates` UI
3. On approval, the API route inserts into `batteries` and links this candidate to it via `battery_id`

---

## manufacturers

**Purpose:** Battery manufacturer configuration for discovery crawler.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (auto-generated) |
| name | text | Manufacturer name |
| domain | text | Website domain |
| catalog_url | text | URL to start crawling for products |
| include_keywords | text[] | Keywords that must appear (broad search) |
| exclude_keywords | text[] | Keywords to filter out (title/description only) |
| min_capacity_kwh | real | Minimum battery capacity to consider |
| max_capacity_kwh | real | Maximum battery capacity to consider |
| last_searched_at | timestamptz | Last time this manufacturer was crawled |
| last_products_found | integer | Number of products found in last crawl |
| enabled | boolean | Whether to include in discovery runs |
| notes | text | Admin notes |
| created_at | timestamptz | When record was created |
| updated_at | timestamptz | Last update timestamp |

**Key Points:**
- Controls which manufacturers are crawled
- `enabled=true` means manufacturer is active for discovery
- Keywords and capacity ranges filter discovered products

**Relationships:**
- Referenced by `battery_candidates.manufacturer_id`

---

## price_history

**Purpose:** Historical price tracking for batteries.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (auto-generated) |
| battery_id | uuid | Foreign key to batteries(id) |
| price | real | Recorded price in USD |
| scraped_at | timestamptz | When price was scraped |

**Key Points:**
- Stores historical price points for trend analysis
- New record added each time price is scraped

**Relationships:**
- `battery_id` → `batteries.id`

---

## Important Schema Notes

### batteries vs battery_candidates

**Different column names for similar concepts:**

| batteries | battery_candidates | Notes |
|-----------|-------------------|-------|
| `target_url` | `normalized_url` | Product URL |
| `supplier` (text) + `manufacturer_id` (uuid FK) | `manufacturer_id` (uuid FK) | Both tables now have the FK; batteries additionally keeps `supplier` as a denormalized display copy |
| - | `url` | Only candidates has original URL |

**When copying from candidates to batteries:**
```sql
INSERT INTO batteries (name, target_url, supplier, ...)
SELECT
  c.name,
  c.normalized_url as target_url,
  m.name as supplier,  -- Join to get manufacturer name!
  ...
FROM battery_candidates c
JOIN manufacturers m ON m.id = c.manufacturer_id
```

### One-Directional Link (as of migration `012_add_battery_candidates_battery_id.sql`)

- `batteries` does NOT have `candidate_id` (this direction was deliberately not reintroduced - it was the redundant half of the original bidirectional design)
- `battery_candidates.battery_id` DOES exist and is set automatically at approval time
- To find "which candidate did this battery come from" starting from a `batteries` row: `SELECT * FROM battery_candidates WHERE battery_id = '<id>'`
- Historical approved candidates that predate this column may have `battery_id = NULL` if a best-effort URL-match backfill couldn't find their battery (e.g. if `target_url` was corrected after approval) - NULL there means "unknown," not "none"

---

## Schema Evolution

### Removed Columns (2026-01-18)

From migration `005_remove_cross_references.sql`:
- `batteries.candidate_id` - removed (unused cross-reference)
- `batteries.discovered_by` - removed (unused tracking field)
- `battery_candidates.battery_id` - removed (unused cross-reference)

**Rationale:** Simplified schema by removing unused bidirectional references. URL uniqueness is sufficient for mapping between tables if needed.

**Revisited 2026-07-04:** the "URL matching is sufficient" assumption turned out not to hold - correcting a `batteries.target_url` after a manufacturer changed a URL slug (observed: EcoFlow renamed `-special-offer` to `-flash-sale`) silently breaks any code matching on that URL. Migration `012_add_battery_candidates_battery_id.sql` reintroduced `battery_candidates.battery_id` (one direction only, not `batteries.candidate_id`) to make that link durable.

### Confidence Scoring Removed (2026-07-03)

From migration `008_remove_confidence_scoring.sql`: `battery_candidates.confidence_score` and `auto_approved` were dropped - confidence-based auto-approval was never implemented; every candidate has always required manual review.

### Cleanup (2026-07-04)

- `migrations/009_varchar_to_text.sql` - converted `batteries.name`/`supplier` and `battery_classes.short_name` from `varchar(n)` (an accidental Supabase Studio UI default) to `text` with explicit `CHECK` length constraints.
- `migrations/010_drop_long_description_json.sql` - dropped `battery_classes.long_description_json`; never read by any application code.
- `migrations/011_drop_rejection_reason.sql` - dropped `battery_candidates.rejection_reason`; the API accepted it but the review UI never collected one (1 of 61 rejected rows ever had a value, set manually).
- `migrations/012_add_battery_candidates_battery_id.sql` - see "One-Directional Link" above.
- `migrations/013_add_batteries_manufacturer_id.sql` - added `batteries.manufacturer_id`, normalizing manufacturer identity to match how `battery_candidates` already modeled it; backfilled from `supplier`, inserting a missing `Growatt` manufacturers row in the process.

---

## Quick Reference: Common Queries

### Get all batteries with their class info
```sql
SELECT b.*, bc.short_name as class_name, bc.capacity_kwh, bc.cpower_w
FROM batteries b
JOIN battery_classes bc ON bc.id = b.battery_class_id
ORDER BY b.name;
```

### Get pending candidates
```sql
SELECT c.*, m.name as manufacturer_name
FROM battery_candidates c
JOIN manufacturers m ON m.id = c.manufacturer_id
WHERE c.status = 'pending'
ORDER BY c.discovered_at ASC;
```

### Find batteries without recent price updates
```sql
SELECT id, name, supplier, updated_at
FROM batteries
WHERE updated_at < NOW() - INTERVAL '7 days'
ORDER BY updated_at ASC;
```

### Get price history for a battery
```sql
SELECT price, scraped_at
FROM price_history
WHERE battery_id = 'your-battery-id-here'
ORDER BY scraped_at DESC
LIMIT 30;
```
