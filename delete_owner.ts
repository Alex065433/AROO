import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const randomId = `ARW-REMOVED-${Math.floor(1000 + Math.random() * 9000)}`;
  const { data, error } = await supabase.from('profiles').update({ 
    email: `removed-${Math.floor(1000 + Math.random() * 9000)}@arowin.internal`,
    operator_id: randomId,
    full_name: 'REMOVED USER',
    status: 'blocked'
  }).eq('email', 'kethankumar130@gmail.com');
  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log(`Updated profile(s) with email kethankumar130@gmail.com to ${randomId}`);
  }
}
run();
