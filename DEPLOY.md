# Quick Deployment Steps

## Local Development

Start the development server:
```bash
npm run dev
```

The app will be available at:
- `http://localhost:3000` - Main battery dashboard
- `http://localhost:3000/candidates` - Candidate review page

**Troubleshooting:** If the server takes more than 30 seconds to start or shows webpack cache errors, clear the Next.js cache:
```bash
rm -rf .next
npm run dev
```

## Database Setup (10 min)

Run these SQL files in Supabase SQL Editor (in order):
1. `migrations/001_create_manufacturers_table.sql`
2. `migrations/002_create_battery_candidates_table.sql`
3. `migrations/004_update_batteries_table.sql`
4. `migrations/005_remove_cross_references.sql` (optional - simplifies schema)

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

Use the web UI at `/candidates` or use batch SQL operations.

See `CANDIDATE_REVIEW_GUIDE.md` for the complete workflow.
