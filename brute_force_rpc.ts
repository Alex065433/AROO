
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
    const rpcs = ['admin_execute_sql_rpc', 'exec_sql', 'execute_sql', 'sql_execute'];
    const params = ['p_sql', 'sql', 'query', 'sql_string'];

    for (const rpc of rpcs) {
        for (const param of params) {
            console.log(`Trying RPC: ${rpc} with param: ${param}`);
            const { data, error } = await supabase.rpc(rpc, { [param]: 'SELECT 1' });
            if (!error) {
                console.log(`Found working RPC: ${rpc} with param: ${param}`);
                console.log('Result:', data);
                return;
            }
        }
    }
    console.log('No working SQL RPC found.');
}

run();
