# Quick Deployment Steps

## Database Setup (10 min)

Run these SQL files in Supabase SQL Editor (in order):
1. `migrations/001_create_manufacturers_table.sql`
2. `migrations/002_create_battery_candidates_table.sql`
3. `migrations/004_update_batteries_table.sql`

Verify tables created: `manufacturers`, `battery_candidates`

## Deploy Workflow

```bash
git add .github/workflows/discover-batteries.yml
git commit -m "Add battery discovery workflow"
git push origin main
```

## Run First Discovery

1. Go to GitHub → Actions
2. Click "Discover Battery Candidates"
3. Click "Run workflow" → Select `main` → Run
4. Wait ~5-10 minutes
5. Check Supabase → `battery_candidates` table for results

## Schedule

Runs automatically every Monday at 7:00 AM UTC

## Review Candidates

Use Supabase Dashboard Table Editor to review and approve candidates manually.

See PROJECT_ROADMAP.md for full details.
