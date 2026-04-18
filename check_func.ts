
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_SERVICE_KEY!);

async function run() {
    const { data, error } = await supabase.rpc('get_func', { func_name: 'get_next_binary_slot' });
    console.log('Function info:', data);
    if (error) console.error('Error:', error);
}
run();
