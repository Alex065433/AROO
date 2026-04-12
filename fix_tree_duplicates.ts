
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixDuplicates() {
  const { data: profiles, error } = await supabase.from('profiles').select('id, parent_id, side, operator_id, created_at').order('created_at', { ascending: true });
  if (error) {
    console.error(error);
    return;
  }

  const nodesByParent = new Map();
  const duplicates = [];

  profiles.forEach(p => {
    if (p.parent_id) {
      const key = `${p.parent_id}-${p.side}`;
      if (nodesByParent.has(key)) {
        duplicates.push(p);
      } else {
        nodesByParent.set(key, p);
      }
    }
  });

  console.log(`Found ${duplicates.length} duplicates to fix.`);

  // For each duplicate, find a new spot
  for (const dup of duplicates) {
    console.log(`Fixing duplicate: ${dup.operator_id} (current parent: ${dup.parent_id}, side: ${dup.side})`);
    
    // Find extreme left/right of the sponsor? Wait, we don't know the sponsor here easily without querying.
    // Let's just find the extreme side of its current parent.
    let currentId = dup.parent_id;
    let depth = 0;
    let newParentId = currentId;
    let newSide = dup.side;

    while (depth < 50) {
      const { data: children } = await supabase.from('profiles').select('id, side').eq('parent_id', currentId);
      const childOnSide = children?.find(c => c.side === newSide && c.id !== dup.id);
      
      if (!childOnSide) {
        newParentId = currentId;
        break;
      }
      currentId = childOnSide.id;
      depth++;
    }

    console.log(`New spot for ${dup.operator_id}: parent ${newParentId}, side ${newSide}`);
    
    // Update the node
    const { error: updateError } = await supabase.from('profiles').update({ 
      parent_id: newParentId,
      side: newSide,
      position: newSide.toLowerCase()
    }).eq('id', dup.id);
    if (updateError) {
      console.error(`Failed to update ${dup.operator_id}:`, updateError);
    } else {
      console.log(`Successfully updated ${dup.operator_id}`);
    }
  }
}
fixDuplicates();
