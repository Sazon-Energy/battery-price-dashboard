# Copilot / AI Agent Instructions

Purpose: Help an AI contributor quickly understand and work in this repository (Flask web app + Supabase + Python scrapers).

- Quick start
  - Install: `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`.
  - Run the web app: `flask --app batterydashboard run` (dev) or `gunicorn wsgi:app` (prod-like).
  - Run the batch price updater locally (requires admin env vars): `python -m services.update_all_prices` (add a battery id to refresh just one).
  - Run discovery locally: `python -m services.discover_batteries`.

- Big picture (core components)
  - Web app: Flask package `batterydashboard/` — app factory in `__init__.py`, blueprints in `routes/` (dashboard `/`, JSON `api.py`, admin `admin.py`), Jinja2 `templates/`, plain CSS/JS in `static/`.
  - DB access: `batterydashboard/database.py` — `get_supabase()` (anon key, RLS reads) and `get_supabase_admin()` (service-role, writes). PostgREST via supabase-py; no ORM.
  - Shared extraction: `batterydashboard/extraction/` — `price_extractor.py` (deterministic price extraction), `spec_extractor.py` (capacity/power/name), `llm_extractor.py` (Claude Haiku fallback), `failure_logger.py`.
  - Scrapers & batch jobs: `services/` — `scrape_battery.py` (single-battery scrape), `update_all_prices.py` (batch orchestration + DB writes), `discover_batteries.py` (candidate discovery).
  - Admin auth: `batterydashboard/admin_auth.py` — session login (`ADMIN_PASSWORD` + `SESSION_SECRET`) guards the admin area.
  - CI/schedule: `.github/workflows/update-battery-prices.yml` (Sun & Wed) and `discover-batteries.yml` (Mon).

- Data flow summary
  1. Scraper (`services/scrape_battery.py`) extracts price from the target URL using prioritized methods (JSON-LD → meta tags → data attrs → CSS selectors → inline-JS heuristics), then an LLM fallback.
  2. `services/update_all_prices.py` calls `scrape_battery`, updates `batteries.current_price` via the admin client, and inserts into `price_history`.
  3. The web app server-renders current prices via the anon client; the price-history modal calls `/api/price-history`.

- Important environment variables (local dev & CI)
  - Reads: `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`), `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - Admin/writes: `SUPABASE_SERVICE_ROLE_KEY`.
  - Web admin login: `ADMIN_PASSWORD`, `SESSION_SECRET`.
  - Services LLM fallback: `ANTHROPIC_API_KEY` (not used by the web app).
  - Local env file: `.env.local` is loaded by `config.py` (no-op in CI/Render where real env vars are set).

- Project-specific conventions & patterns
  - Structured-data-first scraping: try JSON-LD before brittle selectors — preserve this order when editing `price_extractor.py`.
  - Server-side writes only with the admin client (`get_supabase_admin()`); never expose the service-role key to the browser.
  - `batteries.updated_at` is set explicitly in code (only `battery_candidates` has a DB trigger).
  - Small throttling: batch jobs pause 2s between requests; keep or increase the delay when adding targets.

- Where to look for common tasks (examples)
  - Dashboard + history UI: `batterydashboard/routes/dashboard.py`, `templates/dashboard.html`, `static/modal.js`.
  - Scraper logic & heuristics: `batterydashboard/extraction/price_extractor.py`.
  - Batch runner & summary: `services/update_all_prices.py`.
  - Admin approve/reject: `batterydashboard/routes/admin.py`.
  - Price-extractor regression test: `tests/parity_check.py` (+ `tests/fixtures/`).

- Editing & testing tips for AI edits
  - After changing price extraction, run `python tests/parity_check.py` — it compares against a golden snapshot of the original behavior.
  - Preserve the structured-data-first order; add new selectors only as fallbacks.
  - Validate DB writes carefully; prefer a disposable test project or a self-cleaning insert/delete to avoid corrupting production data.

If anything here is unclear or you want more detail about a specific file or workflow, say which area to expand.
