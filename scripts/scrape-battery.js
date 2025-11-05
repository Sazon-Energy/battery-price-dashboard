import axios from 'axios';
import * as cheerio from 'cheerio';
import { supabase } from '../lib/supabase.js';

async function scrapePrice(batteryId) {
  // Validate input
  if (!batteryId) {
    throw new Error('Battery ID is required');
  }

  // Fetch battery details from database
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
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });

    console.log(`✅ ${batteryName} page fetched successfully (${response.status})`);
    
    const $ = cheerio.load(response.data);
    
    const pageTitle = $('title').text();
    console.log(`📄 Page title: ${pageTitle}`);
    
    let price = null;
    let foundMethod = null;

    
    // Method 1: Check JSON-LD structured data (most reliable)
    console.log('🔍 Method 1: Checking JSON-LD structured data...');
    $('script[type="application/ld+json"]').each((i, elem) => {
      try {
        const json = JSON.parse($(elem).html());
        if (json['@type'] === 'Product' && json.offers) {
          const offers = Array.isArray(json.offers) ? json.offers[0] : json.offers;
          if (offers.price) {
            // Handle both string format "1,699.00" and numeric format 1699.00
            const priceValue = String(offers.price).replace(/,/g, '');
            price = parseFloat(priceValue);
            foundMethod = 'JSON-LD structured data';
            console.log(`✅ Found price in JSON-LD: $${price}`);
            return false; // break the loop
          }
        }
      } catch (e) {
        // Skip invalid JSON
      }
    });
    
    // Method 2: Check meta tags
    if (!price) {
      console.log('🔍 Method 2: Checking meta tags...');
      const metaPrice = $('meta[property="product:price:amount"], meta[property="og:price:amount"]').attr('content');
      if (metaPrice) {
        price = parseFloat(metaPrice);
        foundMethod = 'Meta tag';
        console.log(`✅ Found price in meta tag: $${price}`);
      }
    }
    
    // Method 3: Check data attributes
    if (!price) {
      console.log('🔍 Method 3: Checking data attributes...');
      const dataPrice = $('[data-product-price]').first().attr('data-product-price');
      if (dataPrice) {
        const priceMatch = dataPrice.match(/[\d.]+/);
        if (priceMatch) {
          price = parseFloat(priceMatch[0]);
          foundMethod = 'Data attribute';
          console.log(`✅ Found price in data attribute: $${price}`);
        }
      }
    }
    
    // Method 4: Try specific Shopify/common selectors
    if (!price) {
      console.log('🔍 Method 4: Checking common price selectors...');
      const priceSelectors = [
        '.price-item--regular .price',
        '.product-form__price .price',
        '.price__regular .price',
        'span.money',
        '.product-price .money',
        '[class*="price"][class*="regular"]',
        '.shopify-price'
      ];
      
      for (const selector of priceSelectors) {
        const priceElement = $(selector).first();
        if (priceElement.length > 0) {
          const priceText = priceElement.text().trim();
          console.log(`  Checking "${selector}": ${priceText}`);
          
          const priceMatch = priceText.match(/[\d,]+\.?\d*/);
          if (priceMatch) {
            const extractedPrice = parseFloat(priceMatch[0].replace(/,/g, ''));
            // Sanity check: price should be reasonable (between $100 and $10000)
            if (extractedPrice > 100 && extractedPrice < 10000) {
              price = extractedPrice;
              foundMethod = `CSS selector: ${selector}`;
              console.log(`✅ Found valid price: $${price}`);
              break;
            }
          }
        }
      }
    }
    
    if (price) {
      console.log(`💰 Extracted ${batteryName} price: $${price} (via ${foundMethod})`);
      return {
        success: true,
        price: price,
        method: foundMethod,
        url: url,
        scrapedAt: new Date().toISOString()
      };
    } else {
      console.log('❌ No price found with any method');
      
      // Enhanced debug output
      console.log('\n🔍 Debug - Checking for any price-like text:');
      let debugCount = 0;
      $('*').each((i, elem) => {
        const text = $(elem).text().trim();
        if (text.match(/\$[\d,]+\.?\d*/) && text.length < 150 && debugCount < 10) {
          console.log(`  ${debugCount + 1}. ${$(elem).prop('tagName')}.${$(elem).attr('class') || 'no-class'}: "${text.substring(0, 100)}"`);
          debugCount++;
        }
      });
      
      console.log('\n🔍 Checking for JSON-LD scripts:');
      $('script[type="application/ld+json"]').each((i, elem) => {
        console.log(`  Script ${i + 1}: ${$(elem).html().substring(0, 200)}...`);
      });
      
      return {
        success: false,
        error: 'Price not found with any method',
        url: url
      };
    }
    
  } catch (error) {
    console.error(`❌ ${batteryName} scraping failed:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

export default scrapePrice;