import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const email = `test_update_${Date.now()}@example.com`;
  const password = 'password123';
  
  const { data: authData } = await supabase.auth.signUp({ email, password });
  const userId = authData.user?.id;
  
  await supabase.from('profiles').insert({
    id: userId,
    email,
    wallets: { referral: { balance: 100, currency: 'USDT' } }
  });
  
  const { error } = await supabase.from('profiles').update({
    wallets: { referral: { balance: 0, currency: 'USDT' }, master: { balance: 100, currency: 'USDT' } }
  }).eq('id', userId);
  
  console.log('Update error:', error);
  
  const { data: updated } = await supabase.from('profiles').select('wallets').eq('id', userId).single();
  console.log('After update:', updated?.wallets?.referral?.balance, updated?.wallets?.master?.balance);
}
test();
