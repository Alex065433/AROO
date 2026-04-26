import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function addColumn() {
    console.log('Attempting to add pending_yield to team_collection...');
    
    // Check if column exists first
    const { data: cols, error: colErr } = await supabase.rpc('get_table_columns', { table_name: 'team_collection' });
    
    if (colErr) {
        console.log('Could not check columns via RPC. Trying direct ALTER TABLE via any available RPC.');
    } else if (cols && cols.includes('pending_yield')) {
        console.log('Column pending_yield already exists.');
        return;
    }

    const sql = `ALTER TABLE public.team_collection ADD COLUMN IF NOT EXISTS pending_yield NUMERIC DEFAULT 0;`;
    
    // Try different RPC names I've seen in the branch
    const rpcs = ['admin_execute_sql_rpc', 'exec_sql', 'execute_sql'];
    
    for (const rpc of rpcs) {
        console.log(`Trying RPC: ${rpc}`);
        const { error } = await supabase.rpc(rpc, { p_sql: sql });
        if (!error) {
            console.log(`Success with RPC: ${rpc}`);
            return;
        }
        console.log(`RPC ${rpc} failed: ${error.message}`);
    }
    
    console.log('Failed to add column via RPC. Please add it manually in the Supabase Dashboard:');
    console.log(sql);
}

addColumn();
