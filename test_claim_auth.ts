import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'kethankumar130@gmail.com',
    password: 'password123' // Assuming default password or we can't test it
  });
  
  if (authError) {
    console.log('Auth error:', authError.message);
    return;
  }
  
  console.log('Logged in as:', authData.user.id);
  const { data, error } = await supabase.rpc('claim_wallet', { p_user_id: authData.user.id, p_wallet_key: 'referral' });
  console.log('RPC result:', data, error);
  
  const { data: updated } = await supabase.from('profiles').select('wallets').eq('id', authData.user.id).single();
  console.log('After claim:', updated.wallets.referral.balance, updated.wallets.master.balance);
}
test();
