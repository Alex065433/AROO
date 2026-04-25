import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const tables = ['profiles', 'members', 'user_wallets', 'team_collection'];
    for (const table of tables) {
        console.log(`\n--- ${table} ---`);
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.log(`Error fetching ${table}:`, error.message);
        } else if (data && data.length > 0) {
            console.log(Object.keys(data[0]).join(', '));
        } else {
            // Try to get columns even if no data
            const { data: cols, error: colErr } = await supabase.rpc('get_table_columns', { table_name: table });
            if (colErr) {
                console.log(`No data in ${table} and RPC failed.`);
            } else {
                 console.log('Columns via RPC:', cols);
            }
        }
    }
}
check();
