
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
    const { data: tables, error } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');
    
    console.log('Tables:', tables?.map(t => t.table_name));
    
    const { data: ledger, error: lError } = await supabase
        .from('income_ledger')
        .select('*')
        .limit(1);
    
    console.log('income_ledger error:', lError?.message);
}

run();
