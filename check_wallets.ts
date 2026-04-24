
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
    const { data, error } = await supabase.from('user_wallets').select('*').limit(5);
    console.log('user_wallets data:', data);
    if (error) console.log('user_wallets error:', error.message);

    const { data: vdata, error: verror } = await supabase.from('voxmeta_wallets').select('*').limit(5);
    console.log('voxmeta_wallets data:', vdata);
    if (verror) console.log('voxmeta_wallets error:', verror.message);
}
run();
