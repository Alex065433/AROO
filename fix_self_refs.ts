import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_KEY!
);

async function fixSelfRefs() {
  console.log('Starting self-reference fix...');

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, sponsor_id, parent_id, operator_id');

  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }

  const selfRefs = profiles?.filter(p => p.id === p.parent_id) || [];

  if (!selfRefs || selfRefs.length === 0) {
    console.log('No self-references found.');
    return;
  }

  console.log(`Found ${selfRefs.length} self-references.`);

  for (const user of selfRefs) {
    console.log(`Fixing self-ref for user ${user.operator_id} (${user.id})...`);
    
    // Set parent_id to sponsor_id as a starting point
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ parent_id: user.sponsor_id })
      .eq('id', user.id);

    if (updateError) {
      console.error(`Failed to update parent_id for ${user.id}:`, updateError);
    } else {
      console.log(`Updated parent_id to sponsor_id ${user.sponsor_id} for user ${user.id}`);
    }
  }

  console.log('Self-reference fix complete.');
}

fixSelfRefs();
