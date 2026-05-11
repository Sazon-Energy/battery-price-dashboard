import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function getSchema() {
  const tables = ['batteries', 'battery_classes', 'battery_candidates', 'manufacturers', 'price_history']

  console.log('# Database Schema\n')
  console.log('Generated:', new Date().toISOString().split('T')[0], '\n')

  for (const tableName of tables) {
    // Query information schema
    const { data, error } = await supabase.rpc('exec_sql', {
      query: `
        SELECT
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = '${tableName}'
        ORDER BY ordinal_position;
      `
    })

    if (error) {
      // Try direct query instead
      const { data: tableData, error: tableError } = await supabase
        .from(tableName)
        .select('*')
        .limit(1)

      if (!tableError && tableData) {
        console.log(`## ${tableName}`)
        console.log('\nColumns (inferred from data):')
        if (tableData.length > 0) {
          Object.keys(tableData[0]).forEach(key => {
            console.log(`- ${key}`)
          })
        }
        console.log('\n')
      } else {
        console.log(`## ${tableName}`)
        console.log('Could not retrieve schema\n')
      }
    } else {
      console.log(`## ${tableName}`)
      console.log('\n| Column | Type | Nullable | Default |')
      console.log('|--------|------|----------|---------|')
      data.forEach(col => {
        const type = col.character_maximum_length
          ? `${col.data_type}(${col.character_maximum_length})`
          : col.data_type
        console.log(`| ${col.column_name} | ${type} | ${col.is_nullable} | ${col.column_default || '-'} |`)
      })
      console.log('\n')
    }
  }
}

getSchema().catch(console.error)
