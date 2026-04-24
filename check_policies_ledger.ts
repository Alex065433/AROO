
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
    const { data: policies, error } = await supabase
        .from('pg_policies')
        .select('*')
        .eq('tablename', 'income_ledger');
    
    console.log('income_ledger policies:', policies);
}

run();
