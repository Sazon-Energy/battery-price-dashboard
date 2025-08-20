// -- battery query test
import { supabaseAdmin } from './supabase-admin.js'

// Add this at the start of your script
const { data: allBatteries, error: queryError } = await supabaseAdmin
  .from('batteries')
  .select('id, name')
  .limit(5);

console.log('All batteries test:', allBatteries, queryError);