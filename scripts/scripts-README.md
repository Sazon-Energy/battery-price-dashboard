# Battery Dashboard Scripts

This directory contains standalone scripts for testing and running background tasks.

## Testing the Battery Scraper

### Setup
Make sure your `.env.local` file in the project root contains:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### Run the scraper test
```bash
node scripts/testscraper.js <batteryId>
```

Example:
```bash
node scripts/testscraper.js 1
```

This will:
1. Load environment variables from `.env.local`
2. Fetch the battery details from Supabase
3. Scrape the price from the battery's target URL
4. Display the results

## Files

- `scrape-battery.js` - Generic battery scraper (takes batteryId as input)
- `test-scraper.js` - Test harness for running the scraper from command line
- `README.md` - This file

## Adding New Batteries

Just add them to the `batteries` table in Supabase with:
- `name` - Short name for logging
- `target_url` - URL to scrape

The scraper will work automatically for any battery in the database.
