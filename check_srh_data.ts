
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
    const userId = '76c13fa9-822b-4275-ac30-4238e5a69fd1';
    const { data: wallet, error } = await supabase
        .from('user_wallets')
        .select('*')
        .eq('id', userId)
        .single();
    
    console.log('Wallet for SRH:', wallet);
    if (error) console.log('Error:', error.message);

    const { data: ledger, error: lError } = await supabase
        .from('income_ledger')
        .select('*')
        .eq('user_id', userId);
    
    console.log('Income Ledger for SRH:', ledger);
}

run();
