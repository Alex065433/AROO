import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
async function check() {
  const { data, error } = await supabase.from('profiles').select('id, operator_id, active_package, sponsor_id, parent_id, side, left_business, right_business').gt('active_package', 0);
  if (error) {
    console.log(error.message);
  } else {
    console.log('Active Users:', data?.length);
    console.log(JSON.stringify(data, null, 2));
  }
}
check();
