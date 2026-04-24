
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
    const userId = '76c13fa9-822b-4275-ac30-4238e5a69fd1';
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, master_wallet, referral_income, total_income, active_package, wallets')
        .eq('id', userId)
        .single();
    
    console.log('Profile for SRH:', profile);
    if (error) console.log('Error:', error.message);
}

run();
