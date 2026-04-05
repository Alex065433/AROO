import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const { data, error } = await supabase.from('profiles').select('email, operator_id, role, status').eq('status', 'active').limit(5);
  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Active Profiles:', data);
  }
}
run();
