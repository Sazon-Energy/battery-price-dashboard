# Battery Discovery Service - Deployment Guide

This guide walks through deploying the battery discovery service with weekly automated runs via GitHub Actions.

## Prerequisites

- GitHub repository already set up
- Supabase project already configured
- GitHub secrets already configured (from existing price scraper setup)

---

## Step 1: Run Database Migrations

The discovery service requires new database tables. Run these migrations in your Supabase SQL editor.

### 1.1 Create Manufacturers Table

```bash
# In Supabase Dashboard:
# 1. Go to SQL Editor
# 2. Create new query
# 3. Copy contents of migrations/001_create_manufacturers_table.sql
# 4. Run query
```

Location: `migrations/001_create_manufacturers_table.sql`

### 1.2 Create Battery Candidates Table

```bash
# In Supabase Dashboard:
# 1. Go to SQL Editor
# 2. Create new query
# 3. Copy contents of migrations/002_create_battery_candidates_table.sql
# 4. Run query
```

Location: `migrations/002_create_battery_candidates_table.sql`

### 1.3 Update Batteries Table

```bash
# In Supabase Dashboard:
# 1. Go to SQL Editor
# 2. Create new query
# 3. Copy contents of migrations/004_update_batteries_table.sql
# 4. Run query
```

Location: `migrations/004_update_batteries_table.sql`

### 1.4 Verify Tables Created

In Supabase Dashboard → Table Editor, verify these tables exist:
- ✅ `manufacturers`
- ✅ `battery_candidates`
- ✅ `batteries` (should have new columns: `candidate_id`, `discovered_by`)

---

## Step 2: Seed Manufacturer Data

The manufacturers table needs initial data. You'll add manufacturer records manually.

### 2.1 Access Manufacturers Table

1. Open Supabase Dashboard
2. Go to **Table Editor**
3. Select **manufacturers** table
4. Click **Insert row**

### 2.2 Add Anker (Example)

Add a row with these values:

| Column | Value |
|--------|-------|
| `name` | `Anker` |
| `domain` | `ankersolix.com` |
| `catalog_url` | `https://www.ankersolix.com/collections/solix-portable-power` |
| `include_keywords` | `["portable power", "solix", "battery", "power station"]` |
| `exclude_keywords` | `["solar panel", "cable", "expansion battery", "extra battery", "bundle"]` |
| `min_capacity_kwh` | `1.0` |
| `max_capacity_kwh` | `15.0` |
| `enabled` | `true` |
| `notes` | `Main Anker portable power station catalog` |

### 2.3 Add More Manufacturers (Optional)

You can add more manufacturers now or later. Here are suggestions:

**EcoFlow**
- Domain: `us.ecoflow.com`
- Catalog URL: `https://us.ecoflow.com/collections/portable-power-stations`

**Jackery**
- Domain: `jackery.com`
- Catalog URL: `https://www.jackery.com/collections/portable-power-station`

**Bluetti**
- Domain: `bluettipower.com`
- Catalog URL: `https://www.bluettipower.com/collections/portable-power-station`

**Goal Zero**
- Domain: `goalzero.com`
- Catalog URL: `https://www.goalzero.com/collections/portable-power-stations`

> **Note:** Start with just Anker for initial testing. Add more manufacturers after verifying the first one works.

---

## Step 3: Verify Configuration File

The discovery service uses `config/discovery-config.json` for settings.

### 3.1 Check Current Config

File location: `config/discovery-config.json`

Current settings:
```json
{
  "enabled": true,
  "maxCandidatesPerRun": 5,
  "manufacturersPerRun": 1,
  "crawlDelayMs": 2000
}
```

### 3.2 Configuration Explained

| Setting | Value | Purpose |
|---------|-------|---------|
| `enabled` | `true` | Master switch - set to `false` to disable discovery |
| `maxCandidatesPerRun` | `5` | Stop after finding 5 new candidates (prevents overwhelming you) |
| `manufacturersPerRun` | `1` | Process 1 manufacturer per run (fair rotation) |
| `crawlDelayMs` | `2000` | Wait 2 seconds between requests (be nice to servers) |

> **Recommendation:** Keep these conservative values for initial deployment.

---

## Step 4: Verify GitHub Secrets

The GitHub Actions workflow needs these secrets (should already be configured from price scraper).

### 4.1 Check Existing Secrets

1. Go to GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Verify these secrets exist:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

### 4.2 If Secrets Missing

If secrets are not configured, add them:

1. Get values from `.env.local` file
2. In GitHub: **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret:

**NEXT_PUBLIC_SUPABASE_URL**
```
Value: https://your-project.supabase.co
```

**SUPABASE_SERVICE_ROLE_KEY**
```
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> ⚠️ **Security:** Never commit the service role key to git!

---

## Step 5: Test Discovery Locally (Optional but Recommended)

Before deploying, test the discovery service on your local machine.

### 5.1 Run Discovery Script

```bash
# Make sure you're in the project directory
cd /path/to/battery-dashboard

# Install dependencies (if not already done)
npm install

# Run discovery
node scripts/discover-batteries.js
```

### 5.2 Expected Output

```
╔════════════════════════════════════════════════════════════════╗
║           Battery Discovery - Production Version              ║
╚════════════════════════════════════════════════════════════════╝

✅ Loaded configuration from config/discovery-config.json
📋 Found 1 enabled manufacturer(s) to process

══════════════════════════════════════════════════════════════════
Processing: Anker
══════════════════════════════════════════════════════════════════

🔍 Crawling Anker catalog: https://www.ankersolix.com/...
   ✓ Found 45 potential product URLs

[1] Analyzing: https://www.ankersolix.com/products/f3800
   ✅ Created candidate: Anker SOLIX F3800
      Confidence: 85%

[2] Analyzing: https://www.ankersolix.com/products/f2000
   ✅ Created candidate: Anker SOLIX F2000
      Confidence: 75%

...

✅ Anker complete: 5 candidates created in 28.3s

╔════════════════════════════════════════════════════════════════╗
║  Discovery Complete: 5 total candidates created               ║
╚════════════════════════════════════════════════════════════════╝
```

### 5.3 Verify Candidates in Database

1. Open Supabase Dashboard
2. Go to **Table Editor**
3. Select **battery_candidates** table
4. You should see 5 new rows

---

## Step 6: Deploy GitHub Actions Workflow

The workflow file has already been created at `.github/workflows/discover-batteries.yml`.

### 6.1 Commit and Push Workflow

```bash
# Stage the workflow file
git add .github/workflows/discover-batteries.yml

# Commit
git commit -m "Add weekly battery discovery automation"

# Push to GitHub
git push origin main
```

### 6.2 Verify Workflow Uploaded

1. Go to GitHub repository
2. Navigate to **Actions** tab
3. You should see a new workflow: **"Discover Battery Candidates"**

---

## Step 7: Run First Discovery (Manual Trigger)

Instead of waiting for the weekly schedule, trigger the first run manually.

### 7.1 Trigger Workflow

1. Go to **Actions** tab in GitHub
2. Click **Discover Battery Candidates** workflow
3. Click **Run workflow** button
4. Select branch: `main`
5. Click **Run workflow**

### 7.2 Monitor Execution

1. Click on the running workflow
2. Click on the **discover-batteries** job
3. Watch the logs in real-time

### 7.3 Expected Duration

- ~5-10 minutes for 1 manufacturer, 5 candidates
- Depends on website response times

---

## Step 8: Review Candidates in Supabase Dashboard

After the workflow completes successfully, review the candidates.

### 8.1 Access Candidates Table

1. Open Supabase Dashboard
2. Go to **Table Editor**
3. Select **battery_candidates** table
4. Filter by: `status = 'pending'`

### 8.2 Review Candidate Details

For each candidate, review:
- **name**: Product name (should be recognizable)
- **url**: Product page URL (verify it's valid)
- **normalized_url**: Cleaned URL for deduplication
- **manufacturer_id**: Should match manufacturer in database
- **extracted_specs**: JSON with capacity, power, etc.
- **confidence_score**: 0-100 (higher = better extraction quality)
- **status**: Should be `'pending'`

### 8.3 Approve Your First Candidate

To approve a candidate and add it to the batteries table:

1. **Review the extracted specs** - Are they accurate?
2. **Open the product URL** - Verify it's a real battery product
3. **Copy the candidate data**:
   - `name`
   - `url`
   - `manufacturer_id`
   - `extracted_specs.capacity_kwh` (or correct it)
   - `extracted_specs.power_w` (or correct it)
4. **Go to batteries table** → **Insert row**
5. **Fill in the details**:
   - Set `name`, `url`, `manufacturer_id`
   - Set `capacity_kwh`, `power_w` (corrected values)
   - Set `battery_class_id` (use the suggested one or choose manually)
   - Set `discovered_by` = `'auto'`
6. **Note the new battery's ID**
7. **Go back to battery_candidates table**
8. **Edit the candidate row**:
   - Set `status` = `'approved'`
   - Set `battery_id` = (the ID from step 6)
   - Set `reviewed_at` = NOW()
9. **Save**

> **Note:** This manual process is why we recommend building a CLI tool later. For now, this works for low-volume reviews.

---

## Step 9: Verify Automated Schedule

The workflow is now deployed and will run automatically.

### 9.1 Schedule

**Weekly on Mondays at 7:00 AM UTC**

Your local time depends on your timezone:
- EST (UTC-5): Monday 2:00 AM
- PST (UTC-8): Monday 11:00 PM (Sunday night)
- CET (UTC+1): Monday 8:00 AM

### 9.2 Change Schedule (Optional)

Edit `.github/workflows/discover-batteries.yml`:

```yaml
on:
  schedule:
    # Run every Monday at 7:00 AM UTC
    - cron: '0 7 * * 1'
```

Cron format: `minute hour day-of-month month day-of-week`

Examples:
- `'0 7 * * 1'` - Every Monday at 7:00 AM UTC
- `'0 7 * * 1,4'` - Monday and Thursday at 7:00 AM UTC
- `'0 14 * * 6'` - Every Saturday at 2:00 PM UTC

[Crontab Guru](https://crontab.guru/) - Helpful cron schedule expression editor

---

## Step 10: Monitoring and Maintenance

### 10.1 Check Workflow Status

GitHub will email you if a workflow fails.

You can also check manually:
1. Go to **Actions** tab
2. Look for ✅ (success) or ❌ (failure) icons
3. Click on a workflow run to see detailed logs

### 10.2 Common Failure Reasons

| Issue | Solution |
|-------|----------|
| Database connection failed | Check Supabase service status |
| No manufacturers enabled | Enable at least one manufacturer in database |
| Website blocking requests | Reduce `crawlDelayMs`, update `userAgent` |
| All products already known | Normal - means discovery is working! |
| Rate limit exceeded | Increase `crawlDelayMs` in config |

### 10.3 Adjusting Limits

If you want to discover more candidates per run:

1. Edit `config/discovery-config.json`
2. Increase `maxCandidatesPerRun` (e.g., from 5 to 10)
3. Increase `manufacturersPerRun` (e.g., from 1 to 2)
4. Commit and push changes

```bash
git add config/discovery-config.json
git commit -m "Increase discovery limits"
git push origin main
```

### 10.4 Pausing Discovery

To temporarily disable discovery without deleting the workflow:

**Option 1: Disable in config**
```json
{
  "enabled": false
}
```

**Option 2: Disable workflow in GitHub**
1. Go to **Actions** tab
2. Click **Discover Battery Candidates**
3. Click **⋯** (three dots) → **Disable workflow**

---

## Deployment Checklist

Use this checklist to verify everything is set up correctly:

### Database Setup
- [ ] Ran migration `001_create_manufacturers_table.sql`
- [ ] Ran migration `002_create_battery_candidates_table.sql`
- [ ] Ran migration `004_update_batteries_table.sql`
- [ ] Verified tables exist in Supabase
- [ ] Added at least one manufacturer (Anker recommended)

### Configuration
- [ ] `config/discovery-config.json` exists and is valid
- [ ] `enabled` is set to `true`
- [ ] Limits are reasonable (start with 5 candidates, 1 manufacturer)

### GitHub Setup
- [ ] Workflow file committed: `.github/workflows/discover-batteries.yml`
- [ ] Secrets configured: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Workflow visible in Actions tab

### Testing
- [ ] Ran discovery locally (optional but recommended)
- [ ] Triggered manual workflow run in GitHub Actions
- [ ] Workflow completed successfully
- [ ] Candidates appear in `battery_candidates` table

### Ongoing
- [ ] Reviewed candidates in Supabase
- [ ] Approved at least one candidate (optional)
- [ ] Set up email notifications for workflow failures (GitHub auto-sends)
- [ ] Bookmarked Supabase Dashboard for weekly reviews

---

## Next Steps

### Immediate (This Week)
1. ✅ Deploy discovery service (you're here!)
2. Let it run weekly for 2-4 weeks
3. Review candidates in Supabase Dashboard
4. Collect feedback on the manual review process

### Short Term (2-4 Weeks)
1. Add more manufacturers to database
2. Tune include/exclude keywords based on results
3. Adjust confidence scoring if needed
4. Consider building CLI tool if manual review is tedious (see `SECURE_ADMIN_OPTIONS.md`)

### Long Term (2-3 Months)
1. Improve spec extraction accuracy
2. Build web UI for candidate review (localhost only)
3. Implement vision-based spec extraction (see `PROJECT_ROADMAP.md`)
4. Add more manufacturers (expand beyond top 5)

---

## Troubleshooting

### Issue: No candidates found

**Possible causes:**
- Manufacturer website structure changed
- Include keywords too strict
- All products already in database (check batteries table)
- Website blocking requests

**Solutions:**
1. Check manufacturer website manually - is it accessible?
2. Review include/exclude keywords
3. Check `batteries` table for existing products
4. Increase `crawlDelayMs` to avoid rate limiting

### Issue: Too many false positives (non-batteries)

**Solution:**
1. Edit manufacturer record in database
2. Add more specific `exclude_keywords`
3. Narrow `include_keywords`
4. Adjust `min_capacity_kwh` threshold

### Issue: Workflow fails with "Database connection failed"

**Solution:**
1. Check Supabase service status
2. Verify GitHub secrets are correct
3. Check if Supabase free tier is paused (happens after inactivity)

### Issue: Candidates have incorrect specs

**Expected behavior:**
- Specs are kept for reference but not perfect
- Correct them during manual approval
- Future enhancement: vision-based extraction (see `PROJECT_ROADMAP.md`)

---

## Support

### Documentation
- `PROJECT_ROADMAP.md` - Project overview and future plans
- `SECURE_ADMIN_OPTIONS.md` - Admin interface options
- `migrations/README.md` - Database schema documentation

### Logs
- Local runs: Console output
- GitHub Actions: Actions tab → Workflow run → Job logs

### Useful Links
- [Supabase Dashboard](https://app.supabase.com)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Cron Schedule Editor](https://crontab.guru/)

---

**Deployment Status:** Ready to deploy! 🚀

Follow the steps above to get your battery discovery service running with weekly automated searches.
