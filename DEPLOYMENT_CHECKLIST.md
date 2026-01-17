# Battery Discovery Deployment - Quick Checklist

Use this checklist to deploy the battery discovery service in ~30 minutes.

## Pre-Deployment (5 min)

- [ ] Verify you have access to:
  - [ ] Supabase Dashboard
  - [ ] GitHub repository admin access
  - [ ] `.env.local` file with Supabase credentials

## Database Setup (10 min)

1. **Run Migrations in Supabase SQL Editor:**
   - [x ] Copy/paste `migrations/001_create_manufacturers_table.sql` → Run
   - [x ] Copy/paste `migrations/002_create_battery_candidates_table.sql` → Run
   - [x ] Copy/paste `migrations/004_update_batteries_table.sql` → Run

2. **Verify Tables Created:**
   - [x ] `manufacturers` table exists (should have 5 rows)
   - [x ] `battery_candidates` table exists (should be empty)
   - [x ] `batteries` table has new columns: `candidate_id`, `discovered_by`

3. **Enable Anker for Testing:**
   - [ ] Open `manufacturers` table in Supabase Table Editor
   - [x ] Find "Anker" row
   - [x ] Verify `enabled` = `true` (should already be true from seed data)

## GitHub Setup (5 min)

1. **Verify GitHub Secrets (should already exist from price scraper):**
   - [x ] Settings → Secrets and variables → Actions
   - [x ] `NEXT_PUBLIC_SUPABASE_URL` exists
   - [x ] `SUPABASE_SERVICE_ROLE_KEY` exists

2. **Commit Workflow File:**
   ```bash
   git add .github/workflows/discover-batteries.yml
   git add DEPLOYMENT_GUIDE.md DEPLOYMENT_CHECKLIST.md SECURE_ADMIN_OPTIONS.md
   git commit -m "Add battery discovery automation with weekly runs"
   git push origin main
   ```

3. **Verify Workflow Appears:**
   - [ ] Go to Actions tab in GitHub
   - [ ] See "Discover Battery Candidates" workflow

## First Test Run (5 min)

1. **Trigger Manual Run:**
   - [ ] Actions tab → "Discover Battery Candidates"
   - [ ] Click "Run workflow" → Select `main` branch → Run

2. **Monitor Execution:**
   - [ ] Click on running workflow
   - [ ] Click on "discover-batteries" job
   - [ ] Watch logs (should take 5-10 min)

3. **Verify Success:**
   - [ ] Workflow shows green checkmark ✅
   - [ ] Logs show "Discovery Complete: X total candidates created"

## Review Candidates (5 min)

1. **Check Database:**
   - [ ] Open Supabase Dashboard
   - [ ] Table Editor → `battery_candidates`
   - [ ] Should see 1-5 new candidates
   - [ ] All have `status = 'pending'`

2. **Review First Candidate:**
   - [ ] Click on a candidate row
   - [ ] Check `name` - looks like a battery product?
   - [ ] Check `url` - click to verify it's a real product page
   - [ ] Check `extracted_specs` - has capacity/power data?
   - [ ] Check `confidence_score` - reasonable value?

## Post-Deployment

- [ ] Bookmark Supabase Dashboard for weekly candidate reviews
- [ ] Set up GitHub Actions email notifications (automatic)
- [ ] Schedule: Runs every Monday at 7 AM UTC
- [ ] Read `SECURE_ADMIN_OPTIONS.md` to decide on approval workflow

## Next Steps

### This Week
- [ ] Let discovery run for 1-2 weeks
- [ ] Review candidates weekly in Supabase Dashboard
- [ ] Manually approve 2-3 candidates to test workflow

### Next 2-4 Weeks
- [ ] Enable more manufacturers (EcoFlow, Jackery, etc.)
- [ ] Tune include/exclude keywords based on results
- [ ] Decide if CLI tool is needed (see `SECURE_ADMIN_OPTIONS.md`)

---

## Troubleshooting

### Workflow failed?
1. Check Actions logs for error message
2. Verify Supabase secrets are correct
3. Check if Supabase is paused (free tier inactivity)

### No candidates found?
1. Verify Anker is enabled in `manufacturers` table
2. Check `config/discovery-config.json` has `enabled: true`
3. Manufacturer website might be blocking requests (normal on first run)

### Too many false positives?
1. Edit manufacturer in database
2. Add stricter `exclude_keywords`
3. Increase `min_capacity_kwh` threshold

---

**Total Time:** ~30 minutes

**Status after deployment:**
- ✅ Discovery runs weekly (Mondays 7 AM UTC)
- ✅ Candidates automatically collected
- ⏳ Manual review via Supabase Dashboard (for now)
