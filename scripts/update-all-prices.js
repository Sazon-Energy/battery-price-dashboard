const scrapeGrowattPrice = require('./scrape-growatt.js');
const scrapeEcoFlowPrice = require('./scrape-ecoflow.js');
const scrapeAnkerPrice = require('./scrape-anker.js');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateBatteryPrice(batteryNamePattern, scrapeFunction, supplierName) {
  console.log(`\n🚀 Starting ${supplierName} price update...`);
  
  // Step 1: Scrape the price
  const scrapeResult = await scrapeFunction();
  
  if (!scrapeResult.success) {
    console.log(`❌ ${supplierName} scraping failed:`, scrapeResult.error);
    return { success: false, supplier: supplierName, error: scrapeResult.error };
  }
  
  console.log(`💰 ${supplierName} scraped price: $${scrapeResult.price}`);
  
  // Step 2: Find the battery in database
  const { data: batteries, error: findError } = await supabase
    .from('batteries')
    .select('id, name, current_price')
    .ilike('name', batteryNamePattern)
    .limit(1);
    
  if (findError) {
    console.error(`❌ ${supplierName} database query failed:`, findError);
    return { success: false, supplier: supplierName, error: findError.message };
  }
  
  if (!batteries || batteries.length === 0) {
    console.log(`❌ ${supplierName} battery not found in database (pattern: ${batteryNamePattern})`);
    return { success: false, supplier: supplierName, error: 'Battery not found in database' };
  }
  
  const battery = batteries[0];
  console.log(`📋 Found battery: ${battery.name} (current: $${battery.current_price || 'none'})`);
  
  // Step 3: Update the price
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
    console.error(`❌ ${supplierName} price update failed:`, updateError);
    return { success: false, supplier: supplierName, error: updateError.message };
  }

  // Step 4: Add to price history
  const { error: historyError } = await supabase
    .from('price_history')
    .insert([{
      battery_id: battery.id,
      price: scrapeResult.price,
      scraped_at: scrapeResult.scrapedAt
    }]);

  if (historyError) {
    console.warn(`⚠️ ${supplierName} price history update failed:`, historyError);
  }

  const priceChange = battery.current_price ? (scrapeResult.price - battery.current_price) : null;
  console.log(`✅ ${supplierName}: Updated ${battery.name} to $${scrapeResult.price}${priceChange ? ` (${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)})` : ''}`);
  
  return {
    success: true,
    supplier: supplierName,
    battery: updatedBattery,
    oldPrice: battery.current_price,
    newPrice: scrapeResult.price,
    priceChange: priceChange
  };
}

async function updateAllPrices() {
  console.log('🔄 Starting batch price update for all suppliers...\n');
  
  const results = [];
  
  // Update each supplier
  results.push(await updateBatteryPrice('%infinity%2000%pro%', scrapeGrowattPrice, 'Growatt'));
  results.push(await updateBatteryPrice('%delta%3%', scrapeEcoFlowPrice, 'EcoFlow'));
  results.push(await updateBatteryPrice('%solix%f2000%', scrapeAnkerPrice, 'Anker'));
  
  // Summary
  console.log('\n📊 BATCH UPDATE SUMMARY:');
  console.log('========================');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  successful.forEach(result => {
    console.log(`✅ ${result.supplier}: $${result.newPrice} ${result.priceChange ? `(${result.priceChange >= 0 ? '+' : ''}$${result.priceChange.toFixed(2)})` : ''}`);
  });
  
  failed.forEach(result => {
    console.log(`❌ ${result.supplier}: ${result.error}`);
  });
  
  console.log(`\n🎯 Success: ${successful.length}/${results.length} suppliers updated`);
  
  return {
    total: results.length,
    successful: successful.length,
    failed: failed.length,
    results: results
  };
}

// Run if called directly
if (require.main === module) {
  updateAllPrices().then(summary => {
    console.log('\n✨ Batch update completed!');
    process.exit(0);
  });
}

module.exports = updateAllPrices;
