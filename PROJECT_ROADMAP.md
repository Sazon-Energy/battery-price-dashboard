# Battery Price Monitor - Project Roadmap

## Current Status (January 2026)

### ✅ Completed (Phase 1)
- Next.js dashboard displaying battery prices
- Supabase database with batteries, battery_classes, and price_history tables
- Web scraping service with multi-method price extraction (5 fallback methods)
- GitHub Actions automation for twice-weekly price updates
- Price history tracking and display

### ✅ Completed (Phase 2) - Automated Battery Discovery
- Database infrastructure (manufacturers, battery_candidates tables)
- Discovery service (`scripts/discover-batteries.js`)
- Web UI for candidate review (`/candidates` page)
- Batch SQL operations for approval workflow
- GitHub Actions automation (weekly discovery runs)
- Manual trigger option via GitHub Actions UI

### 🚧 In Progress (Phase 2.7) - Testing & Refinement

Tuning and improving the discovery system based on production usage.

---

## Phase 2: Automated Battery Discovery

### Goal
Automatically discover new consumer battery products from manufacturer websites, classify them, and add them to tracking with minimal manual intervention.

### Architecture Approach

**Manufacturer-Focused Discovery (Not Web-Wide)**
- Maintain curated list of battery manufacturers in database
- Each manufacturer has: domain, catalog URL, filtering rules
- Periodic crawling of known manufacturer sites only
- Alert if manufacturer site structure changes (0 products found)

**Content-Based Filtering (Not URL Patterns)**
- Analyze product page content (name, description, specs)
- Use include/exclude keywords to identify valid battery products
- Minimum capacity threshold (1 kWh or 1000 Wh)
- Exclude bundles, solar generators, expansion packs, accessories

**Separation of Concerns**
- Discovery service: Find batteries, extract specs, classify
- Price scraping service: Existing `scrape-battery.js` (unchanged)
- Discovery does NOT scrape prices - uses existing scraper for initial price

**Manual Approval Workflow**
- Discovery service collects candidates only (no direct insertion to batteries table)
- Candidates contain basic identifying data (name, model, URL) - specs kept but not relied upon
- User reviews and approves candidates via secure interface
- Specs can be corrected during approval process
- Track analyzed URLs and existing batteries to avoid re-processing known items

### Database Schema (New Tables)

**`manufacturers`**
```sql
- id, name, domain
- catalog_url (where to find products)
- include_keywords[] (must contain)
- exclude_keywords[] (must not contain)
- min_capacity_kwh (1.0 kWh minimum)
- last_searched_at, last_products_found
- enabled, notes
```

**`battery_candidates`**
```sql
- id, url, normalized_url
- name, manufacturer_id
- extracted_specs (capacity, power - JSON)
- discovered_price, battery_class_id
- confidence_score, status (pending/approved/rejected)
- auto_approved, battery_id (link to batteries table)
- discovered_at, reviewed_at, rejection_reason
```

**`discovery_config`**
```sql
- enabled, max_candidates_per_run (5)
- manufacturers_per_run (1)
- min_price, max_price
- required_keywords[], exclude_keywords[]
- auto_approve_threshold, crawl_delay_ms
```

### Implementation Phases

#### Phase 2.1: POC Validation ✅
- [x] Create proof-of-concept crawler
- [x] Test on Anker & EcoFlow
- [x] Validate content-based filtering approach
- [x] Refine with enhanced logging and capacity handling

#### Phase 2.2: Database Infrastructure ✅
- [x] Create manufacturers table with seed data (Anker, EcoFlow, Jackery, Bluetti, Goal Zero)
- [x] Create battery_candidates table
- [x] Create file-based discovery_config (config/discovery-config.json)
- [x] Update batteries table (add candidate_id, discovered_by columns)
- [x] Simplified schema (removed unnecessary cross-references)

#### Phase 2.3: Discovery Service ✅
- [x] Build discovery script (`scripts/discover-batteries.js`)
- [x] Extract to utility modules:
  - `lib/battery-crawler.js` - URL discovery, content filtering
  - `lib/spec-extractor.js` - Capacity/power extraction
  - `lib/battery-classifier.js` - Match to battery classes
- [x] Implement deduplication (normalized URLs)
- [x] Add error monitoring and alerts

#### Phase 2.4: API Endpoints ✅
- [x] `/api/candidates` - List/filter/paginate candidates
- [x] Batch SQL operations for approve/reject
- [x] Database queries for manufacturers
- [x] Configuration loaded from file

#### Phase 2.5: UI for Candidate Management ✅
- [x] `/candidates` page - List view with pending filter
- [x] Display manufacturer, name, discovery time
- [x] Clickable links to product pages
- [x] Automatic timezone localization
- [x] Batch SQL workflow documented in CANDIDATE_REVIEW_GUIDE.md

#### Phase 2.6: Automation ✅
- [x] GitHub Actions workflow for discovery
- [x] Weekly schedule (Mondays at 7:00 AM UTC)
- [x] Manual trigger option
- [x] Error logging to workflow output

#### Phase 2.7: Testing & Refinement 🚧
- [x] Test Anker (enabled, working)
- [x] Test EcoFlow (enabled, working)
- [ ] Fix Jackery name extraction (captures generic name instead of model name)
- [ ] Fix Bluetti catalog URL (returns 404)
- [ ] Test Goal Zero
- [ ] Add status message to candidates page showing last discovery run
- [ ] Tune confidence scoring
- [ ] Refine keyword filters
- [ ] Monitor resource usage
- [ ] Document manufacturer configuration

---

## Phase 3: Future Enhancements (Backlog)

### Advanced Discovery
- [ ] Claude API integration for intelligent classification (when API access available)
- [ ] Duplicate detection across retailers
- [ ] Monitor for discontinued products (404s, removed from catalog)
- [ ] Browser automation (Puppeteer) for JavaScript-heavy sites

### Price Tracking Improvements
- [ ] Price drop alerts (email/webhook)
- [ ] Price prediction/trends
- [ ] Historical low/high indicators
- [ ] Price comparison across retailers
- [ ] Show pricing and price history with cost per kWh in addition to retail price; improve battery class tracking as needed to support this

### Data Quality
- [ ] Automated testing of scraper methods
- [ ] Scraper health dashboard
- [ ] Manufacturer site change detection
- [ ] Data validation and cleanup tools

### User Experience
- [ ] Battery comparison tool
- [ ] Saved searches/filters
- [ ] Export improvements (PDF reports)
- [ ] Mobile app (React Native)

---

## Key Design Decisions

### Why Manufacturer-Focused (Not Web-Wide)?
- Limited number of battery manufacturers (~5-10 major players)
- New manufacturers appear infrequently
- Higher data quality from known sources
- Resource-efficient (targeted crawling)
- Easier to maintain and debug

### Why Content-Based Filtering (Not URL Patterns)?
- Manufacturer sites change URL structures
- URL patterns don't reliably distinguish product types
- Bundles/expansions use same URL structure as batteries
- Content analysis is more robust and maintainable
- Single set of rules works across manufacturers

### Why Separate Discovery from Price Scraping?
- Price scraping is complex (5 fallback methods)
- Existing scraper is well-tested and working
- Discovery needs different data (specs, not just price)
- Clean separation of concerns
- Easier to debug and maintain

### Why Manual Approval Only?
- Prioritize data quality over automation for initial deployment
- Battery specs are important and shouldn't be auto-populated with potentially incorrect data
- Unique identifying information (name, model, URL) is what matters for discovery
- User can correct specs during one-time approval process
- Prevents need for ongoing data cleanup of auto-approved batteries
- Confidence scoring kept for future improvements, but not used for auto-approval

---

## Resource Budgets (Free Tier)

### GitHub Actions (Discovery)
- Frequency: Weekly (configurable)
- Runtime per discovery: ~10 minutes (1 manufacturer, 5 products)
- Monthly usage: ~40 minutes (4 runs)
- Free tier: 2000 minutes/month
- **Utilization: 2%** ✅

### GitHub Actions (Price Scraping)
- Frequency: Twice weekly
- Runtime: ~5 minutes per run
- Monthly usage: ~40 minutes (8 runs)
- **Utilization: 2%** ✅

### Supabase Database
- New tables: manufacturers, battery_candidates, discovery_config
- Expected growth: ~20 candidates/month = 240/year
- Storage: <1MB per year
- Free tier: 500MB
- **Utilization: <1%** ✅

### Total GitHub Actions Budget
- Discovery: 40 min/month
- Price scraping: 40 min/month
- Total: 80 min/month
- Free tier: 2000 min/month
- **Utilization: 4%** ✅

---

## Success Metrics

### Phase 2 Success Criteria
- [ ] Discovers ≥80% of batteries on manufacturer sites
- [ ] <10% false positives (non-batteries marked as batteries)
- [ ] Auto-approval accuracy ≥90%
- [ ] 0 false negatives (valid batteries marked as non-batteries)
- [ ] Runs reliably without manual intervention
- [ ] Clear alerts when manufacturer sites change

### Key Performance Indicators
- Discovery success rate (% of actual batteries found)
- False positive rate (% of candidates that are rejected)
- Auto-approval accuracy (% of auto-approved that stay approved)
- Manual review time (minutes per candidate)
- Time to discover new product (days from release to discovery)

---

## Technical Debt & Known Issues

### Current Issues
1. Anker price extraction fails (ankersolix.com pricing needs investigation)
2. Name extraction duplicates text from multiple h1 tags
3. Some capacity/power values incorrectly classified
4. Jackery name extraction captures generic name instead of actual battery model name from rendered page
5. Bluetti catalog URL returns 404 (https://www.bluettipower.com/collections/portable-power-stations)
6. Candidates page needs status message showing last discovery run time and manufacturer searched
7. Supabase paused instance error handling - App shows generic "TypeError: Load failed" with no helpful feedback when Supabase instance is paused; no errors visible in Vercel logs; need graceful error handling with clear user feedback

### To Address in Phase 2
- [ ] Fix Anker price extraction (investigate site-specific selectors)
- [ ] Clean duplicate text from product names
- [ ] Improve capacity extraction (handle both kWh and Wh)
- [ ] Validate power extraction (continuous vs peak)
- [ ] Add spec extraction tests

### Future Spec Extraction Enhancement (Backlog)
**Vision-Based Spec Extraction**
- Use screenshot/print of rendered product page
- Apply Claude vision API to extract specs and pricing from visual representation
- Benefits: More robust than DOM parsing, handles JavaScript-rendered content, can read specs from images/tables
- Consider using established scraping libraries/services (including paid options) for more reliable extraction

---

## Change Log

**January 21, 2026**
- Updated roadmap to reflect Phase 2 completion
- Added current known issues (Jackery, Bluetti, candidates page status)
- Moved to Phase 2.7 (Testing & Refinement)

**January 18, 2026**
- Completed Phase 2.6 (Automation with GitHub Actions)
- Deployed candidate review page to production
- Created CANDIDATE_REVIEW_GUIDE.md and DEPLOY.md

**January 17, 2026**
- Completed Phase 2.5 (UI for Candidate Management)
- Completed Phase 2.4 (Batch SQL operations)
- Simplified database schema (removed cross-references)

**January 16, 2026**
- Completed Phase 2.3 (Discovery Service)
- Completed Phase 2.2 (Database Infrastructure)
- Created discovery automation script

**January 15, 2026**
- Created project roadmap
- Completed POC crawler validation
- Defined Phase 2 architecture and implementation plan
- Documented design decisions and resource budgets
