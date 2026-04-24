
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Use SERVICE_ROLE_KEY if available to bypass RLS
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!);

async function syncMembers() {
  console.log('Fetching profiles...');
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, sponsor_id, parent_id, side, position')
    .not('parent_id', 'is', null);

  if (pErr) {
    console.error('Error fetching profiles:', pErr.message);
    return;
  }

  console.log(`Found ${profiles?.length} profiles with parent_id. Checking members...`);

  for (const p of profiles) {
    const side = (p.side || p.position || 'LEFT').toUpperCase();
    const { data: existing } = await supabase.from('members').select('id').eq('id', p.id).maybeSingle();
    
    if (!existing) {
      console.log(`Syncing member ${p.id} to members table...`);
      const { error: insErr } = await supabase.from('members').insert({
        id: p.id,
        sponsor_id: p.sponsor_id,
        placement_id: p.parent_id,
        position: side as any
      });
      if (insErr) console.error(`Failed to sync ${p.id}:`, insErr.message);
    }
  }
  console.log('Sync complete.');
}

syncMembers();
