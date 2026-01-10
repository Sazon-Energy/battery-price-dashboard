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
    const method1Start = Date.now();
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
    console.log(`⏱️  Method 1 took ${Date.now() - method1Start}ms`);

    // Method 2: Check meta tags
    if (!price) {
      console.log('🔍 Method 2: Checking meta tags...');
      const method2Start = Date.now();
      const metaPrice = $('meta[property="product:price:amount"], meta[property="og:price:amount"]').attr('content');
      if (metaPrice) {
        price = parseFloat(metaPrice);
        foundMethod = 'Meta tag';
        console.log(`✅ Found price in meta tag: $${price}`);
      }
      console.log(`⏱️  Method 2 took ${Date.now() - method2Start}ms`);
    }

    // Method 3: Check data attributes
    if (!price) {
      console.log('🔍 Method 3: Checking data attributes...');
      const method3Start = Date.now();
      const dataPrice = $('[data-product-price]').first().attr('data-product-price');
      if (dataPrice) {
        const priceMatch = dataPrice.match(/[\d.]+/);
        if (priceMatch) {
          price = parseFloat(priceMatch[0]);
          foundMethod = 'Data attribute';
          console.log(`✅ Found price in data attribute: $${price}`);
        }
      }
      console.log(`⏱️  Method 3 took ${Date.now() - method3Start}ms`);
    }

    // Method 4: Try specific Shopify/common selectors
    if (!price) {
      console.log('🔍 Method 4: Checking common price selectors...');
      const method4Start = Date.now();
      const priceSelectors = [
        // Anker-specific selectors (check sale price first)
        'span[class*="codePrice"]',
        '[class*="ProductTag"][class*="price"]',
        '[class*="salePrice"]',
        '[class*="discountPrice"]',
        // Generic e-commerce selectors
        '.price-item--regular .price',
        '.product-form__price .price',
        '.price__regular .price',
        'span.money',
        '.product-price .money',
        '[class*="price"][class*="regular"]',
        '.shopify-price',
        // Additional sale/current price patterns
        '[class*="currentPrice"]',
        '[class*="finalPrice"]'
      ];

      // Collect all potential prices from sale/discount selectors first
      const saleSelectorPatterns = ['codePrice', 'salePrice', 'discountPrice', 'currentPrice', 'finalPrice'];
      const foundPricesMethod4 = [];

      for (const selector of priceSelectors) {
        const priceElements = $(selector);
        if (priceElements.length > 0) {
          priceElements.each((i, elem) => {
            const priceText = $(elem).text().trim();
            const priceMatch = priceText.match(/[\d,]+\.?\d*/);
            if (priceMatch) {
              const extractedPrice = parseFloat(priceMatch[0].replace(/,/g, ''));
              if (extractedPrice > 100 && extractedPrice < 10000) {
                // Determine if this is a sale price selector
                const isSaleSelector = saleSelectorPatterns.some(pattern =>
                  selector.toLowerCase().includes(pattern.toLowerCase())
                );
                foundPricesMethod4.push({
                  price: extractedPrice,
                  selector: selector,
                  text: priceText,
                  isSale: isSaleSelector
                });
                console.log(`  Found price $${extractedPrice} via "${selector}": ${priceText} ${isSaleSelector ? '(sale selector)' : ''}`);
              }
            }
          });
        }
      }

      // Prioritize: 1) sale selectors with lowest price, 2) any lowest price
      if (foundPricesMethod4.length > 0) {
        const salePrices = foundPricesMethod4.filter(p => p.isSale);
        let selectedPrice;

        if (salePrices.length > 0) {
          // If we have sale prices, pick the lowest
          selectedPrice = salePrices.reduce((min, p) => p.price < min.price ? p : min);
          console.log(`  Prioritizing sale price: $${selectedPrice.price}`);
        } else {
          // Otherwise pick the lowest price found
          selectedPrice = foundPricesMethod4.reduce((min, p) => p.price < min.price ? p : min);
          console.log(`  Using lowest price found: $${selectedPrice.price}`);
        }

        price = selectedPrice.price;
        foundMethod = `CSS selector: ${selectedPrice.selector}`;
        console.log(`✅ Found valid price: $${price}`);
      }
      console.log(`⏱️  Method 4 took ${Date.now() - method4Start}ms`);
    }

    // Method 5: Check inline JavaScript for price data (for SPAs and modern sites)
    if (!price) {
      console.log('🔍 Method 5: Checking inline JavaScript for price data...');
      const method5Start = Date.now();

      // Extract variant ID from URL if present
      const variantMatch = url.match(/[?&]variant=(\d+)/);
      const variantId = variantMatch ? variantMatch[1] : null;
      if (variantId) {
        console.log(`  Looking for variant-specific price data (variant: ${variantId})`);
      }

      // Collect all potential prices with their types
      const foundPrices = [];

      $('script:not([src])').each((i, elem) => {
        const scriptContent = $(elem).html();

        // If we have a variant ID, look for variant-specific data first
        if (variantId && !price) {
          // Look for ALL occurrences of the variant ID in the script
          let variantIndex = scriptContent.indexOf(variantId);
          let searchOffset = 0;

          while (variantIndex !== -1) {
            // Extract larger context around the variant ID to find all related prices
            const contextStart = Math.max(0, variantIndex - 500);
            const contextEnd = Math.min(scriptContent.length, variantIndex + 500);
            const context = scriptContent.substring(contextStart, contextEnd);

            // Look for all price-like patterns near this variant, including numeric values
            const allPricePatterns = [
              // Named price fields
              /"(?:price|salePrice|discountPrice|amount|currentPrice|finalPrice|specialPrice|compareAtPrice)"[:\s]*(\d+\.?\d*)/gi,
              // Numeric values that could be prices (899, 1999, etc.)
              /[:,]\s*(\d{3,4}(?:\.\d{2})?)\s*[,}]/g,
            ];

            const variantPrices = [];
            for (const pattern of allPricePatterns) {
              const matches = [...context.matchAll(pattern)];
              for (const match of matches) {
                const priceValue = parseFloat(match[1]);
                const potentialPrice = priceValue > 10000 ? priceValue / 100 : priceValue;
                if (potentialPrice > 100 && potentialPrice < 10000) {
                  variantPrices.push(potentialPrice);
                }
              }
            }

            // Log all prices found near this variant occurrence
            if (variantPrices.length > 0) {
              console.log(`  Found ${variantPrices.length} prices near variant ID occurrence: ${variantPrices.map(p => '$' + p).join(', ')}`);

              // Add all unique prices from this context
              const uniquePrices = [...new Set(variantPrices)];
              for (const p of uniquePrices) {
                foundPrices.push({
                  price: p,
                  type: 'variant-context',
                  field: 'variant-context',
                  path: 'near variant ID',
                  priority: 10
                });
              }
            }

            // Look for next occurrence
            searchOffset = variantIndex + variantId.length;
            variantIndex = scriptContent.indexOf(variantId, searchOffset);
          }
        }

        // Look for common JavaScript patterns that contain price data
        const patterns = [
          // Pattern 1: window.__INITIAL_STATE__ or similar
          /(?:window\.|var\s+|const\s+|let\s+)(?:__INITIAL_STATE__|__PRELOADED_STATE__|PRODUCT_DATA|productData)\s*=\s*({[\s\S]*?});/,
        ];

        for (const pattern of patterns) {
          const match = scriptContent.match(pattern);
          if (match) {
            // Try to parse JSON and look for price
            try {
              const jsonMatch = match[1];
              const jsonData = JSON.parse(jsonMatch);

              // Recursive function to find all prices in nested objects
              const findAllPricesInObject = (obj, path = '') => {
                if (typeof obj !== 'object' || obj === null) return;

                // Priority fields for sale/discount prices
                const salePriceFields = ['salePrice', 'discountPrice', 'discountedPrice', 'specialPrice', 'currentPrice', 'finalPrice'];
                const regularPriceFields = ['price', 'regularPrice', 'listPrice', 'amount', 'priceAmount', 'value'];

                // Check sale price fields first (higher priority)
                for (const field of salePriceFields) {
                  if (obj[field]) {
                    let val = null;
                    if (typeof obj[field] === 'number') {
                      val = obj[field] > 10000 ? obj[field] / 100 : obj[field];
                    } else if (typeof obj[field] === 'string') {
                      const parsed = parseFloat(obj[field].replace(/[^0-9.]/g, ''));
                      if (!isNaN(parsed)) {
                        val = parsed > 10000 ? parsed / 100 : parsed;
                      }
                    }
                    if (val && val > 100 && val < 10000) {
                      foundPrices.push({ price: val, type: 'sale', field: field, path: path + '.' + field });
                      console.log(`  Found sale price: $${val} (${path}.${field})`);
                    }
                  }
                }

                // Check regular price fields (lower priority)
                for (const field of regularPriceFields) {
                  if (obj[field]) {
                    let val = null;
                    if (typeof obj[field] === 'number') {
                      val = obj[field] > 10000 ? obj[field] / 100 : obj[field];
                    } else if (typeof obj[field] === 'string') {
                      const parsed = parseFloat(obj[field].replace(/[^0-9.]/g, ''));
                      if (!isNaN(parsed)) {
                        val = parsed > 10000 ? parsed / 100 : parsed;
                      }
                    }
                    if (val && val > 100 && val < 10000) {
                      foundPrices.push({ price: val, type: 'regular', field: field, path: path + '.' + field });
                      console.log(`  Found regular price: $${val} (${path}.${field})`);
                    }
                  }
                }

                // Recursively search nested objects
                for (const key in obj) {
                  if (typeof obj[key] === 'object') {
                    findAllPricesInObject(obj[key], path ? `${path}.${key}` : key);
                  }
                }
              };

              findAllPricesInObject(jsonData);
            } catch (e) {
              // Not valid JSON or couldn't parse, continue
            }
          }
        }

        // Also check for inline price patterns
        const inlinePricePatterns = [
          // Look for sale/discount prices first
          /"(?:salePrice|discountPrice|currentPrice|finalPrice)["']?\s*:\s*["']?\$?([\d,]+\.?\d*)/gi,
          // Then regular prices
          /"(?:price|regularPrice|listPrice)["']?\s*:\s*["']?\$?([\d,]+\.?\d*)/gi,
        ];

        for (let i = 0; i < inlinePricePatterns.length; i++) {
          const pattern = inlinePricePatterns[i];
          const matches = [...scriptContent.matchAll(pattern)];
          const isSalePattern = i === 0;

          for (const match of matches) {
            if (match[1]) {
              const priceValue = parseFloat(match[1].replace(/,/g, ''));
              const potentialPrice = priceValue > 10000 ? priceValue / 100 : priceValue;
              if (potentialPrice > 100 && potentialPrice < 10000) {
                foundPrices.push({
                  price: potentialPrice,
                  type: isSalePattern ? 'sale' : 'regular',
                  field: match[0].split('"')[1] || 'unknown',
                  path: 'inline'
                });
                console.log(`  Found ${isSalePattern ? 'sale' : 'regular'} price: $${potentialPrice} (inline pattern)`);
              }
            }
          }
        }
      });

      // Prioritize: 1) lowest variant-context price, 2) sale prices, 3) lowest price from regular
      const variantContextPrices = foundPrices.filter(p => p.type === 'variant-context');
      const salePrices = foundPrices.filter(p => p.type === 'sale' && p.type !== 'variant-context');
      const regularPrices = foundPrices.filter(p => p.type === 'regular');

      if (variantContextPrices.length > 0) {
        // Pick the LOWEST price from variant context (sale price is typically lower)
        const lowestVariantPrice = variantContextPrices.reduce((min, p) => p.price < min.price ? p : min);
        price = lowestVariantPrice.price;
        foundMethod = `Inline JavaScript (variant-specific price)`;
        console.log(`✅ Found variant-specific price in JavaScript: $${price} (lowest of ${variantContextPrices.length} variant prices)`);
      } else if (salePrices.length > 0) {
        // Pick the lowest sale price
        const lowestSalePrice = salePrices.reduce((min, p) => p.price < min.price ? p : min);
        price = lowestSalePrice.price;
        foundMethod = `Inline JavaScript (${lowestSalePrice.field} - sale price)`;
        console.log(`✅ Found sale price in JavaScript: $${price} via ${lowestSalePrice.path}`);
      } else if (regularPrices.length > 0) {
        // Pick the first regular price found (typically the main product)
        price = regularPrices[0].price;
        foundMethod = `Inline JavaScript (${regularPrices[0].field})`;
        console.log(`✅ Found regular price in JavaScript: $${price} via ${regularPrices[0].path}`);
      }

      console.log(`⏱️  Method 5 took ${Date.now() - method5Start}ms`);
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