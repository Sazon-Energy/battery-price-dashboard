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
| name | text | Battery product name |
| supplier | text | Manufacturer/supplier name (denormalized from manufacturers) |
| target_url | text | Product page URL |
| current_price | real | Most recent price in USD |
| battery_class_id | uuid | Foreign key to battery_classes(id) |
| created_at | timestamptz | When record was created |
| updated_at | timestamptz | Last update timestamp |

**Key Points:**
- `supplier` is a TEXT field containing the manufacturer name, NOT a foreign key
- `target_url` is used for the product URL, not `url`
- Foreign key to `battery_classes` for capacity/power specs

**Relationships:**
- `battery_class_id` → `battery_classes.id`
- Has many `price_history` records

---

## battery_classes

**Purpose:** Battery capacity and power specifications (e.g., "3kWh / 3kW").

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (auto-generated) |
| short_name | text | Display name (e.g., "3kWh / 3kW") |
| long_description_json | jsonb | Detailed specs in JSON format |
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
| battery_class_id | uuid | Foreign key to battery_classes(id) (nullable) |
| confidence_score | real | Discovery confidence 0-100 |
| status | text | 'pending', 'approved', or 'rejected' |
| auto_approved | boolean | Whether candidate met auto-approval threshold |
| rejection_reason | text | Why candidate was rejected (nullable) |
| discovered_at | timestamptz | When candidate was discovered |
| reviewed_at | timestamptz | When candidate was reviewed (nullable) |
| created_at | timestamptz | When record was created |
| updated_at | timestamptz | Last update timestamp |

**Key Points:**
- `manufacturer_id` IS a foreign key (unlike batteries.supplier which is text)
- `normalized_url` must be unique (used for deduplication)
- After approval, data is copied to `batteries` table
- Candidates are NOT automatically linked to batteries after approval

**Relationships:**
- `manufacturer_id` → `manufacturers.id`
- `battery_class_id` → `battery_classes.id` (nullable)

**Workflow:**
1. Discovery service creates candidates with status='pending'
2. User reviews and sets status='approved' or 'rejected'
3. Approved candidates are manually copied to batteries table via SQL

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
| `supplier` (text) | `manufacturer_id` (uuid FK) | batteries uses text, candidates uses FK |
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

### No Bidirectional Links

As of migration `005_remove_cross_references.sql`:
- batteries does NOT have `candidate_id`
- battery_candidates does NOT have `battery_id`
- No automatic linking when candidates are approved
- Use URL matching if you need to find connections

---

## Schema Evolution

### Removed Columns (2026-01-18)

From migration `005_remove_cross_references.sql`:
- `batteries.candidate_id` - removed (unused cross-reference)
- `batteries.discovered_by` - removed (unused tracking field)
- `battery_candidates.battery_id` - removed (unused cross-reference)

**Rationale:** Simplified schema by removing unused bidirectional references. URL uniqueness is sufficient for mapping between tables if needed.

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
