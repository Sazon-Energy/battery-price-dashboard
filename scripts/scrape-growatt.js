const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeGrowattPrice() {
  try {
    console.log('🔍 Starting Growatt scraping...');
    
    const url = 'https://growattportable.com/products/growatt-infinity-2000-pro-portable-power-station';
    
    // Fetch the webpage
    console.log('📡 Fetching webpage...');
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });

    console.log(`✅ Page fetched successfully (${response.status})`);
    
    // Parse HTML with cheerio
    const $ = cheerio.load(response.data);
    
    // Debug: Log page title to confirm we got the right page
    const pageTitle = $('title').text();
    console.log(`📄 Page title: ${pageTitle}`);
    
    // Try Growatt-specific selectors first, then fallbacks
    const priceSelectors = [
      '#ProductPrice-8011417092283',  // Specific ID you found
      '.product-detail-price',        // Class you found
      '.price',                       // Generic fallbacks
      '.product-price',
      '.money',
      '.product__price',
      '[data-price]',
      '.price-current',
      '.current-price',
      '.sale-price',
      '.product-form__price'
    ];
    
    let price = null;
    let foundSelector = null;
    
    // Try each selector
    for (const selector of priceSelectors) {
      const priceElement = $(selector).first();
      if (priceElement.length > 0) {
        const priceText = priceElement.text().trim();
        console.log(`🔍 Found price element with selector "${selector}": ${priceText}`);
        
        // Extract number from price text (handles $1,299.00, 1299, etc.)
        const priceMatch = priceText.match(/[\d,]+\.?\d*/);
        if (priceMatch) {
          price = parseFloat(priceMatch[0].replace(/,/g, ''));
          foundSelector = selector;
          break;
        }
      } else {
        console.log(`❌ Selector "${selector}" found no elements`);
      }
    }
    
    if (price) {
      console.log(`💰 Extracted price: $${price}`);
      console.log(`✅ Used selector: ${foundSelector}`);
      return {
        success: true,
        price: price,
        selector: foundSelector,
        url: url,
        scrapedAt: new Date().toISOString()
      };
    } else {
      console.log('❌ No price found with any selector');
      
      // Debug: Show all elements that might contain price
      console.log('\n🔍 Debug - All text containing "$" or numbers:');
      $('*').each((i, elem) => {
        const text = $(elem).text().trim();
        if (text.match(/\$[\d,]+\.?\d*/) && text.length < 100) {
          console.log(`  - ${$(elem).prop('tagName')}.${$(elem).attr('class') || 'no-class'}: ${text}`);
        }
      });
      
      return {
        success: false,
        error: 'Price not found with any selector',
        url: url
      };
    }
    
  } catch (error) {
    console.error('❌ Scraping failed:', error.message);
    return {
      success: false,
      error: error.message,
      url: 'https://growattportable.com/products/growatt-infinity-2000-pro-portable-power-station'
    };
  }
}

// Run the scraper if called directly
if (require.main === module) {
  scrapeGrowattPrice().then(result => {
    console.log('\n📊 Final result:', result);
    process.exit(0);
  });
}

module.exports = scrapeGrowattPrice;