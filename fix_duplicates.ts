
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function findBinaryParent(startNodeId: string, side: 'LEFT' | 'RIGHT'): Promise<{ parentId: string, side: 'LEFT' | 'RIGHT' }> {
    let currentParentId = startNodeId;
    let depth = 0;
    const MAX_DEPTH = 1000;
    
    while (depth < MAX_DEPTH) {
      depth++;
      const { data: children, error } = await supabase
        .from('profiles')
        .select('id, side')
        .eq('parent_id', currentParentId);
      
      if (error) throw error;
      
      const sideChild = children?.find(c => (c.side || '').toUpperCase() === side.toUpperCase());
      if (!sideChild) {
        return { parentId: currentParentId, side };
      } else {
        currentParentId = sideChild.id;
      }
    }
    throw new Error('Max depth reached');
}

async function fixDuplicates() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, operator_id, side, parent_id, created_at')
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('Error:', error);
    return;
  }

  const placements = new Map<string, string>();
  for (const p of profiles) {
    if (p.parent_id && p.side) {
      const key = `${p.parent_id}-${p.side.toUpperCase()}`;
      if (placements.has(key)) {
        console.log(`FIXING DUPLICATE: ${p.operator_id} (created at ${p.created_at}) is on same spot as ${placements.get(key)}`);
        
        // Find a new spot for this duplicate
        try {
          const newPlacement = await findBinaryParent(p.parent_id, p.side.toUpperCase() as any);
          console.log(`Moving ${p.operator_id} to new parent ${newPlacement.parentId} on side ${newPlacement.side}`);
          
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ 
              parent_id: newPlacement.parentId,
              side: newPlacement.side
            })
            .eq('id', p.id);
            
          if (updateError) {
            console.error(`Failed to move ${p.operator_id}:`, updateError.message);
          } else {
            // Update the key in placements for future checks (though order is by created_at)
            // Actually, we don't need to update placements because we moved it.
          }
        } catch (err) {
          console.error(`Error finding new spot for ${p.operator_id}:`, err);
        }
      } else {
        placements.set(key, p.operator_id);
      }
    }
  }
  console.log('Fix complete.');
}

fixDuplicates();
