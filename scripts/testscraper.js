import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local file from project root (parent directory)
dotenv.config({ path: join(__dirname, '..', '.env.local') });

// Verify environment variables are loaded
console.log('🔍 Checking environment variables...');
console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing');
console.log('SUPABASE_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing');

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('\n❌ Environment variables not loaded. Check .env.local file exists.');
  process.exit(1);
}

// Now import the scraper (after env vars are loaded)
const { default: scrapePrice } = await import('./scrape-battery.js');

// Get battery ID from command line (as string for UUID support)
const batteryId = process.argv[2];

if (!batteryId) {
  console.error('\n❌ Usage: node test-scraper.js <batteryId>');
  console.error('   Example: node test-scraper.js 550e8400-e29b-41d4-a716-446655440000');
  process.exit(1);
}

console.log(`\n🚀 Testing scraper for battery ID: ${batteryId}\n`);

// Run the scraper
try {
  const result = await scrapePrice(batteryId);
  console.log('\n📊 Scraper Result:');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
} catch (error) {
  console.error('\n❌ Scraper Error:', error.message);
  process.exit(1);
}