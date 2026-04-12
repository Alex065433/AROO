import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_KEY!
);

async function finalCleanup() {
  console.log('Starting final binary tree cleanup...');

  // 1. Fetch all profiles
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, parent_id, side, position, operator_id, sponsor_id');

  if (error || !profiles) {
    console.error('Error fetching profiles:', error);
    return;
  }

  console.log(`Processing ${profiles.length} profiles...`);

  // 2. Fix side/position consistency first
  for (const p of profiles) {
    const side = (p.side || '').toUpperCase();
    const position = (p.position || '').toUpperCase();
    
    if (side && position && side !== position) {
      console.log(`Inconsistent side/position for ${p.operator_id}: side=${side}, position=${position}. Syncing to side.`);
      await supabase.from('profiles').update({ position: side.toLowerCase() }).eq('id', p.id);
      p.position = side.toLowerCase();
    } else if (side && !position) {
      await supabase.from('profiles').update({ position: side.toLowerCase() }).eq('id', p.id);
      p.position = side.toLowerCase();
    } else if (!side && position) {
      await supabase.from('profiles').update({ side: position }).eq('id', p.id);
      p.side = position;
    }
  }

  // 3. Identify duplicates and self-refs
  const placementMap = new Map<string, string[]>();
  const toMove: { userId: string, startParentId: string, side: 'LEFT' | 'RIGHT' }[] = [];

  profiles.forEach(p => {
    // Self-ref check
    if (p.id === p.parent_id) {
      console.log(`Found self-ref: User ${p.operator_id} (${p.id})`);
      toMove.push({ 
        userId: p.id, 
        startParentId: p.sponsor_id || p.id, 
        side: (p.side || 'LEFT').toUpperCase() as 'LEFT' | 'RIGHT' 
      });
      return;
    }

    // Duplicate check
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
    console.log('No placement issues found.');
  } else {
    console.log(`Need to move ${toMove.length} users.`);
    for (const item of toMove) {
      console.log(`Moving user ${item.userId} starting from ${item.startParentId} (${item.side})...`);
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
          // Update local state
          const movedUser = profiles.find(p => p.id === item.userId);
          if (movedUser) {
            movedUser.parent_id = newSpot.parentId;
            movedUser.side = newSpot.side;
            movedUser.position = newSpot.side.toLowerCase();
          }
        }
      } else {
        console.error(`Could not find a new spot for user ${item.userId}`);
      }
    }
  }

  console.log('Cleanup complete.');
}

async function findNewSpot(rootId: string, side: 'LEFT' | 'RIGHT', allProfiles: any[], movingUserId: string) {
  const nodesByParent = new Map<string, { left?: string, right?: string }>();
  allProfiles.forEach(p => {
    if (p.parent_id && p.id !== movingUserId) {
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

finalCleanup();
