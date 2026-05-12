import axios from 'axios';
import { supabase } from '../lib/supabase.js';
import { extractPriceFromHtml } from '../lib/price-extractor.js';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

async function scrapePrice(batteryId) {
  if (!batteryId) {
    throw new Error('Battery ID is required');
  }

  const { data, error } = await supabase
    .from('batteries')
    .select('name, target_url')
    .eq('id', batteryId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch battery: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Battery with ID ${batteryId} not found in database`);
  }

  const { name: batteryName, target_url: url } = data;

  try {
    console.log(`🔍 Starting ${batteryName} scraping...`);
    console.log(`📡 Fetching ${batteryName} webpage...`);

    const response = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000
    });

    console.log(`✅ ${batteryName} page fetched successfully (${response.status})`);

    const { price, method } = extractPriceFromHtml(response.data, url);

    if (price) {
      console.log(`💰 Extracted ${batteryName} price: $${price} (via ${method})`);
      return {
        success: true,
        price,
        method,
        url,
        scrapedAt: new Date().toISOString()
      };
    } else {
      console.log(`❌ No price found for ${batteryName} at ${url}`);
      return {
        success: false,
        error: 'Price not found with any method',
        url
      };
    }
  } catch (error) {
    console.error(`❌ ${batteryName} scraping failed:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

export default scrapePrice;
