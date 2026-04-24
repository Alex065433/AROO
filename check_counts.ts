
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
    const { count, error } = await supabase
        .from('user_wallets')
        .select('*', { count: 'exact', head: true });
    
    console.log('user_wallets count:', count);
    if (error) console.log('Error:', error.message);

    const { count: pCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
    console.log('profiles count:', pCount);
}

run();
