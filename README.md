# Battery Price Monitor

Automated price tracking and discovery for consumer battery products (power stations, solar generators, home backup systems).

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                      Next.js Frontend                        │
│  • Main dashboard (public price tracking)                    │
│  • /candidates page (admin-only candidate review)            │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ├── Read: Supabase (anon key, RLS-protected)
                  └── Write: API Routes (service role key)
                          │
                          ▼
            ┌─────────────────────────────┐
            │   Supabase PostgreSQL       │
            │  • batteries                │
            │  • price_history            │
            │  • battery_candidates       │
            │  • manufacturers            │
            │  • price_extraction_failures│
            └─────────────────────────────┘
                          ▲
                          │
            ┌─────────────┴──────────────┐
            │                            │
    ┌───────┴────────┐       ┌──────────┴─────────┐
    │ Price Scraper  │       │ Discovery Service  │
    │ (GitHub Action)│       │ (GitHub Action)    │
    │ 2x/week        │       │ Weekly             │
    └────────────────┘       └────────────────────┘
```

**Data Flow:**

1. **Discovery** (weekly): Crawls manufacturer sites → extracts specs + price → creates `battery_candidates` (pending review)
2. **Review** (manual): Admin approves candidate via `/candidates` UI → creates `batteries` row + seeds `price_history`
3. **Price Tracking** (2x/week): Scrapes approved batteries → updates `current_price` + inserts `price_history` row
4. **Dashboard** (real-time): Displays batteries with current prices and historical data

### Key Design Decisions

- **Manufacturer-focused discovery**: Curated list of known battery manufacturers (not web-wide crawling)
- **Price-gated candidates**: Only create candidates when price extraction succeeds; log failures separately
- **Manual approval only**: Prioritize data quality; specs can be corrected during approval
- **Separation of concerns**: Discovery finds products; existing scraper handles price tracking
- **Security layers**: RLS on tables + admin token on write endpoints + service role isolation

---

## Local Development

### Prerequisites

- Node.js 18+ and npm
- Supabase account (free tier is sufficient)
- Git

### 1. Clone and Install

```bash
git clone https://github.com/Sazon-Energy/battery-price-dashboard.git
cd battery-price-dashboard
npm install
```

### 2. Database Setup

#### Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for provisioning (~2 minutes)
3. Note your project URL and API keys (Settings → API):
   - **Project URL**: `https://xxx.supabase.co`
   - **anon public** key: `eyJhbGci...` (safe for client-side)
   - **service_role secret** key: `eyJhbGci...` (server-side only, full admin access)

#### Run Migrations

Go to Supabase SQL Editor and run these files **in order**:

1. `migrations/001_create_manufacturers_table.sql`
2. `migrations/002_create_battery_candidates_table.sql`
3. `migrations/004_update_batteries_table.sql`
4. `migrations/005_remove_cross_references.sql`
5. `migrations/006_add_scrape_verified.sql`
6. `migrations/007_create_price_extraction_failures.sql`

Verify tables exist: `batteries`, `battery_classes`, `price_history`, `manufacturers`, `battery_candidates`, `price_extraction_failures`

### 3. Environment Variables

Create `.env.local` in the project root:

```bash
# Supabase Connection (from Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...your-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...your-service-role-key

# Admin Token (generate with: openssl rand -hex 32)
ADMIN_TOKEN=your_random_32_byte_hex_string
```

**Security Notes:**

| Variable | Used By | Exposure | Purpose |
|----------|---------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser, Server | Public | Supabase project endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser | Public (safe) | Read-only access with RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Secret | Bypass RLS for admin operations |
| `ADMIN_TOKEN` | Server only | Secret | Protect approve/reject endpoints |

- `NEXT_PUBLIC_*` vars are embedded in browser JS bundle (safe for anon key due to RLS)
- Service role key is **never** sent to browser, only used in API routes and scripts
- Admin token is sent in `X-Admin-Token` header from browser but validated server-side

### 4. Start Development Server

```bash
npm run dev
```

Open:
- **Dashboard**: http://localhost:3000
- **Candidate Review**: http://localhost:3000/candidates

---

## Discovery System

### How It Works

1. **Crawl**: Visit manufacturer catalog pages (configured in `manufacturers` table)
2. **Filter**: Use include/exclude keywords to identify battery products
3. **Extract**: Parse capacity (kWh), power (W), and **price** from product page
4. **Validate**: If price found → create candidate; if not → log to `price_extraction_failures`
5. **Dedupe**: Skip URLs already in `battery_candidates` or `batteries` tables

### Running Discovery Locally

```bash
node scripts/discover-batteries.js
```

**Requirements:**
- `.env.local` must have `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- At least one manufacturer with `enabled=true` AND `scrape_verified=true`

**Output:**
- Candidates inserted into `battery_candidates` table (status: `pending`)
- Failures logged to `price_extraction_failures` table
- Console shows progress and summary

### Automated Schedule

GitHub Actions workflow (`.github/workflows/discover-batteries.yml`):
- **Schedule**: Every Monday at 7:00 AM UTC
- **Manual trigger**: GitHub → Actions → "Discover Battery Candidates" → Run workflow
- **Timeout**: 10 minutes
- **Config**: `config/discovery-config.json` (max candidates, crawl delays, etc.)

### Adding New Manufacturers

1. Insert row into `manufacturers` table with catalog URL and filter keywords
2. Set `enabled=true` but `scrape_verified=false`
3. Test manually: `node scripts/discover-batteries.js` (won't process unverified)
4. Verify price extraction works on their product pages
5. Set `scrape_verified=true` to enable in production runs

---

## Candidate Review & Approval

### Access the Admin UI

1. Navigate to `/candidates` (not linked from main UI)
2. On first approve/reject, you'll be prompted for the admin token
3. Token is cached in `sessionStorage` (cleared when tab closes)

### Approve a Candidate

Click **Approve** button:
1. Creates row in `batteries` table with `current_price = discovered_price`
2. Seeds `price_history` with the discovered price
3. Marks candidate as `status='approved'`
4. Battery class is left NULL (backfill later if needed)

### Reject a Candidate

Click **Reject** button:
1. Marks candidate as `status='rejected'`
2. No reason prompt (rejection_reason column unused for now)

### Review Price Extraction Failures

Products that passed filters but had no extractable price:

```sql
SELECT product_name, url, manufacturer_id, attempted_at
FROM price_extraction_failures
ORDER BY attempted_at DESC
LIMIT 50;
```

Fix the scraper for that manufacturer or manually add the battery.

---

## Deployment to Vercel

### Initial Setup

1. **Connect Repository**:
   - Go to [vercel.com](https://vercel.com) → Add New Project
   - Import `Sazon-Energy/battery-price-dashboard`
   - Framework Preset: Next.js (auto-detected)
   - Deploy

2. **Add Environment Variables**:
   - Go to Project Settings → Environment Variables
   - Add all four variables from `.env.local` (see below)
   - Select: Production, Preview, Development

3. **Redeploy**:
   - After adding env vars, trigger a redeploy
   - Deployments tab → latest deployment → ⋯ → Redeploy

### Environment Variables in Vercel

Add these in Vercel dashboard (Settings → Environment Variables):

```
NEXT_PUBLIC_SUPABASE_URL = https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGci...your-anon-key
SUPABASE_SERVICE_ROLE_KEY = eyJhbGci...your-service-role-key
ADMIN_TOKEN = your_random_32_byte_hex_string
```

**Security in Production:**

- `NEXT_PUBLIC_*` vars are bundled into JS (safe - anon key + RLS)
- `SUPABASE_SERVICE_ROLE_KEY` is only available to API routes (server-side)
- `ADMIN_TOKEN` protects `/api/candidates/approve` and `/api/candidates/reject` endpoints
- Never commit secrets to git (`.env.local` is in `.gitignore`)

### Deployment Workflow

**Automatic:**
- Push to `main` branch → Vercel auto-deploys to production
- Push to feature branch → Vercel creates preview deployment

**Manual:**
```bash
npx vercel --prod
```

---

## Security Architecture

### Defense Layers

1. **Row Level Security (RLS)**:
   - Enabled on `price_extraction_failures` (admin-only table)
   - Anon key can read batteries/price_history but not modify
   - Service role bypasses RLS for admin operations

2. **Admin Token Protection**:
   - `/api/candidates/approve` and `/api/candidates/reject` require `X-Admin-Token` header
   - Token validated server-side against `process.env.ADMIN_TOKEN`
   - Invalid token → 401 Unauthorized

3. **Key Isolation**:
   - Browser gets anon key (read-only via RLS)
   - Server-side code uses service role key (full access, never exposed to browser)
   - Admin token stored in browser sessionStorage (prompt once per session)

4. **No Public Write Access**:
   - All database writes go through authenticated API routes
   - Discovery and price scraping use service role key
   - No direct database modification from client

### Secret Management

| Environment | Storage | Access |
|-------------|---------|--------|
| Local Dev | `.env.local` (gitignored) | Developer only |
| Vercel Production | Environment Variables (encrypted) | Build + runtime only |
| GitHub Actions | Repository Secrets | Workflow runs only |

**Never:**
- Commit `.env.local` to git
- Expose service role key to browser
- Share admin token publicly
- Use production keys in local development (use same Supabase instance but protect via token)

---

## Project Structure

```
battery-price-dashboard/
├── app/                          # Next.js App Router
│   ├── page.js                   # Main dashboard (batteries + price history)
│   ├── candidates/page.js        # Admin UI for candidate review
│   └── api/
│       └── candidates/
│           ├── approve/route.js  # POST endpoint (admin token required)
│           └── reject/route.js   # POST endpoint (admin token required)
├── lib/
│   ├── supabase.js               # Browser-side client (anon key)
│   ├── supabase-admin.js         # Server-side client (service role key)
│   ├── admin-auth.js             # Admin token validation helper
│   ├── price-extractor.js        # Shared price extraction logic (5 methods)
│   ├── battery-crawler.js        # URL discovery + content filtering
│   ├── spec-extractor.js         # Capacity/power parsing
│   └── battery-classifier.js     # Match specs to battery classes
├── scripts/
│   ├── discover-batteries.js     # Discovery service (run by GitHub Action)
│   └── scrape-battery.js         # Price scraper (run by GitHub Action)
├── migrations/                   # Supabase SQL migration files (run manually)
├── config/
│   └── discovery-config.json     # Discovery settings (max candidates, delays, etc.)
├── .github/workflows/
│   ├── discover-batteries.yml    # Weekly discovery automation
│   └── update-battery-prices.yml # Twice-weekly price scraping
└── .env.local                    # Local environment variables (gitignored)
```

---

## Common Tasks

### Add a Battery Manually

```sql
INSERT INTO batteries (name, target_url, supplier, current_price)
VALUES ('Anker 767', 'https://us.anker.com/products/a1770', 'Anker', 2399.00);
```

### View Recent Price Changes

```sql
SELECT b.name, ph.price, ph.scraped_at
FROM price_history ph
JOIN batteries b ON b.id = ph.battery_id
WHERE ph.scraped_at > NOW() - INTERVAL '7 days'
ORDER BY ph.scraped_at DESC;
```

### Check Discovery Status

```sql
SELECT name, last_searched_at, last_products_found, enabled, scrape_verified
FROM manufacturers
ORDER BY last_searched_at DESC;
```

### Force Rediscovery for a Manufacturer

```sql
UPDATE manufacturers
SET last_searched_at = NULL
WHERE name = 'Anker';
```

Then run discovery manually or wait for next scheduled run.

---

## Troubleshooting

### "Invalid API key" Error

- Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` is correct in `.env.local`
- Restart dev server after changing `.env.local`
- Check Supabase dashboard → Settings → API for correct key

### Admin Token Keeps Prompting

- Clear browser sessionStorage (DevTools → Application → Session Storage)
- Verify `ADMIN_TOKEN` in `.env.local` matches what you're entering
- Check for extra spaces or quotes around the token value

### Discovery Finds No Candidates

- Check `manufacturers` table: ensure `enabled=true` AND `scrape_verified=true`
- Run locally with console output: `node scripts/discover-batteries.js`
- Check `price_extraction_failures` table for products that failed price extraction
- Verify manufacturer's catalog URL still works (sites change structure)

### Next.js Dev Server Slow to Start

```bash
rm -rf .next
npm run dev
```

### Vercel Deployment Fails

- Check build logs in Vercel dashboard
- Verify all environment variables are set
- Ensure migrations have been run in Supabase
- Check that `NEXT_PUBLIC_SUPABASE_URL` and keys are correct

---

## Additional Documentation

- **[DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)**: Complete table reference with all columns and relationships
- **[PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md)**: Development phases, status, and future enhancements
- **[CANDIDATE_REVIEW_GUIDE.md](./CANDIDATE_REVIEW_GUIDE.md)**: Detailed review workflow and SQL examples
- **[migrations/README.md](./migrations/README.md)**: Migration history and manual execution instructions

---

## Contributing

This is a personal project for tracking battery prices. The manufacturer list and filter keywords are tuned for consumer backup power products (1kWh+). 

If forking:
1. Create your own Supabase project
2. Update manufacturer list and keywords for your use case
3. Adjust discovery config (`config/discovery-config.json`) for your rate limits

---

## License

MIT License - See LICENSE file for details
