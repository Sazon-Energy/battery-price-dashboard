import * as cheerio from 'cheerio';

/**
 * Extract a price from product page HTML using a series of fallback methods.
 *
 * Methods (tried in order, first match wins):
 *   1. JSON-LD structured data (most reliable)
 *   2. Meta tags (og:price:amount, product:price:amount)
 *   3. data-product-price attributes
 *   4. Common CSS price selectors (Shopify, Anker, generic e-commerce)
 *   5. Inline JavaScript (variant-specific data, product data blobs)
 *
 * Used by both scripts/scrape-battery.js (price refresh) and
 * scripts/discover-batteries.js (capture price at discovery time).
 *
 * @param {string} html - Raw HTML of the product page
 * @param {string} url - URL the HTML was fetched from (used for variant ID extraction)
 * @returns {{ price: number|null, method: string|null }}
 */
export function extractPriceFromHtml(html, url) {
  const $ = cheerio.load(html);
  let price = null;
  let foundMethod = null;

  // Method 1: JSON-LD structured data
  $('script[type="application/ld+json"]').each((i, elem) => {
    try {
      const json = JSON.parse($(elem).html());
      if (json['@type'] === 'Product' && json.offers) {
        const offers = Array.isArray(json.offers) ? json.offers[0] : json.offers;
        if (offers.price) {
          const priceValue = String(offers.price).replace(/,/g, '');
          price = parseFloat(priceValue);
          foundMethod = 'JSON-LD structured data';
          return false;
        }
      }
    } catch (e) {
      // Skip invalid JSON
    }
  });

  // Method 2: Meta tags
  if (!price) {
    const metaPrice = $('meta[property="product:price:amount"], meta[property="og:price:amount"]').attr('content');
    if (metaPrice) {
      price = parseFloat(metaPrice);
      foundMethod = 'Meta tag';
    }
  }

  // Method 3: data attributes
  if (!price) {
    const dataPrice = $('[data-product-price]').first().attr('data-product-price');
    if (dataPrice) {
      const priceMatch = dataPrice.match(/[\d.]+/);
      if (priceMatch) {
        price = parseFloat(priceMatch[0]);
        foundMethod = 'Data attribute';
      }
    }
  }

  // Method 4: Common price selectors (Shopify, Anker, generic)
  if (!price) {
    const priceSelectors = [
      'span[class*="codePrice"]',
      '[class*="ProductTag"][class*="price"]',
      '[class*="salePrice"]',
      '[class*="discountPrice"]',
      '.price-item--regular .price',
      '.product-form__price .price',
      '.price__regular .price',
      'span.money',
      '.product-price .money',
      '[class*="price"][class*="regular"]',
      '.shopify-price',
      '[class*="currentPrice"]',
      '[class*="finalPrice"]'
    ];

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
              const isSaleSelector = saleSelectorPatterns.some(pattern =>
                selector.toLowerCase().includes(pattern.toLowerCase())
              );
              foundPricesMethod4.push({
                price: extractedPrice,
                selector,
                isSale: isSaleSelector
              });
            }
          }
        });
      }
    }

    if (foundPricesMethod4.length > 0) {
      const salePrices = foundPricesMethod4.filter(p => p.isSale);
      const selected = salePrices.length > 0
        ? salePrices.reduce((min, p) => p.price < min.price ? p : min)
        : foundPricesMethod4.reduce((min, p) => p.price < min.price ? p : min);
      price = selected.price;
      foundMethod = `CSS selector: ${selected.selector}`;
    }
  }

  // Method 5: Inline JavaScript (variant-specific and product data)
  if (!price) {
    const variantMatch = url ? url.match(/[?&]variant=(\d+)/) : null;
    const variantId = variantMatch ? variantMatch[1] : null;
    const foundPrices = [];

    $('script:not([src])').each((i, elem) => {
      const scriptContent = $(elem).html();
      if (!scriptContent) return;

      // Variant-specific price scan
      if (variantId) {
        let variantIndex = scriptContent.indexOf(variantId);
        while (variantIndex !== -1) {
          const contextStart = Math.max(0, variantIndex - 500);
          const contextEnd = Math.min(scriptContent.length, variantIndex + 500);
          const context = scriptContent.substring(contextStart, contextEnd);

          const allPricePatterns = [
            /"(?:price|salePrice|discountPrice|amount|currentPrice|finalPrice|specialPrice|compareAtPrice)"[:\s]*(\d+\.?\d*)/gi,
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

          if (variantPrices.length > 0) {
            const uniquePrices = [...new Set(variantPrices)];
            for (const p of uniquePrices) {
              foundPrices.push({ price: p, type: 'variant-context' });
            }
          }

          variantIndex = scriptContent.indexOf(variantId, variantIndex + variantId.length);
        }
      }

      // Product data blob scan
      const blobPattern = /(?:window\.|var\s+|const\s+|let\s+)(?:__INITIAL_STATE__|__PRELOADED_STATE__|PRODUCT_DATA|productData)\s*=\s*({[\s\S]*?});/;
      const match = scriptContent.match(blobPattern);
      if (match) {
        try {
          const jsonData = JSON.parse(match[1]);
          findAllPricesInObject(jsonData, '', foundPrices);
        } catch (e) {
          // not valid JSON
        }
      }

      // Inline price patterns
      const inlinePricePatterns = [
        /"(?:salePrice|discountPrice|currentPrice|finalPrice)["']?\s*:\s*["']?\$?([\d,]+\.?\d*)/gi,
        /"(?:price|regularPrice|listPrice)["']?\s*:\s*["']?\$?([\d,]+\.?\d*)/gi,
      ];

      for (let i = 0; i < inlinePricePatterns.length; i++) {
        const pattern = inlinePricePatterns[i];
        const matches = [...scriptContent.matchAll(pattern)];
        const isSalePattern = i === 0;

        for (const m of matches) {
          if (m[1]) {
            const priceValue = parseFloat(m[1].replace(/,/g, ''));
            const potentialPrice = priceValue > 10000 ? priceValue / 100 : priceValue;
            if (potentialPrice > 100 && potentialPrice < 10000) {
              foundPrices.push({
                price: potentialPrice,
                type: isSalePattern ? 'sale' : 'regular'
              });
            }
          }
        }
      }
    });

    const variantContextPrices = foundPrices.filter(p => p.type === 'variant-context');
    const salePrices = foundPrices.filter(p => p.type === 'sale');
    const regularPrices = foundPrices.filter(p => p.type === 'regular');

    if (variantContextPrices.length > 0) {
      const lowest = variantContextPrices.reduce((min, p) => p.price < min.price ? p : min);
      price = lowest.price;
      foundMethod = 'Inline JavaScript (variant-specific)';
    } else if (salePrices.length > 0) {
      const lowest = salePrices.reduce((min, p) => p.price < min.price ? p : min);
      price = lowest.price;
      foundMethod = 'Inline JavaScript (sale price)';
    } else if (regularPrices.length > 0) {
      price = regularPrices[0].price;
      foundMethod = 'Inline JavaScript (regular price)';
    }
  }

  return { price, method: foundMethod };
}

function findAllPricesInObject(obj, path, foundPrices) {
  if (typeof obj !== 'object' || obj === null) return;

  const salePriceFields = ['salePrice', 'discountPrice', 'discountedPrice', 'specialPrice', 'currentPrice', 'finalPrice'];
  const regularPriceFields = ['price', 'regularPrice', 'listPrice', 'amount', 'priceAmount', 'value'];

  for (const field of salePriceFields) {
    if (obj[field]) {
      const val = parsePriceField(obj[field]);
      if (val && val > 100 && val < 10000) {
        foundPrices.push({ price: val, type: 'sale' });
      }
    }
  }

  for (const field of regularPriceFields) {
    if (obj[field]) {
      const val = parsePriceField(obj[field]);
      if (val && val > 100 && val < 10000) {
        foundPrices.push({ price: val, type: 'regular' });
      }
    }
  }

  for (const key in obj) {
    if (typeof obj[key] === 'object') {
      findAllPricesInObject(obj[key], path ? `${path}.${key}` : key, foundPrices);
    }
  }
}

function parsePriceField(field) {
  if (typeof field === 'number') {
    return field > 10000 ? field / 100 : field;
  }
  if (typeof field === 'string') {
    const parsed = parseFloat(field.replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed)) {
      return parsed > 10000 ? parsed / 100 : parsed;
    }
  }
  return null;
}
