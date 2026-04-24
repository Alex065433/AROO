
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
    const { data: cols, error } = await supabase.rpc('get_functions_def', {}); // Not the right rpc for this but I want to see if I can list tables
    // Actually, I'll use a hack with a non-existent rpc to see if it lists potential matches or just error
    const { data: tables, error: tErr } = await supabase.from('information_schema.tables').select('table_name').eq('table_schema', 'public');
    console.log('Tables from information_schema:', tables);
}
run();
