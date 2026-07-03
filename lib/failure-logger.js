/**
 * Normalize URL by removing query parameters and fragments.
 * Shared between discovery and price-refresh so both write consistent
 * normalized_url values into price_extraction_failures.
 */
export function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname;
  } catch (e) {
    return url;
  }
}

/**
 * Log a price extraction failure to price_extraction_failures.
 * Used by both scripts/discover-batteries.js (page found but no price at
 * discovery time) and scripts/update-all-prices.js (price refresh failed
 * for an already-tracked battery), so failures from either path are
 * visible in one place.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdminClient - must be a service-role client; the table's RLS has no policies.
 */
export async function logPriceExtractionFailure(supabaseAdminClient, {
  url,
  normalizedUrl,
  manufacturerId = null,
  productName = null,
  extractedSpecs = {},
  reason
}) {
  const { error } = await supabaseAdminClient
    .from('price_extraction_failures')
    .insert({
      url,
      normalized_url: normalizedUrl,
      manufacturer_id: manufacturerId,
      product_name: productName,
      extracted_specs: extractedSpecs,
      failure_reason: reason
    });

  if (error) {
    console.log(`   ⚠️  Failed to log price failure: ${error.message}`);
  }
}
