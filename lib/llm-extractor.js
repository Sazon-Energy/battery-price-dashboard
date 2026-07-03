import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5';
const MAX_PAGE_TEXT_CHARS = 8000;

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    is_battery: {
      type: 'boolean',
      description: 'Whether this product page is for a home battery, portable power station, or similar battery product (not an accessory, unrelated product, or bundle of unrelated items).'
    },
    name: {
      type: 'string',
      description: 'Clean product name, with promotional suffixes (e.g. "Flash Sale", "Livestream Deal") and unrelated bundle add-ons removed.'
    },
    price: {
      type: ['number', 'null'],
      description: 'Current price of the product in USD, or null if it cannot be determined.'
    },
    capacity_kwh: {
      type: ['number', 'null'],
      description: 'Battery capacity in kWh, or null if not stated on the page.'
    },
    power_w: {
      type: ['number', 'null'],
      description: 'Continuous output power in watts, or null if not stated on the page.'
    }
  },
  required: ['is_battery', 'name', 'price', 'capacity_kwh', 'power_w'],
  additionalProperties: false
};

let client = null;

function getClient() {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  client = new Anthropic({ apiKey });
  return client;
}

/**
 * Fallback extraction/classification via Claude Haiku 4.5, used only when the
 * deterministic regex/CSS-selector extraction (lib/price-extractor.js, the
 * regex capacity/power extraction in scripts/discover-batteries.js) fails or
 * is incomplete. Returns null - never throws - if ANTHROPIC_API_KEY isn't
 * configured or the call fails, so callers fall back to existing
 * failure-logging behavior instead of crashing the run.
 *
 * @param {{ pageText: string, url: string }} input
 * @returns {Promise<{ is_battery: boolean, name: string, price: number|null, capacity_kwh: number|null, power_w: number|null }|null>}
 */
export async function extractBatteryInfoWithLLM({ pageText, url }) {
  const anthropic = getClient();
  if (!anthropic) {
    console.log('   ⚠️  ANTHROPIC_API_KEY not set - skipping LLM fallback');
    return null;
  }

  try {
    const response = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: `Extract structured data about the product on this page. URL: ${url}\n\nPage text:\n${pageText.slice(0, MAX_PAGE_TEXT_CHARS)}`
        }
      ]
    });

    const result = response.parsed_output;
    if (!result) return null;

    return result;
  } catch (error) {
    console.log(`   ⚠️  LLM fallback failed: ${error.message}`);
    return null;
  }
}
