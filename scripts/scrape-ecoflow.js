const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeEcoFlowPrice() {
  try {
    console.log('🔍 Starting EcoFlow scraping...');
    
    const url = 'https://us.ecoflow.com/products/delta-3-portable-power-station?variant=42015827492937';
    
    console.log('📡 Fetching EcoFlow webpage...');
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });

    console.log(`✅ EcoFlow page fetched successfully (${response.status})`);
    
    const $ = cheerio.load(response.data);
    
    const pageTitle = $('title').text();
    console.log(`📄 Page title: ${pageTitle}`);
    
    // EcoFlow-specific price selectors
    const priceSelectors = [
      '.price',
      '.product-price',
      '.money',
      '.current-price',
      '.sale-price',
      '[data-price]',
      '.price-current',
      '.product__price',
      '.variant-price',
      '.product-form__price'
    ];
    
    let price = null;
    let foundSelector = null;
    
    for (const selector of priceSelectors) {
      const priceElement = $(selector).first();
      if (priceElement.length > 0) {
        const priceText = priceElement.text().trim();
        console.log(`🔍 Found price element with selector "${selector}": ${priceText}`);
        
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
      console.log(`💰 Extracted EcoFlow price: $${price}`);
      return {
        success: true,
        price: price,
        selector: foundSelector,
        url: url,
        scrapedAt: new Date().toISOString()
      };
    } else {
      console.log('❌ No price found with any selector');
      
      // Debug output
      console.log('\n🔍 Debug - All text containing "$":');
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
    console.error('❌ EcoFlow scraping failed:', error.message);
    return {
      success: false,
      error: error.message,
      url: 'https://us.ecoflow.com/products/delta-3-portable-power-station?variant=42015827492937'
    };
  }
}

if (require.main === module) {
  scrapeEcoFlowPrice().then(result => {
    console.log('\n📊 EcoFlow result:', result);
    process.exit(0);
  });
}

module.exports = scrapeEcoFlowPrice;
