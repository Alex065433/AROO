
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
    const { data, error } = await supabase.rpc('get_functions_def', {});
    const func = data?.find((f: any) => f.routine_name === 'create_user_wallet');
    console.log('create_user_wallet definition:', func?.routine_definition);
}

run();
