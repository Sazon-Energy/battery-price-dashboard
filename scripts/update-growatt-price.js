const scrapeGrowattPrice = require('./scrape-growatt.js');

// Import our Supabase client (we need to adjust the path)
const { createClient } = require('@supabase/supabase-js');

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateGrowattPrice() {
  console.log('🚀 Starting Growatt price update...\n');
  
  // Step 1: Scrape the price
  const scrapeResult = await scrapeGrowattPrice();
  
  if (!scrapeResult.success) {
    console.log('❌ Scraping failed, aborting update');
    return scrapeResult;
  }
  
  console.log(`\n💰 Scraped price: $${scrapeResult.price}`);
  
  // Step 2: Find the Growatt battery in database
  const { data: batteries, error: findError } = await supabase
    .from('batteries')
    .select('id, name, current_price')
    .ilike('name', '%infinity%2000%pro%')
    .limit(1);
    
  if (findError) {
    console.error('❌ Database query failed:', findError);
    return { success: false, error: findError.message };
  }
  
  if (!batteries || batteries.length === 0) {
    console.log('❌ Growatt Infinity 2000 Pro not found in database');
    console.log('💡 Please add it manually first or via SQL');
    return { success: false, error: 'Battery not found in database' };
  }
  
  const battery = batteries[0];
  console.log(`📋 Found battery: ${battery.name} (current price: $${battery.current_price || 'none'})`);
  
  // Step 3: Update the price in database
  const { data: updatedBattery, error: updateError } = await supabase
    .from('batteries')
    .update({ 
      current_price: scrapeResult.price,
      updated_at: new Date().toISOString()
    })
    .eq('id', battery.id)
    .select()
    .single();

  if (updateError) {
    console.error('❌ Failed to update battery price:', updateError);
    return { success: false, error: updateError.message };
  }

  // Step 4: Add to price history
  const { error: historyError } = await supabase
    .from('price_history')
    .insert([
      {
        battery_id: battery.id,
        price: scrapeResult.price,
        scraped_at: scrapeResult.scrapedAt
      }
    ]);

  if (historyError) {
    console.warn('⚠️ Failed to add to price history:', historyError);
  }

  console.log(`✅ Successfully updated ${battery.name} price to $${scrapeResult.price}`);
  
  return {
    success: true,
    battery: updatedBattery,
    oldPrice: battery.current_price,
    newPrice: scrapeResult.price,
    priceChange: battery.current_price ? (scrapeResult.price - battery.current_price).toFixed(2) : null
  };
}

// Run if called directly
if (require.main === module) {
  updateGrowattPrice().then(result => {
    console.log('\n📊 Update completed:', result);
    process.exit(0);
  });
}

module.exports = updateGrowattPrice;
