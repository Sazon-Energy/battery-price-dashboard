# Battery Price Monitor

Automated price tracking and discovery for consumer battery products (power stations, solar generators, home backup systems).

Python stack: a **Flask** web dashboard, **Supabase** (PostgreSQL) for storage, and scheduled **GitHub Actions** that run Python scraper services to keep the database current.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Flask Web App (Render)                    │
│  • Main dashboard (server-rendered price tables)             │
│  • /candidates (admin-only review, session login)            │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ├── Read:  Supabase (anon key, RLS-protected)
                  └── Write: admin approve/reject (service role key)
                          │
                          ▼
            ┌─────────────────────────────┐
            │   Supabase PostgreSQL       │
            │  • batteries                │
            │  • battery_classes          │
            │  • price_history            │
            │  • manufacturers            │
            │  • battery_candidates       │
            │  • price_extraction_failures│
            └─────────────────────────────┘
                          ▲
                          │
            ┌─────────────┴──────────────┐
            │                            │
    ┌───────┴────────┐       ┌──────────┴─────────┐
    │ Price Updater  │       │ Discovery Service  │
    │ (GitHub Action)│       │ (GitHub Action)    │
    │ Sun & Wed      │       │ Mondays            │
    └────────────────┘       └────────────────────┘
```

**Data Flow:**

1. **Discovery** (weekly): Crawls manufacturer sites → extracts specs + price → creates `battery_candidates` (pending review).
2. **Review** (manual): Admin approves a candidate via `/candidates` → creates a `batteries` row + seeds `price_history`.
3. **Price Tracking** (Sun & Wed): Scrapes approved batteries → updates `current_price` + inserts a `price_history` row.
4. **Dashboard**: Server-renders batteries with current prices and historical data.

### Technology

| Concern | Library / service |
|---|---|
| Web framework | Flask + Jinja2 (server-rendered) |
| Production server | gunicorn on Render |
| Database access | `supabase` (supabase-py, PostgREST over HTTPS) |
| HTTP scraping | `httpx` |
| HTML parsing | `beautifulsoup4` |
| LLM fallback extraction | `anthropic` (Claude Haiku 4.5) |
| Config / secrets | `python-dotenv` (local), env vars (CI / Render) |
| Scheduling | GitHub Actions cron |

---

## Local Development

### Prerequisites

- Python 3.11+ (CI and Render use 3.12; the code also runs on 3.9)
- A Supabase project (free tier is sufficient)
- Git

### 1. Clone and install

```bash
git clone https://github.com/Sazon-Energy/battery-price-dashboard.git
cd battery-price-dashboard
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Database setup

Create a Supabase project, then run the SQL files in `migrations/` **in order** via the Supabase SQL Editor (see `migrations/README.md`). The three core tables (`batteries`, `battery_classes`, `price_history`) were originally created in the Supabase Studio table editor; their current shape is documented in [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md).

Expected tables: `batteries`, `battery_classes`, `price_history`, `manufacturers`, `battery_candidates`, `price_extraction_failures`.

### 3. Environment variables

Create `.env.local` in the project root:

```bash
# Supabase (Settings -> API). Names keep the NEXT_PUBLIC_ prefix from the
# previous stack so existing secrets don't need re-entering; SUPABASE_URL also works.
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...service-role-key

# Admin login for /candidates (approve/reject)
ADMIN_PASSWORD=choose-a-strong-password
SESSION_SECRET=$(openssl rand -hex 32)   # signs the session cookie

# Used by the scraper services only (LLM fallback). Not needed by the web app.
ANTHROPIC_API_KEY=sk-ant-...
```

| Variable | Used by | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) | web + services | Supabase project endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web reads + price updater | Read-only access (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | web admin writes + services | Bypasses RLS (server/CI only) |
| `ADMIN_PASSWORD` | web | Password for the admin login |
| `SESSION_SECRET` | web | Signs the admin session cookie |
| `ANTHROPIC_API_KEY` | services only | LLM extraction fallback |

`.env.local` is gitignored. `DATABASE_URL` may also be present for manual `psql` migration runs but is not used by the application code.

### 4. Run the web app

```bash
flask --app batterydashboard run     # dev server on http://localhost:5000
# or, like production:
gunicorn wsgi:app
```

Open:
- **Dashboard**: http://localhost:5000
- **Candidate Review**: http://localhost:5000/candidates (prompts for the admin password)

---

## Scraper Services

Both services are run by GitHub Actions on a schedule, and can be run locally from the repo root.

### Price updater — `services/update_all_prices.py`

Scrapes every tracked battery, updates `current_price`, and appends a `price_history` row.

```bash
python -m services.update_all_prices          # refresh all batteries
python -m services.update_all_prices <id>     # refresh a single battery
```

- Schedule: `.github/workflows/update-battery-prices.yml` — Sundays & Wednesdays, 06:00 UTC.
- Individual dead-URL failures are logged to `price_extraction_failures` and tolerated; the run only exits non-zero when nothing succeeds.

### Discovery — `services/discover_batteries.py`

Crawls one enabled + `scrape_verified` manufacturer per run, extracts specs + price, and inserts pending `battery_candidates`.

```bash
python -m services.discover_batteries
```

- Schedule: `.github/workflows/discover-batteries.yml` — Mondays, 07:00 UTC.
- Manual trigger: GitHub → Actions → the workflow → "Run workflow".
- Config: `config/discovery-config.json` (max candidates, crawl delays, LLM budget, etc.).

### Adding new manufacturers

1. Insert a row into `manufacturers` with the catalog URL and filter keywords.
2. Set `enabled=true` but `scrape_verified=false`.
3. Test locally: `python -m services.discover_batteries` (won't process unverified manufacturers).
4. Once price extraction is confirmed on their pages, set `scrape_verified=true`.

---

## Candidate Review & Approval

1. Navigate to `/candidates` and log in with `ADMIN_PASSWORD` (the page is not linked from the main UI).
2. **Approve** inserts a new `batteries` row (`current_price = discovered_price`), seeds `price_history`, and marks the candidate `approved`. Battery class is left unset.
3. **Reject** marks the candidate `rejected`.

See [CANDIDATE_REVIEW_GUIDE.md](./CANDIDATE_REVIEW_GUIDE.md).

Products that pass filters but have no extractable price are logged to `price_extraction_failures` rather than becoming candidates:

```sql
SELECT product_name, url, manufacturer_id, attempted_at
FROM price_extraction_failures
ORDER BY attempted_at DESC
LIMIT 50;
```

---

## Deployment to Render

The web app deploys to Render as a Python web service (defined in `render.yaml`). The scraper services keep running on GitHub Actions — they are not part of the web host.

### Initial setup

1. Push this repository to GitHub.
2. Render dashboard → **New +** → **Blueprint** → connect the repository. Render reads `render.yaml` and creates the web service:
   - Build: `pip install -r requirements.txt`
   - Start: `gunicorn wsgi:app --bind 0.0.0.0:$PORT`
   - Health check: `/healthz`
3. Set the secret env vars in the Render dashboard (`sync: false` in the blueprint): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`. `SESSION_SECRET` is generated by Render automatically.
4. Trigger a deploy.

**Auto-deploy:** with `autoDeploy: true`, pushing to `main` redeploys the service.

**Note on the free tier:** the service sleeps after ~15 minutes of inactivity and cold-starts on the next request. Because reads go to Supabase over HTTPS (PostgREST, stateless), there is no database connection pool to manage.

### GitHub Actions secrets

Set these repository secrets (Settings → Secrets and variables → Actions) — same names as before:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`.

---

## Security Architecture

1. **Row Level Security (RLS)**: the anon key can read the public tables but not modify them; the service-role key bypasses RLS for admin operations. `price_extraction_failures` has RLS enabled with no policies (service-role only).
2. **Admin session login**: `/candidates` and the approve/reject actions require a signed session established at `/login` with `ADMIN_PASSWORD`. If `ADMIN_PASSWORD` is unset, the admin area fails closed.
3. **Key isolation**: the service-role key and admin password live only in server/CI environments, never in the browser.

| Environment | Secret storage |
|-------------|----------------|
| Local dev | `.env.local` (gitignored) |
| Render (web) | Service environment variables |
| GitHub Actions (services) | Repository secrets |

---

## Project Structure

```
battery-price-dashboard/
├── wsgi.py                          # gunicorn entrypoint (app = create_app())
├── requirements.txt
├── render.yaml                      # Render Blueprint (web service)
├── .python-version                  # 3.12
├── batterydashboard/                # Flask application package
│   ├── __init__.py                  # create_app() factory
│   ├── config.py                    # env-var loading
│   ├── database.py                  # supabase-py clients (anon + service role)
│   ├── admin_auth.py                # session login guard
│   ├── http_client.py               # httpx GET helper
│   ├── timeutil.py                  # ISO timestamp helper
│   ├── discovery_config.py          # loads config/discovery-config.json
│   ├── routes/
│   │   ├── dashboard.py             # GET /
│   │   ├── api.py                   # GET /api/price-history
│   │   └── admin.py                 # /login, /logout, /candidates, approve, reject
│   ├── extraction/
│   │   ├── price_extractor.py       # deterministic price extraction (5 methods)
│   │   ├── spec_extractor.py        # capacity / power / name extraction
│   │   ├── llm_extractor.py         # Claude Haiku fallback
│   │   └── failure_logger.py        # normalize_url + failure logging
│   ├── templates/                   # base, dashboard, candidates, login
│   └── static/                      # style.css, modal.js
├── services/                        # scheduled scrapers (run by GitHub Actions)
│   ├── update_all_prices.py
│   ├── scrape_battery.py
│   └── discover_batteries.py
├── config/discovery-config.json
├── migrations/                      # Supabase SQL migrations
├── tests/                           # price-extractor regression check + fixtures
└── .github/workflows/               # discover-batteries.yml, update-battery-prices.yml
```

---

## Tests

```bash
python tests/parity_check.py
```

Checks the price extractor against `tests/fixtures/golden.json` — a snapshot captured from the original implementation covering all five extraction methods plus edge cases.

---

## Additional Documentation

- **[DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)**: table reference.
- **[PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md)**: development phases and history.
- **[CANDIDATE_REVIEW_GUIDE.md](./CANDIDATE_REVIEW_GUIDE.md)**: review workflow.
- **[DEPLOY.md](./DEPLOY.md)**: deployment quick reference.
- **[migrations/README.md](./migrations/README.md)**: migration history and instructions.

## License

MIT License - See LICENSE file for details.
