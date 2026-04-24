
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

async function columns(tableName: string) {
    const { data, error } = await supabase.rpc('get_functions_def', {}, { count: 'exact' }); // Hack: use RPC to get columns via dynamic SQL if possible, or just query a sample
    // Better way:
    const { data: cols, error: err } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);
    
    if (cols && cols.length > 0) {
        console.log(`Columns for ${tableName}:`, Object.keys(cols[0]));
    } else {
        console.log(`No data found for ${tableName} or error:`, err?.message);
    }
}

async function run() {
    await columns('profiles');
    await columns('user_wallets');
    await columns('transactions');
    await columns('income_ledger');
    await columns('team_collection');
}

run();
