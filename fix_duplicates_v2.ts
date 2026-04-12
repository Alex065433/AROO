import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_KEY!
);

async function fixDuplicates() {
  console.log('Starting binary tree fix (duplicates and self-refs)...');

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, parent_id, side, position, operator_id, sponsor_id');

  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }

  const placementMap = new Map<string, string[]>();
  const toMove: { userId: string, startParentId: string, side: 'LEFT' | 'RIGHT' }[] = [];

  profiles.forEach(p => {
    // 1. Check for self-references
    if (p.id === p.parent_id) {
      console.log(`Found self-ref: User ${p.operator_id} (${p.id})`);
      toMove.push({ 
        userId: p.id, 
        startParentId: p.sponsor_id || p.id, 
        side: (p.side || 'LEFT').toUpperCase() as 'LEFT' | 'RIGHT' 
      });
      return;
    }

    // 2. Check for duplicates
    if (p.parent_id && p.side) {
      const key = `${p.parent_id}|${p.side.toUpperCase()}`;
      if (!placementMap.has(key)) {
        placementMap.set(key, []);
      }
      placementMap.get(key)!.push(p.id);
    }
  });

  placementMap.forEach((ids, key) => {
    if (ids.length > 1) {
      const [parentId, side] = key.split('|');
      console.log(`Found duplicate at Parent ${parentId}, Side ${side}: ${ids.length} users`);
      // Keep the first one, move the others
      const [originalId, ...others] = ids;
      others.forEach(id => {
        toMove.push({ 
          userId: id, 
          startParentId: parentId, 
          side: side as 'LEFT' | 'RIGHT' 
        });
      });
    }
  });

  if (toMove.length === 0) {
    console.log('No issues found.');
    return;
  }

  console.log(`Need to move ${toMove.length} users.`);

  for (const item of toMove) {
    console.log(`Moving user ${item.userId} starting from ${item.startParentId} (${item.side})...`);
    
    // Find a new spot using BFS logic
    const newSpot = await findNewSpot(item.startParentId, item.side, profiles, item.userId);
    
    if (newSpot) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          parent_id: newSpot.parentId, 
          side: newSpot.side,
          position: newSpot.side.toLowerCase()
        })
        .eq('id', item.userId);

      if (updateError) {
        console.error(`Failed to move user ${item.userId}:`, updateError);
      } else {
        console.log(`Moved user ${item.userId} to Parent ${newSpot.parentId}, Side ${newSpot.side}`);
        // Update local profile list to reflect the move
        const movedUser = profiles.find(p => p.id === item.userId);
        if (movedUser) {
          movedUser.parent_id = newSpot.parentId;
          movedUser.side = newSpot.side;
        }
      }
    } else {
      console.error(`Could not find a new spot for user ${item.userId}`);
    }
  }

  console.log('Binary tree fix complete.');
}

async function findNewSpot(rootId: string, side: 'LEFT' | 'RIGHT', allProfiles: any[], movingUserId: string) {
  const nodesByParent = new Map<string, { left?: string, right?: string }>();
  allProfiles.forEach(p => {
    if (p.parent_id && p.id !== movingUserId) {
      if (!nodesByParent.has(p.parent_id)) nodesByParent.set(p.parent_id, {});
      const children = nodesByParent.get(p.parent_id)!;
      const s = (p.side || '').trim().toUpperCase();
      if (s === 'LEFT') children.left = p.id;
      else if (s === 'RIGHT') children.right = p.id;
    }
  });

  // Find the direct child on the specified side
  const children = nodesByParent.get(rootId) || {};
  const directChildId = side === 'LEFT' ? children.left : children.right;

  if (!directChildId) {
    return { parentId: rootId, side };
  }

  // BFS starting from directChildId
  const queue = [directChildId];
  const visited = new Set([directChildId]);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (currentId === movingUserId) continue;

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

fixDuplicates();
