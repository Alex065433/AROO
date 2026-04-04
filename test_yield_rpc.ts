import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
async function check() {
  console.log('Calling process_daily_yield...');
  const { data, error } = await supabase.rpc('process_daily_yield');
  if (error) {
    console.log('Error:', error.message);
  } else {
    console.log('Success:', data);
  }
}
check();
