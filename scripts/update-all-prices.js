import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { supabaseAdmin } from './supabase-admin.js'
import scrapePrice from './scrape-battery.js'

async function updateBatteryPrice(battery) {
  const { id: batteryId, name: batteryName } = battery;
  console.log(`\n🚀 Starting price update for ${batteryName}...`);
  
  // Step 1: Scrape the price using the generic scraper
  const scrapeResult = await scrapePrice(batteryId);
  
  if (!scrapeResult.success) {
    console.log(`❌ ${batteryName} scraping failed:`, scrapeResult.error);
    return { success: false, batteryId, batteryName, error: scrapeResult.error };
  }
  
  console.log(`💰 ${batteryName} scraped price: $${scrapeResult.price}`);
  
  // Step 2: Get current price for comparison
  const currentPrice = battery.current_price;
  console.log(`📋 Current price in database: $${currentPrice || 'none'}`);
  
  // Step 3: Update the price
  const { data: updatedBattery, error: updateError } = await supabaseAdmin
    .from('batteries')
    .update({ 
      current_price: scrapeResult.price,
      updated_at: new Date().toISOString()
    })
    .eq('id', batteryId)
    .select()
    .single();

  if (updateError) {
    console.error(`❌ ${batteryName} price update failed:`, updateError);
    return { success: false, batteryId, batteryName, error: updateError.message };
  }

  // Step 4: Add to price history
  const { error: historyError } = await supabaseAdmin
    .from('price_history')
    .insert([{
      battery_id: batteryId,
      price: scrapeResult.price,
      scraped_at: scrapeResult.scrapedAt
    }]);

  if (historyError) {
    console.warn(`⚠️ ${batteryName} price history update failed:`, historyError);
  }

  const priceChange = currentPrice ? (scrapeResult.price - currentPrice) : null;
  console.log(`✅ ${batteryName}: Updated to $${scrapeResult.price}${priceChange ? ` (${priceChange >= 0 ? '+' : ''}$${priceChange.toFixed(2)})` : ''}`);
  
  return {
    success: true,
    batteryId,
    batteryName,
    battery: updatedBattery,
    oldPrice: currentPrice,
    newPrice: scrapeResult.price,
    priceChange: priceChange
  };
}

async function updateAllPrices() {
  console.log('🔄 Starting batch price update for all batteries...\n');
  
  // Fetch all batteries from the database
  console.log('📥 Fetching all batteries from database...');
  const { data: batteries, error: fetchError } = await supabaseAdmin
    .from('batteries')
    .select('id, name, current_price, target_url')
    .order('name');
  
  if (fetchError) {
    console.error('❌ Failed to fetch batteries from database:', fetchError);
    return {
      total: 0,
      successful: 0,
      failed: 0,
      error: fetchError.message
    };
  }
  
  if (!batteries || batteries.length === 0) {
    console.log('⚠️ No batteries found in database');
    return {
      total: 0,
      successful: 0,
      failed: 0,
      results: []
    };
  }
  
  console.log(`📋 Found ${batteries.length} batteries to update\n`);
  
  const results = [];
  
  // Update each battery
  for (const battery of batteries) {
    const result = await updateBatteryPrice(battery);
    results.push(result);
    
    // Add a small delay between requests to be respectful to servers
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary
  console.log('\n📊 BATCH UPDATE SUMMARY:');
  console.log('========================');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  if (successful.length > 0) {
    console.log('\n✅ Successful updates:');
    successful.forEach(result => {
      const change = result.priceChange 
        ? ` (${result.priceChange >= 0 ? '+' : ''}$${result.priceChange.toFixed(2)})` 
        : '';
      console.log(`  • ${result.batteryName}: $${result.newPrice}${change}`);
    });
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed updates:');
    failed.forEach(result => {
      console.log(`  • ${result.batteryName}: ${result.error}`);
    });
  }
  
  console.log(`\n🎯 Success: ${successful.length}/${results.length} batteries updated`);
  
  return {
    total: results.length,
    successful: successful.length,
    failed: failed.length,
    results: results
  };
}

// Check if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const batteryId = process.argv[2];

  if (batteryId) {
    const { data, error } = await supabaseAdmin
      .from('batteries')
      .select('id, name, current_price, target_url')
      .eq('id', batteryId)
      .single();

    if (error || !data) {
      console.error(`❌ Battery ${batteryId} not found:`, error?.message);
      process.exit(1);
    }

    updateBatteryPrice(data).then(result => {
      if (result.success) {
        console.log('\n✨ Done!');
        process.exit(0);
      } else {
        console.error('\n❌ Failed:', result.error);
        process.exit(1);
      }
    });
  } else {
    updateAllPrices().then(summary => {
      console.log('\n✨ Batch update completed!');
      process.exit(summary.failed > 0 ? 1 : 0);
    }).catch(error => {
      console.error('\n❌ Batch update failed:', error);
      process.exit(1);
    });
  }
}

export default updateAllPrices;
