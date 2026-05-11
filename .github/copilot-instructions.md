# Copilot / AI Agent Instructions

Purpose: Help an AI contributor quickly understand and work in this repository (Next.js frontend + Supabase + scrapers).

- Quick start
  - Install & run dev server: `npm install` then `npm run dev`.
  - Run the batch scraper locally (requires admin env vars): `node scripts/update-all-prices.js`.
  - Build for production: `npm run build` and `npm start`.

- Big picture (core components)
  - Frontend: Next.js app (app/) — primary UI lives in `app/page.js` and global layout in `app/layout.js`.
  - Client DB access: `lib/supabase.js` (uses `NEXT_PUBLIC_*` keys; safe for client-side reads).
  - Server/API routes: `app/api/price-history/route.js` and `app/api/update-price/route.js` — prefer these over exposing service keys to the client.
  - Scrapers & batch jobs: `scripts/` — `scrape-battery.js` contains the scraper heuristics; `update-all-prices.js` orchestrates batch runs and calls `supabase-admin` helpers.
  - Admin DB client: `scripts/supabase-admin.js` (requires `SUPABASE_SERVICE_ROLE_KEY`).
  - CI/schedule: GitHub Actions workflow at `.github/workflows/update-battery-prices.yml` triggers scheduled scraping.

- Data flow summary
  1. Scraper (`scripts/scrape-battery.js`) extracts price from target URL using prioritized methods (JSON-LD → meta tags → data attrs → CSS selectors → inline JS heuristics).
  2. `scripts/update-all-prices.js` calls `scrape-battery.js`, updates `batteries.current_price` via the admin client, and inserts into `price_history`.
  3. Frontend reads current prices via `lib/supabase.js` or requests history using the secure API route `/api/price-history`.

- Important environment variables (local dev & CI)
  - Client: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (used in `lib/supabase.js`).
  - Admin: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` (used in `scripts/supabase-admin.js`).
  - Local env file: `.env.local` is loaded by scripts when `GITHUB_ACTIONS` is not set.

- Project-specific conventions & patterns
  - Scraper-first approach: scrapers try structured data first (JSON-LD) before falling back to brittle selectors — preserve this order when updating `scripts/scrape-battery.js`.
  - Server-side updates: write to DB only with the admin client (`supabaseAdmin`) to avoid leaking service keys to the browser.
  - Small throttling: batch job pauses between requests (`2000ms` delay) to be polite to target sites; keep or increase delay when adding more targets.

- Where to look for common tasks (examples)
  - Frontend list & history UI: `app/page.js` (fetches via `/api/price-history`).
  - Scraper logic & heuristics: `scripts/scrape-battery.js`.
  - Batch runner & summary: `scripts/update-all-prices.js`.
  - Admin client bootstrapping: `scripts/supabase-admin.js`.
  - CI schedule: `.github/workflows/update-battery-prices.yml`.

- Editing & testing tips for AI edits
  - When changing scraping heuristics: add unit-like logging and example URLs in a local dev run before committing.
  - Preserve the structured-data-first order; add new selectors only as fallbacks.
  - Validate DB writes locally with admin keys in a disposable test project to avoid corrupting production data.

If anything in this summary is unclear or you want more detail about a specific file or workflow, tell me which area to expand. 
