import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: rootProfile } = await supabase.from('profiles').select('id').limit(1).single();
  if (rootProfile) {
    const { data, error } = await supabase.rpc('get_binary_downline', { root_id: rootProfile.id });
    if (error) {
      console.log('Error:', error.message);
    } else if (data && data.length > 0) {
      console.log('Columns in RPC result:', Object.keys(data[0]));
      console.log('Sample data:', data[0]);
    } else {
      console.log('No data returned from RPC');
    }
  }
}
check();
