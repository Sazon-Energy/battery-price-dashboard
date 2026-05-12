# Candidate Review Workflow

## Overview
The discovery script finds new battery products on verified manufacturer sites and stores them in `battery_candidates` (status `pending`) along with their discovered price. You review them in the admin UI and approve or reject with one click.

## Setup

### 1. Set the admin token
Generate a strong token and add it to `.env.local` (and to your hosting environment, e.g. Vercel):

```bash
openssl rand -hex 32
# Add the output to .env.local:
ADMIN_TOKEN=<generated-token>
```

The token is required by the approve/reject API routes. Without it those endpoints return 401.

### 2. Open the admin page
Navigate to `/candidates` (the page is intentionally not linked from the main UI). When you take an action, the page will prompt for the admin token once and cache it in `sessionStorage` for the rest of the browser session.

## Reviewing Candidates

For each pending row you'll see:

- Manufacturer
- Battery Name (clickable link to the product page)
- Capacity (auto-extracted, treat as a hint)
- Discovered Price
- Discovered timestamp
- **Approve** / **Reject** buttons

**Approve** inserts a new row into `batteries` (with `current_price = discovered_price`), seeds the first `price_history` row, and marks the candidate as `approved`. Battery class is left unset and can be backfilled later.

**Reject** prompts for an optional reason and marks the candidate as `rejected`.

## Discovery Failures

If discovery identifies a battery product page but the price extractor cannot find a price, the candidate is **not** inserted - the failure is logged to `price_extraction_failures` instead. Review that table periodically to find scraper improvements or batteries that need to be added manually.

```sql
SELECT product_name, url, manufacturer_id, attempted_at
FROM price_extraction_failures
ORDER BY attempted_at DESC
LIMIT 50;
```

## Reliability Gate

Discovery only runs against manufacturers where `enabled=true AND scrape_verified=true`. Flip `scrape_verified` to `true` only after manually confirming the price scraper works on that manufacturer's product pages.
