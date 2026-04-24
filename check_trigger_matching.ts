
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
    const { data: funcDef, error } = await supabase.rpc('get_functions_def', {});
    const matchingFunc = funcDef?.find((f: any) => f.routine_name === 'trigger_matching');
    console.log('trigger_matching definition:', matchingFunc?.routine_definition);
}

run();
