
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
    const userId = '1235b7e7-1b3d-4d97-b93d-6f759d8f93e5'; // dummy or real if we find one
    
    const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
    if (!profiles || profiles.length === 0) return;
    const uid = profiles[0].id;

    console.log('Testing income_ledger insert with UID:', uid);
    
    // Test uppercase
    const { error: err1 } = await supabase.from('income_ledger').insert({
        user_id: uid,
        amount: 2.50,
        type: 'DIRECT_REFERRAL',
        status: 'COMPLETED'
    });
    
    console.log('Uppercase insert error:', err1?.message, err1?.details);

    // Test lowercase
    const { error: err2 } = await supabase.from('income_ledger').insert({
        user_id: uid,
        amount: 2.50,
        type: 'direct_referral',
        status: 'COMPLETED'
    });
    
    console.log('Lowercase insert error:', err2?.message, err2?.details);
}

run();
