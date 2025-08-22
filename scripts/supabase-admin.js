import dotenv from 'dotenv'


if (!process.env.GITHUB_ACTIONS) {
  dotenv.config({ path: '.env.local' })
}
//dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('Debug - URL:', !!supabaseUrl)
console.log('Debug - Service Key found:', !!supabaseServiceKey)
console.log('Debug - Running in GitHub Actions:', !!process.env.GITHUB_ACTIONS)

if (!supabaseServiceKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)