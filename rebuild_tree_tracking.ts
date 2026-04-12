
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function rebuildTracking() {
  console.log("Fetching all profiles...");
  const { data: allProfiles, error } = await supabase.from('profiles').select('id, parent_id, side, wallets');
  if (error) {
    console.error(error);
    return;
  }

  console.log(`Processing ${allProfiles.length} profiles...`);
  
  const nodesByParent = new Map<string, { left?: string, right?: string }>();
  allProfiles.forEach(p => {
    if (p.parent_id) {
      if (!nodesByParent.has(p.parent_id)) nodesByParent.set(p.parent_id, {});
      const children = nodesByParent.get(p.parent_id)!;
      if (p.side === 'LEFT') children.left = p.id;
      else if (p.side === 'RIGHT') children.right = p.id;
    }
  });

  const trackingUpdates = new Map<string, { left_last_id?: string, right_last_id?: string }>();

  function findLast(startId: string, side: 'LEFT' | 'RIGHT'): string {
    let currentId = startId;
    let depth = 0;
    while (depth < 500) {
      const children = nodesByParent.get(currentId);
      const nextId = side === 'LEFT' ? children?.left : children?.right;
      if (!nextId) return currentId;
      currentId = nextId;
      depth++;
    }
    return currentId;
  }

  for (const p of allProfiles) {
    const children = nodesByParent.get(p.id);
    const leftLast = children?.left ? findLast(children.left, 'LEFT') : undefined;
    const rightLast = children?.right ? findLast(children.right, 'RIGHT') : undefined;

    if (leftLast || rightLast) {
      trackingUpdates.set(p.id, { left_last_id: leftLast, right_last_id: rightLast });
    }
  }

  console.log(`Updating ${trackingUpdates.size} profiles with tracking info...`);
  
  for (const [id, meta] of trackingUpdates.entries()) {
    const profile = allProfiles.find(p => p.id === id);
    if (!profile) continue;

    const newWallets = { ...(profile.wallets || {}) };
    newWallets.tree_meta = { 
      ...(newWallets.tree_meta || {}),
      ...meta
    };

    const { error: updateError } = await supabase.from('profiles').update({ wallets: newWallets }).eq('id', id);
    if (updateError) {
      console.error(`Failed to update ${id}:`, updateError);
    }
  }

  console.log("Rebuild complete.");
}

rebuildTracking();
