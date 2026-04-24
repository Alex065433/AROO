
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!, 
    process.env.VITE_SUPABASE_SERVICE_KEY!
);

async function check() {
    const { data: members, error: mErr } = await supabase.from('members').select('*').limit(5);
    console.log('Members columns:', members ? Object.keys(members[0] || {}) : 'None');
    console.log('Members error:', mErr);

    const { data: profiles, error: pErr } = await supabase.from('profiles').select('*').limit(5);
    console.log('Profiles columns:', profiles ? Object.keys(profiles[0] || {}) : 'None');
    console.log('Profiles error:', pErr);
}

check();
