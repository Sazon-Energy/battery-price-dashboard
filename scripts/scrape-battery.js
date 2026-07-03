import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../lib/supabase.js';
import { extractPriceFromHtml } from '../lib/price-extractor.js';
import { extractBatteryInfoWithLLM } from '../lib/llm-extractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

// LLM fallback budget - one per process (i.e. per `node scripts/update-all-prices.js` run).
// Loaded lazily so a missing/malformed config file doesn't crash price scraping.
function loadLlmFallbackConfig() {
  try {
    const configPath = path.join(__dirname, '../config/discovery-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
      enabled: config.llmFallbackEnabled ?? false,
      maxCallsPerRun: config.llmFallbackMaxCallsPerRun ?? 0
    };
  } catch (e) {
    return { enabled: false, maxCallsPerRun: 0 };
  }
}

const llmFallbackConfig = loadLlmFallbackConfig();
let llmFallbackCallsRemaining = llmFallbackConfig.maxCallsPerRun;

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
    }

    // Deterministic extraction failed - try the LLM fallback before giving up.
    if (llmFallbackConfig.enabled && llmFallbackCallsRemaining > 0) {
      llmFallbackCallsRemaining--;
      const $ = cheerio.load(response.data);
      const bodyText = $('body').text();
      const llmResult = await extractBatteryInfoWithLLM({ pageText: bodyText, url });

      if (llmResult && llmResult.price != null) {
        console.log(`💰 Extracted ${batteryName} price via LLM fallback: $${llmResult.price}`);
        return {
          success: true,
          price: llmResult.price,
          method: 'LLM fallback (Claude Haiku 4.5)',
          url,
          scrapedAt: new Date().toISOString()
        };
      }
    }

    console.log(`❌ No price found for ${batteryName} at ${url}`);
    return {
      success: false,
      error: 'Price not found with any method',
      url
    };
  } catch (error) {
    console.error(`❌ ${batteryName} scraping failed:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

export default scrapePrice;
