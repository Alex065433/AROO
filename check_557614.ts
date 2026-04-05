import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', '2215a334-bf72-48eb-a601-9cda069a1bb8').single();
  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Profile 557614:', data);
  }
}
run();
