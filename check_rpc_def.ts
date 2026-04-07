import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.rpc('claim_wallet', { p_user_id: 'cf21264f-bd65-4228-a89c-33813b94763b', p_wallet_key: 'referral' });
  console.log('RPC result:', data, error);
}
check();
