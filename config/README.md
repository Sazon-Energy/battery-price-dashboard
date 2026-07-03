# Discovery Configuration

This directory contains configuration files for the automated battery discovery system.

## Files

- **`discovery-config.json`** - Main configuration file (edit this)
- **`discovery-config.schema.json`** - JSON Schema for validation (reference only)

## Configuration Options

### Discovery Control

**`enabled`** (boolean, default: `true`)
- Master switch for discovery system
- Set to `false` to disable all discovery runs
- Useful for maintenance or when troubleshooting

**`maxCandidatesPerRun`** (integer, default: `5`)
- Maximum new candidates to create per discovery run
- Prevents overwhelming the review queue
- Recommended: 5-10 for weekly runs

**`manufacturersPerRun`** (integer, default: `1`)
- Number of manufacturers to check per run
- `1` = rotate through manufacturers (recommended)
- `2+` = check multiple manufacturers per run

**`maxPagesPerManufacturer`** (integer, default: `10`)
- Maximum product listing pages to crawl per manufacturer
- Prevents excessive crawling on large catalogs
- Most manufacturers have <10 pages of relevant products

### Price Filtering

**`minPrice`** (number or null, default: `null`)
- Minimum price in USD
- `null` = no minimum
- Example: `500` to skip batteries under $500
- Note: Price extraction may not be available for all products

**`maxPrice`** (number or null, default: `null`)
- Maximum price in USD
- `null` = no maximum
- Example: `5000` to skip batteries over $5000

### Content Filtering

**`requiredKeywords`** (array of strings, default: `[]`)
- Global keywords required on ALL products (case-insensitive)
- Checked against entire page content
- Usually empty - let each manufacturer define their own include keywords
- Example: `["lithium", "rechargeable"]`

**`excludeKeywords`** (array of strings, default: `[]`)
- Global exclude keywords applied to ALL manufacturers (case-insensitive)
- Checked against product title and description only (not entire page)
- Usually empty - let each manufacturer define their own exclude keywords
- Example: `["refurbished", "open box"]`

### Crawling Behavior

**`crawlDelayMs`** (integer, default: `2000`)
- Delay between HTTP requests in milliseconds
- Minimum: `1000` (1 second) for polite crawling
- Recommended: `2000` (2 seconds)
- Increase if you receive rate limiting errors

**`userAgent`** (string)
- User-Agent string sent with HTTP requests
- Should identify your crawler and provide contact info
- Default includes GitHub repository link
- Format: `Mozilla/5.0 (compatible; YourBotName/Version; +URL)`

## How Configuration is Used

1. **Startup**: Discovery script reads `discovery-config.json`
2. **Validation**: Settings are validated against JSON schema
3. **Execution**: Script applies settings to discovery run
4. **Database**: Settings are NOT stored in database - they're deployed with code

## Editing Configuration

1. Edit `config/discovery-config.json` in your code editor
2. Validate JSON syntax (most editors do this automatically)
3. Commit changes to version control
4. Deploy updated configuration with your application

## Environment-Specific Configuration

For different environments (development, staging, production), you can:

**Option 1: Environment Variables (Recommended)**
```javascript
// In your discovery script
const config = {
  ...require('./config/discovery-config.json'),
  enabled: process.env.DISCOVERY_ENABLED === 'true',
  crawlDelayMs: parseInt(process.env.CRAWL_DELAY_MS || '2000')
};
```

**Option 2: Multiple Config Files**
```
config/
├── discovery-config.json           # Base config
├── discovery-config.dev.json       # Development overrides
├── discovery-config.prod.json      # Production overrides
```

Then load based on `NODE_ENV`:
```javascript
const baseConfig = require('./config/discovery-config.json');
const envConfig = require(`./config/discovery-config.${process.env.NODE_ENV}.json`);
const config = { ...baseConfig, ...envConfig };
```

## Examples

### Conservative Settings (Recommended Start)
```json
{
  "enabled": true,
  "maxCandidatesPerRun": 5,
  "manufacturersPerRun": 1,
  "maxPagesPerManufacturer": 5,
  "crawlDelayMs": 2000
}
```

### Aggressive Discovery (High Volume)
```json
{
  "enabled": true,
  "maxCandidatesPerRun": 20,
  "manufacturersPerRun": 3,
  "maxPagesPerManufacturer": 20,
  "crawlDelayMs": 1000
}
```

### Development/Testing
```json
{
  "enabled": true,
  "maxCandidatesPerRun": 2,
  "manufacturersPerRun": 1,
  "maxPagesPerManufacturer": 2,
  "crawlDelayMs": 500
}
```

### Disabled (Maintenance)
```json
{
  "enabled": false,
  "maxCandidatesPerRun": 5,
  "manufacturersPerRun": 1,
  "maxPagesPerManufacturer": 10,
  "crawlDelayMs": 2000
}
```

## Monitoring

After changing configuration:
- Monitor GitHub Actions logs for discovery runs
- Check `battery_candidates` table for new discoveries
- Adjust thresholds based on false positive/negative rates
- Update `manufacturers.last_searched_at` timestamps

## Best Practices

1. **Start Conservative**: Begin with default settings and adjust based on results
2. **Version Control**: Always commit configuration changes with descriptive messages
3. **Document Changes**: Update this README when adding new configuration options
4. **Test Changes**: Test configuration changes in development before production
5. **Monitor Impact**: Watch resource usage after configuration changes
6. **Gradual Changes**: Adjust one setting at a time to understand impact

## Troubleshooting

**No candidates discovered:**
- Check `enabled: true`
- Verify manufacturer configurations in database
- Check GitHub Actions logs for errors
- Try increasing `maxPagesPerManufacturer`

**Too many candidates:**
- Decrease `maxCandidatesPerRun`
- Add global `excludeKeywords`
- Review manufacturer-specific exclude keywords in database

**Rate limiting errors:**
- Increase `crawlDelayMs` to 3000-5000ms
- Decrease `maxPagesPerManufacturer`
- Decrease `manufacturersPerRun`

**Low quality candidates:**
- Add more specific `excludeKeywords` per manufacturer
- Review and refine manufacturer `includeKeywords` in database
