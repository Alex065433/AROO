import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_KEY!
);

async function ultimateFix() {
  console.log('Starting ultimate binary tree fix...');

  // 1. Fetch all profiles
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, parent_id, side, position, operator_id, sponsor_id');

  if (error || !profiles) {
    console.error('Error fetching profiles:', error);
    return;
  }

  // 2. Identify all nodes that have ANY inconsistency or conflict
  const problematicIds = new Set<string>();
  const parentSideMap = new Map<string, string>();
  const parentPosMap = new Map<string, string>();

  profiles.forEach(p => {
    if (p.parent_id) {
      const sideKey = `${p.parent_id}|${p.side?.toUpperCase()}`;
      const posKey = `${p.parent_id}|${p.position?.toUpperCase()}`;
      
      if (parentSideMap.has(sideKey)) problematicIds.add(p.id);
      else parentSideMap.set(sideKey, p.id);
      
      if (parentPosMap.has(posKey)) problematicIds.add(p.id);
      else parentPosMap.set(posKey, p.id);

      if (p.side?.toUpperCase() !== p.position?.toUpperCase()) {
        problematicIds.add(p.id);
      }
      
      if (p.id === p.parent_id) problematicIds.add(p.id);
    }
  });

  console.log(`Found ${problematicIds.size} problematic nodes.`);

  if (problematicIds.size === 0) {
    console.log('No problems found.');
    return;
  }

  // 3. Detach all problematic nodes from the tree temporarily
  console.log('Detaching problematic nodes...');
  for (const id of problematicIds) {
    const { error: detachError } = await supabase
      .from('profiles')
      .update({ parent_id: null, side: null, position: null })
      .eq('id', id);
    if (detachError) console.error(`Failed to detach ${id}:`, detachError.message);
  }

  // 4. Re-fetch profiles to have a clean state for BFS
  const { data: cleanProfiles } = await supabase
    .from('profiles')
    .select('id, parent_id, side, position, operator_id, sponsor_id');

  if (!cleanProfiles) return;

  // 5. Re-attach nodes one by one using BFS
  console.log('Re-attaching nodes...');
  for (const id of problematicIds) {
    const p = profiles.find(x => x.id === id);
    if (!p) continue;

    const startParentId = p.sponsor_id || cleanProfiles.find(x => x.parent_id === null)?.id;
    if (!startParentId) {
      console.error(`No sponsor or root found for ${p.operator_id}`);
      continue;
    }

    const side = (p.side || 'LEFT').toUpperCase() as 'LEFT' | 'RIGHT';
    console.log(`Finding spot for ${p.operator_id} starting from ${startParentId} (${side})...`);
    
    const newSpot = await findNewSpot(startParentId, side, cleanProfiles);
    if (newSpot) {
      const { error: attachError } = await supabase
        .from('profiles')
        .update({ 
          parent_id: newSpot.parentId, 
          side: newSpot.side,
          position: newSpot.side.toLowerCase()
        })
        .eq('id', id);

      if (attachError) {
        console.error(`Failed to re-attach ${p.operator_id}:`, attachError.message);
      } else {
        console.log(`Re-attached ${p.operator_id} to Parent ${newSpot.parentId}, Side ${newSpot.side}`);
        // Update local cleanProfiles for next iteration
        const attachedNode = cleanProfiles.find(x => x.id === id);
        if (attachedNode) {
          attachedNode.parent_id = newSpot.parentId;
          attachedNode.side = newSpot.side;
          attachedNode.position = newSpot.side.toLowerCase();
        } else {
          cleanProfiles.push({
            id,
            parent_id: newSpot.parentId,
            side: newSpot.side,
            position: newSpot.side.toLowerCase(),
            operator_id: p.operator_id,
            sponsor_id: p.sponsor_id
          });
        }
      }
    } else {
      console.error(`Could not find a spot for ${p.operator_id}`);
    }
  }

  console.log('Ultimate fix complete.');
}

async function findNewSpot(rootId: string, side: 'LEFT' | 'RIGHT', allProfiles: any[]) {
  const nodesByParent = new Map<string, { left?: string, right?: string }>();
  allProfiles.forEach(p => {
    if (p.parent_id) {
      if (!nodesByParent.has(p.parent_id)) nodesByParent.set(p.parent_id, {});
      const children = nodesByParent.get(p.parent_id)!;
      const s = (p.side || p.position || '').trim().toUpperCase();
      if (s === 'LEFT') children.left = p.id;
      else if (s === 'RIGHT') children.right = p.id;
    }
  });

  const children = nodesByParent.get(rootId) || {};
  const directChildId = side === 'LEFT' ? children.left : children.right;

  if (!directChildId) {
    return { parentId: rootId, side };
  }

  const queue = [directChildId];
  const visited = new Set([directChildId]);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentChildren = nodesByParent.get(currentId) || {};

    if (!currentChildren.left) return { parentId: currentId, side: 'LEFT' as const };
    if (!currentChildren.right) return { parentId: currentId, side: 'RIGHT' as const };

    if (!visited.has(currentChildren.left)) {
      visited.add(currentChildren.left);
      queue.push(currentChildren.left);
    }
    if (!visited.has(currentChildren.right)) {
      visited.add(currentChildren.right);
      queue.push(currentChildren.right);
    }
  }

  return null;
}

ultimateFix();
