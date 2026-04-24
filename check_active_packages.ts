
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
    const { data: activeUsers, error } = await supabase
        .from('profiles')
        .select('id, name, operator_id, active_package, status')
        .gt('active_package', 0);
    
    console.log('Active users:', activeUsers);
    if (error) console.log('Error:', error.message);
}

run();
