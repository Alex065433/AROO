import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const email = `test_${Date.now()}@example.com`;
  const password = 'password123';
  
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password
  });
  
  if (authError) {
    console.log('Signup error:', authError.message);
    return;
  }
  
  console.log('Signed up as:', authData.user?.id);
  
  // Create profile
  await supabase.from('profiles').insert({
    id: authData.user?.id,
    email,
    wallets: {
      referral: { balance: 100, currency: 'USDT' },
      master: { balance: 0, currency: 'USDT' }
    }
  });
  
  const { data, error } = await supabase.rpc('claim_wallet', { p_user_id: authData.user?.id, p_wallet_key: 'referral' });
  console.log('RPC result:', data, error);
  
  const { data: updated } = await supabase.from('profiles').select('wallets').eq('id', authData.user?.id).single();
  console.log('After claim:', updated?.wallets?.referral?.balance, updated?.wallets?.master?.balance);
}
test();
