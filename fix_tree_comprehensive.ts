
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixTree() {
  const { data: profiles, error } = await supabase.from('profiles').select('id, parent_id, side, position, operator_id, created_at').order('created_at', { ascending: true });
  if (error) {
    console.error(error);
    return;
  }

  const nodesByParent = new Map();
  const duplicates = [];

  // Find duplicates based on parent_id and side
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

  // 1. Temporarily detach duplicates to avoid unique constraint errors
  for (const dup of duplicates) {
    console.log(`Detaching duplicate: ${dup.operator_id}`);
    await supabase.from('profiles').update({ parent_id: null, position: null }).eq('id', dup.id);
  }

  // 2. Fix position for remaining valid nodes
  const { data: validProfiles } = await supabase.from('profiles').select('id, side, position').not('parent_id', 'is', null);
  for (const p of validProfiles || []) {
    const expectedPosition = p.side ? p.side.toLowerCase() : null;
    if (p.position !== expectedPosition && expectedPosition) {
      console.log(`Fixing valid node ${p.id}: position ${p.position} -> ${expectedPosition}`);
      await supabase.from('profiles').update({ position: expectedPosition }).eq('id', p.id);
    }
  }

  // 3. Re-attach duplicates to new spots
  for (const dup of duplicates) {
    console.log(`Finding new spot for duplicate: ${dup.operator_id} (was under ${dup.parent_id}, side: ${dup.side})`);
    
    let currentId = dup.parent_id;
    let depth = 0;
    let newParentId = currentId;
    let newSide = dup.side;

    while (depth < 50) {
      const { data: children } = await supabase.from('profiles').select('id, side').eq('parent_id', currentId);
      const childOnSide = children?.find(c => c.side === newSide);
      
      if (!childOnSide) {
        newParentId = currentId;
        break;
      }
      currentId = childOnSide.id;
      depth++;
    }

    console.log(`New spot for ${dup.operator_id}: parent ${newParentId}, side ${newSide}`);
    
    const { error: updateError } = await supabase.from('profiles').update({ 
      parent_id: newParentId,
      side: newSide,
      position: newSide.toLowerCase()
    }).eq('id', dup.id);
    
    if (updateError) {
      console.error(`Failed to re-attach ${dup.operator_id}:`, updateError);
    } else {
      console.log(`Successfully re-attached ${dup.operator_id}`);
    }
  }
}
fixTree();
