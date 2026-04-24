
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_SERVICE_KEY!);

async function run() {
    const { data: rpcs, error } = await supabase.rpc('get_functions_def', {});
    if (error) {
        console.error('Error fetching RPCs:', error.message);
        return;
    }
    console.log('Available RPCs:', rpcs.map((f: any) => f.routine_name));
}

run();
