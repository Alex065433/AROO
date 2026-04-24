
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!, 
    process.env.VITE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
    console.log('Syncing user_wallets from profiles...');
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, wallet_balance, wallets, sponsor_id, parent_id, side, active_package');
    
    if (error) {
        console.error('Error fetching profiles:', error.message);
        return;
    }

    for (const profile of (profiles as any[])) {
        let master = Number(profile.wallet_balance || 0);
        let referral = 0;
        let yield_bal = 0;

        if (profile.wallets) {
            const w = profile.wallets as any;
            master = Number(w.master?.balance || master);
            referral = Number(w.referral?.balance || 0);
            yield_bal = Number(w.yield?.balance || 0);
        }

        const { error: upsertError } = await supabase
            .from('user_wallets')
            .upsert({
                id: profile.id,
                master_vault: master,
                referral_box: referral,
                network_yield_box: yield_bal
            });
        
        if (upsertError) {
            console.log(`Failed to sync wallet for ${profile.id}:`, upsertError.message);
        } else {
            console.log(`Synced wallet for ${profile.id}`);
        }

        // SYNC MEMBERS
        const { error: membersError } = await supabase
            .from('members')
            .upsert({
                id: profile.id,
                sponsor_id: profile.sponsor_id,
                placement_id: profile.parent_id,
                position: profile.side || 'LEFT',
                is_active: profile.active_package > 0
            });
        
        if (membersError) {
            console.log(`Failed to sync member for ${profile.id}:`, membersError.message);
        } else {
            console.log(`Synced member for ${profile.id}`);
        }
    }
}

run();
