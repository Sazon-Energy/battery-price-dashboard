/**
 * Battery Discovery Script - Production Version
 *
 * Discovers new battery products from manufacturer websites and stores them
 * as candidates for manual review and approval.
 *
 * Features:
 * - Reads manufacturers from database (only enabled ones)
 * - Loads configuration from config/discovery-config.json
 * - Crawls manufacturer catalog pages for product URLs
 * - Extracts battery specs (capacity, power, etc.) - kept for reference
 * - Stores candidates in battery_candidates table (all require manual approval)
 * - Handles deduplication via normalized URLs (checks both candidates and batteries tables)
 * - Updates manufacturer metadata (last_searched_at, last_products_found)
 * - Skips URLs already known (in candidates or batteries table)
 *
 * Usage: node scripts/discover-batteries.js
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
const envPath = path.join(__dirname, '../.env.local');
console.log(`Loading environment from: ${envPath}`);
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('⚠️  Warning: Could not load .env.local:', result.error.message);
  console.log('Trying .env instead...');
  dotenv.config({ path: path.join(__dirname, '../.env') });
}

// Initialize Supabase with service role key for write access
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'Found' : 'Missing');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'Found' : 'Missing');
  console.error('\nMake sure these are set in .env.local or .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Load configuration
const configPath = path.join(__dirname, '../config/discovery-config.json');
let CONFIG;
try {
  CONFIG = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('✅ Loaded configuration from config/discovery-config.json');
} catch (error) {
  console.error('❌ Failed to load configuration:', error.message);
  process.exit(1);
}

// Validate configuration
if (!CONFIG.enabled) {
  console.log('⏸️  Discovery is disabled in configuration. Exiting.');
  process.exit(0);
}

/**
 * Normalize URL by removing query parameters and fragments
 */
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname;
  } catch (e) {
    return url;
  }
}

/**
 * Extract product URLs from catalog page
 */
async function extractProductUrls(manufacturer) {
  console.log(`\n🔍 Crawling ${manufacturer.name} catalog: ${manufacturer.catalog_url}`);

  try {
    const response = await axios.get(manufacturer.catalog_url, {
      headers: { 'User-Agent': CONFIG.userAgent },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const productUrls = new Set();

    // Find all links
    $('a[href]').each((i, elem) => {
      let href = $(elem).attr('href');
      if (!href) return;

      // Convert relative URLs to absolute
      if (href.startsWith('/')) {
        const baseUrl = new URL(manufacturer.catalog_url);
        href = baseUrl.origin + href;
      } else if (!href.startsWith('http')) {
        return;
      }

      // Only include URLs from manufacturer's domain
      try {
        const linkUrl = new URL(href);
        if (linkUrl.hostname.includes(manufacturer.domain)) {
          // Skip obvious non-product pages
          const path = linkUrl.pathname.toLowerCase();
          if (!path.includes('/collections') &&
              !path.includes('/pages') &&
              !path.includes('/blogs') &&
              !path.includes('/cart') &&
              !path.includes('/account')) {
            productUrls.add(href);
          }
        }
      } catch (e) {
        // Invalid URL, skip
      }
    });

    const urls = Array.from(productUrls);
    console.log(`   ✓ Found ${urls.length} potential product URLs`);
    return urls;

  } catch (error) {
    console.error(`   ❌ Failed to crawl catalog: ${error.message}`);
    return [];
  }
}

/**
 * Extract capacity in kWh from text
 */
function extractCapacity(text, productName) {
  const foundCapacities = [];

  // HIGHEST PRIORITY: Extract from product name first
  if (productName) {
    const whPattern = /([\d,]+)Wh/gi;
    const whMatches = productName.matchAll(whPattern);

    for (const match of whMatches) {
      const numStr = match[1].replace(/,/g, ''); // Remove commas
      let value = parseFloat(numStr) * 0.001; // Convert Wh to kWh

      if (value >= 1 && value <= 15) {
        foundCapacities.push({
          value: parseFloat(value.toFixed(3)),
          matched: match[0],
          priority: 100,
          source: 'product_name'
        });
      }
    }
  }

  // If found in name, return immediately
  if (foundCapacities.length > 0) {
    return foundCapacities[0];
  }

  // LOWER PRIORITY: Body text patterns
  const bodyPatterns = [
    { pattern: /Battery Capacity[:\s]+([\d.]+)\s*kWh/gi, multiplier: 1, priority: 10 },
    { pattern: /Capacity[:\s]+([\d.]+)\s*kWh/gi, multiplier: 1, priority: 9 },
    { pattern: /(\d{4,5})Wh/gi, multiplier: 0.001, priority: 7 },
    { pattern: /\(([\d,]+)Wh\)/gi, multiplier: 0.001, priority: 5 },
    { pattern: /([\d.]+)\s*kWh/gi, multiplier: 1, priority: 4 },
  ];

  for (const { pattern, multiplier, priority } of bodyPatterns) {
    const matches = text.matchAll(pattern);

    for (const match of matches) {
      const numStr = match[1].replace(/,/g, '');
      let value = parseFloat(numStr) * multiplier;

      if (value >= 1 && value <= 15) {
        foundCapacities.push({
          value: parseFloat(value.toFixed(3)),
          matched: match[0],
          priority,
          source: 'body_text'
        });
      }
    }
  }

  if (foundCapacities.length === 0) {
    return null;
  }

  // Sort by priority (highest first)
  foundCapacities.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.value - b.value;
  });

  return foundCapacities[0];
}

/**
 * Extract power ratings in Watts
 */
function extractPower(text) {
  const foundPowers = [];

  const powerPatterns = [
    { pattern: /(?:continuous|rated|AC\s+output)[:\s]+(\d+\.?\d*)\s*[kK]?W/gi, type: 'continuous', priority: 10 },
    { pattern: /(\d+\.?\d*)\s*[kK]?W\s+(?:continuous|rated)/gi, type: 'continuous', priority: 10 },
    { pattern: /AC\s+Output[:\s]+(\d+)W/gi, type: 'continuous', priority: 8 },
    { pattern: /Output[:\s]+(\d+)W/gi, type: 'continuous', priority: 5 },
    { pattern: /(?:surge|peak|max|starting)[:\s]+(\d+\.?\d*)\s*[kK]?W/gi, type: 'peak', priority: 10 },
    { pattern: /(\d+\.?\d*)\s*[kK]?W\s+(?:surge|peak|max|starting)/gi, type: 'peak', priority: 10 },
  ];

  for (const { pattern, type, priority } of powerPatterns) {
    const matches = text.matchAll(pattern);

    for (const match of matches) {
      let value = parseFloat(match[1]);
      if (match[0].toLowerCase().includes('kw')) value *= 1000;

      if (value >= 100 && value <= 10000) {
        foundPowers.push({
          value,
          type,
          matched: match[0],
          priority
        });
      }
    }
  }

  if (foundPowers.length === 0) {
    return { continuous: null, peak: null };
  }

  const continuousPowers = foundPowers.filter(p => p.type === 'continuous').sort((a, b) => b.priority - a.priority);
  const peakPowers = foundPowers.filter(p => p.type === 'peak').sort((a, b) => b.priority - a.priority);

  let continuous = continuousPowers.length > 0 ? continuousPowers[0] : null;
  let peak = peakPowers.length > 0 ? peakPowers[0] : null;

  // Validation: Peak should be >= continuous
  if (continuous && peak && peak.value < continuous.value) {
    const temp = continuous;
    continuous = peak;
    peak = temp;
  }

  return {
    continuous: continuous ? { value: continuous.value, matched: continuous.matched } : null,
    peak: peak ? { value: peak.value, matched: peak.matched } : null
  };
}

/**
 * Clean product name
 */
function cleanProductName(name) {
  if (!name) return null;
  const lines = name.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const uniqueLines = [...new Set(lines)];
  const cleaned = uniqueLines.length > 0 ? uniqueLines[0] : name;
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Match battery to existing class based on capacity
 */
async function matchBatteryClass(capacityKwh) {
  if (!capacityKwh) return null;

  // Round capacity to nearest 0.5 kWh
  const roundedCapacity = Math.round(capacityKwh * 2) / 2;

  // Fetch battery classes from database
  const { data: batteryClasses, error } = await supabase
    .from('battery_classes')
    .select('*');

  if (error || !batteryClasses) {
    console.log('   ⚠️  Could not fetch battery classes for matching');
    return null;
  }

  // Find closest matching class
  let bestMatch = null;
  let smallestDiff = Infinity;

  for (const batteryClass of batteryClasses) {
    const diff = Math.abs(batteryClass.capacity_kwh - roundedCapacity);
    if (diff < smallestDiff && diff < 0.5) {
      smallestDiff = diff;
      bestMatch = batteryClass;
    }
  }

  return bestMatch ? bestMatch.id : null;
}

/**
 * Calculate confidence score for candidate
 */
function calculateConfidence(name, capacity, power) {
  let score = 0;

  if (name) score += 25;
  if (capacity) score += 50;
  if (power.continuous || power.peak) score += 25;

  return score;
}

/**
 * Analyze product page and extract battery specs
 */
async function analyzeBatteryProduct(url, manufacturer) {
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': CONFIG.userAgent },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    // Extract name
    let name = $('h1').first().text().trim();
    if (!name) name = $('title').text().trim();
    if (!name) name = $('meta[property="og:title"]').attr('content');
    name = cleanProductName(name);

    // Get text for analysis
    const description = $('meta[name="description"]').attr('content') || '';
    const ogDescription = $('meta[property="og:description"]').attr('content') || '';
    const bodyText = $('body').text();

    // For include keywords: check entire page
    const includeText = (name + ' ' + description + ' ' + bodyText).toLowerCase();

    // For exclude keywords: ONLY check product title and description
    const excludeText = (name + ' ' + description + ' ' + ogDescription).toLowerCase();

    // Check include keywords
    const matchedIncludeKeywords = manufacturer.include_keywords.filter(kw =>
      includeText.includes(kw.toLowerCase())
    );

    if (matchedIncludeKeywords.length === 0) {
      return { skipped: true, reason: 'no_include_keywords' };
    }

    // Check exclude keywords
    const matchedExcludeKeywords = manufacturer.exclude_keywords.filter(kw =>
      excludeText.includes(kw.toLowerCase())
    );

    if (matchedExcludeKeywords.length > 0) {
      return { skipped: true, reason: 'exclude_keywords', keywords: matchedExcludeKeywords };
    }

    // Extract specs
    const capacityResult = extractCapacity(bodyText, name);
    const powerResult = extractPower(bodyText);

    // Check capacity range
    if (capacityResult && (capacityResult.value < manufacturer.min_capacity_kwh || capacityResult.value > manufacturer.max_capacity_kwh)) {
      return { skipped: true, reason: 'capacity_out_of_range', capacity: capacityResult.value };
    }

    // Build extracted specs
    const extractedSpecs = {};

    if (capacityResult) {
      extractedSpecs.capacity_kwh = capacityResult.value;
      extractedSpecs.capacity_source = capacityResult.source;
      extractedSpecs.capacity_matched = capacityResult.matched;
      extractedSpecs.capacity_priority = capacityResult.priority;
    }

    if (powerResult.continuous) {
      extractedSpecs.power_w = powerResult.continuous.value;
      extractedSpecs.power_source = 'body_text';
      extractedSpecs.power_matched = powerResult.continuous.matched;
    }

    if (powerResult.peak) {
      extractedSpecs.peak_power_w = powerResult.peak.value;
      extractedSpecs.peak_power_matched = powerResult.peak.matched;
    }

    // Calculate confidence
    const confidence = calculateConfidence(name, capacityResult, powerResult);

    // Match to battery class
    const batteryClassId = capacityResult ? await matchBatteryClass(capacityResult.value) : null;

    return {
      skipped: false,
      name,
      extractedSpecs,
      confidence,
      batteryClassId
    };

  } catch (error) {
    console.log(`   ❌ Error analyzing product: ${error.message}`);
    return { skipped: true, reason: 'error', error: error.message };
  }
}

/**
 * Check if URL already exists in candidates or batteries table
 */
async function urlAlreadyKnown(normalizedUrl) {
  // Check if already in candidates
  const { data: candidate, error: candidateError } = await supabase
    .from('battery_candidates')
    .select('id')
    .eq('normalized_url', normalizedUrl)
    .single();

  if (!candidateError && candidate !== null) {
    return { exists: true, source: 'candidate' };
  }

  // Check if already in batteries table
  const { data: battery, error: batteryError } = await supabase
    .from('batteries')
    .select('id')
    .eq('url', normalizedUrl)
    .single();

  if (!batteryError && battery !== null) {
    return { exists: true, source: 'battery' };
  }

  return { exists: false, source: null };
}

/**
 * Main discovery function
 */
async function discoverBatteries() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║           Battery Discovery - Production Version              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Fetch enabled manufacturers from database
  const { data: manufacturers, error: mfgError } = await supabase
    .from('manufacturers')
    .select('*')
    .eq('enabled', true)
    .order('last_searched_at', { ascending: true, nullsFirst: true })
    .limit(CONFIG.manufacturersPerRun);

  if (mfgError) {
    console.error('❌ Failed to fetch manufacturers:', mfgError.message);
    return;
  }

  if (!manufacturers || manufacturers.length === 0) {
    console.log('⚠️  No enabled manufacturers found');
    return;
  }

  console.log(`📋 Found ${manufacturers.length} enabled manufacturer(s) to process\n`);

  let totalCandidatesCreated = 0;

  for (const manufacturer of manufacturers) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`Processing: ${manufacturer.name}`);
    console.log(`${'═'.repeat(70)}`);

    const startTime = Date.now();

    // Extract product URLs
    const productUrls = await extractProductUrls(manufacturer);

    if (productUrls.length === 0) {
      console.log('⚠️  No product URLs found');

      // Update manufacturer
      await supabase
        .from('manufacturers')
        .update({
          last_searched_at: new Date().toISOString(),
          last_products_found: 0
        })
        .eq('id', manufacturer.id);

      continue;
    }

    let candidatesCreated = 0;
    let productsAnalyzed = 0;

    // Process products
    for (const url of productUrls) {
      // Check if we've hit the candidate limit
      if (totalCandidatesCreated >= CONFIG.maxCandidatesPerRun) {
        console.log(`\n⏸️  Reached maximum candidates per run (${CONFIG.maxCandidatesPerRun})`);
        break;
      }

      productsAnalyzed++;
      const normalizedUrl = normalizeUrl(url);

      // Check if URL is already known (in candidates or batteries table)
      const knownCheck = await urlAlreadyKnown(normalizedUrl);
      if (knownCheck.exists) {
        console.log(`   ⏭️  Already known (${knownCheck.source}): ${normalizedUrl}`);
        continue;
      }

      console.log(`\n[${productsAnalyzed}] Analyzing: ${url}`);

      // Analyze product
      const result = await analyzeBatteryProduct(url, manufacturer);

      if (result.skipped) {
        console.log(`   ⏭️  Skipped: ${result.reason}`);
      } else {
        // Create candidate (all candidates require manual review)
        const { error: insertError } = await supabase
          .from('battery_candidates')
          .insert({
            url,
            normalized_url: normalizedUrl,
            name: result.name,
            manufacturer_id: manufacturer.id,
            extracted_specs: result.extractedSpecs,
            battery_class_id: result.batteryClassId,
            confidence_score: result.confidence,
            status: 'pending',
            auto_approved: false
          });

        if (insertError) {
          console.log(`   ❌ Failed to create candidate: ${insertError.message}`);
        } else {
          candidatesCreated++;
          totalCandidatesCreated++;
          console.log(`   ✅ Created candidate: ${result.name}`);
          console.log(`      Confidence: ${result.confidence}%`);
        }
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, CONFIG.crawlDelayMs));
    }

    // Update manufacturer metadata
    const { error: updateError } = await supabase
      .from('manufacturers')
      .update({
        last_searched_at: new Date().toISOString(),
        last_products_found: candidatesCreated
      })
      .eq('id', manufacturer.id);

    if (updateError) {
      console.log(`\n⚠️  Failed to update manufacturer metadata: ${updateError.message}`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ ${manufacturer.name} complete: ${candidatesCreated} candidates created in ${duration}s`);
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log(`║  Discovery Complete: ${totalCandidatesCreated} total candidates created             ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

// Run discovery
discoverBatteries().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
