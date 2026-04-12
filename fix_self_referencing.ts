
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixSelfReferencing() {
  const { data: profiles } = await supabase.from('profiles').select('id, operator_id, parent_id, sponsor_id, side');
  const selfReferencing = profiles.filter(p => p.parent_id === p.id);

  console.log(`Found ${selfReferencing.length} self-referencing profiles.`);

  for (const p of selfReferencing) {
    console.log(`Fixing ${p.operator_id}...`);
    
    // Find sponsor
    let sponsorId = p.sponsor_id;
    if (!sponsorId) {
      // Fallback to root
      const { data: root } = await supabase.from('profiles').select('id').order('created_at', { ascending: true }).limit(1).single();
      sponsorId = root.id;
    }

    // Find extreme side of sponsor
    let currentId = sponsorId;
    let depth = 0;
    let newParentId = currentId;
    let newSide = p.side || 'LEFT';

    while (depth < 50) {
      const { data: children } = await supabase.from('profiles').select('id, side').eq('parent_id', currentId);
      const childOnSide = children?.find(c => c.side === newSide && c.id !== p.id);
      
      if (!childOnSide) {
        newParentId = currentId;
        break;
      }
      currentId = childOnSide.id;
      depth++;
    }

    console.log(`New spot for ${p.operator_id}: parent ${newParentId}, side ${newSide}`);
    
    const { error: updateError } = await supabase.from('profiles').update({ 
      parent_id: newParentId,
      side: newSide,
      position: newSide.toLowerCase()
    }).eq('id', p.id);
    
    if (updateError) {
      console.error(`Failed to fix ${p.operator_id}:`, updateError);
    } else {
      console.log(`Successfully fixed ${p.operator_id}`);
    }
  }
}
fixSelfReferencing();
