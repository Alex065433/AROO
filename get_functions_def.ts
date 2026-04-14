
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.rpc('admin_execute_sql_rpc', { 
    p_sql: `
      SELECT routine_name, routine_definition 
      FROM information_schema.routines 
      WHERE routine_name IN ('handle_pair_income', 'trigger_matching', 'profiles_binary_update', 'place_user_binary', 'trigger_referral');
    ` 
  });
  console.log('Function definitions:', data, error);
}
check();
