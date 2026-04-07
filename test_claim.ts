import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: users } = await supabase.from('profiles').select('id, email, wallets').gt('referral_income', 0).limit(1);
  if (users && users.length > 0) {
    const user = users[0];
    console.log('Before claim:', user.wallets.referral.balance, user.wallets.master.balance);
    
    // Simulate claim
    const amountToClaim = user.wallets.referral.balance;
    const newWallets = { ...user.wallets };
    newWallets.referral.balance = 0;
    newWallets.master.balance += amountToClaim;
    
    const { error } = await supabase.from('profiles').update({ wallets: newWallets }).eq('id', user.id);
    console.log('Update error:', error);
    
    const { data: updated } = await supabase.from('profiles').select('wallets').eq('id', user.id).single();
    console.log('After claim:', updated.wallets.referral.balance, updated.wallets.master.balance);
  }
}
test();
