import axios from 'axios';

async function scrapeAnkerPrice() {
  try {
    console.log('🔍 Starting Anker API scraping...');
    
    const apiUrl = 'https://www.ankersolix.com/api/multipass/shopifyservices/coupons/by_products?handles%5B%5D=f2000%2Cf2000-expansion-battery%2Cf2000-home-backup-kit%2Cf2000-expansion-battery-home-backup-kit&shopify_domain=ankersolix-us.myshopify.com';
    
    console.log('📡 Fetching Anker pricing API...');
    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.ankersolix.com/products/f2000?variant=49702419202378'
      },
      timeout: 10000
    });

    console.log(`✅ API response received (${response.status})`);
    
    const data = response.data;
    
    // Navigate to data.f2000 array
    if (!data.data || !data.data.f2000) {
      console.log('❌ No f2000 data found in API response');
      return {
        success: false,
        error: 'No f2000 data in API response',
        url: apiUrl
      };
    }
    
    const f2000Products = data.data.f2000;
    console.log(`🔍 Found ${f2000Products.length} F2000 variants`);
    
    // Find the variant with variant_shopify_id = 49702419202378 (number) and sku = A1780112
    const targetVariant = f2000Products.find(product => 
      product.variant_shopify_id === 49702419202378 && 
      product.sku === 'A1780112'
    );
    
    if (!targetVariant) {
      console.log('❌ Target variant not found (variant_shopify_id: 49702419202378, sku: A1780112)');
      console.log('Available variants:');
      f2000Products.forEach((product, i) => {
        console.log(`  ${i+1}: sku=${product.sku}, variant_shopify_id=${product.variant_shopify_id}`);
      });
      return {
        success: false,
        error: 'Target variant not found',
        url: apiUrl
      };
    }
    
    console.log(`✅ Found target variant: sku=${targetVariant.sku}, variant_shopify_id=${targetVariant.variant_shopify_id}`);
    
    // Get the price (prefer sale price, fall back to regular price)
    let price = null;
    let priceSource = '';
    
    if (targetVariant.variant_price4wscode) {
      price = parseFloat(targetVariant.variant_price4wscode);
      priceSource = 'sale price (variant_price4wscode)';
    } else if (targetVariant.variant_price) {
      price = parseFloat(targetVariant.variant_price);
      priceSource = 'regular price (variant_price)';
    }
    
    if (!price || isNaN(price)) {
      console.log('❌ No valid price found in variant');
      console.log('Available price fields:', Object.keys(targetVariant).filter(key => key.includes('price')));
      return {
        success: false,
        error: 'No valid price found in variant',
        url: apiUrl
      };
    }
    
    console.log(`💰 Extracted Anker price: $${price} (${priceSource})`);
    
    return {
      success: true,
      price: price,
      selector: `API: ${priceSource}`,
      url: apiUrl,
      scrapedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Anker API scraping failed:', error.message);
    return {
      success: false,
      error: error.message,
      url: 'https://www.ankersolix.com/api/multipass/shopifyservices/coupons/by_products'
    };
  }
}

// Check if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeAnkerPrice().then(result => {
    console.log('\n📊 Anker result:', result);
    process.exit(0);
  });
}

export default scrapeAnkerPrice;