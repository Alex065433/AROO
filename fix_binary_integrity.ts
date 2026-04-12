
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixBinaryIntegrity() {
  console.log('Starting Binary Integrity Fix...');

  // 1. Get all profiles
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, parent_id, side, position, operator_id, created_at')
    .order('created_at', { ascending: true });

  if (error || !profiles) {
    console.error('Error fetching profiles:', error);
    return;
  }

  console.log(`Analyzing ${profiles.length} profiles...`);

  // 2. Identify duplicates (same parent_id and side)
  const seen = new Set<string>();
  const duplicates: any[] = [];
  const validNodes = new Map<string, any>();

  for (const p of profiles) {
    if (!p.parent_id) {
      validNodes.set(p.id, p);
      continue;
    }

    const side = (p.side || p.position || 'LEFT').toUpperCase();
    const key = `${p.parent_id}|${side}`;

    if (seen.has(key)) {
      console.log(`Duplicate found: ${p.operator_id} at ${key}`);
      duplicates.push(p);
    } else {
      seen.add(key);
      validNodes.set(p.id, p);
    }
  }

  console.log(`Found ${duplicates.length} duplicate placements.`);

  // 3. Detach duplicates
  for (const dup of duplicates) {
    console.log(`Detaching duplicate: ${dup.operator_id}`);
    await supabase.from('profiles')
      .update({ parent_id: null, side: null, position: null })
      .eq('id', dup.id);
  }

  // 4. Re-attach detached nodes using Extreme Placement logic
  const { data: detached } = await supabase
    .from('profiles')
    .select('id, operator_id, sponsor_id, side, position')
    .is('parent_id', null)
    .not('id', 'in', `(${profiles.find(p => !p.parent_id)?.id || ''})`); // Don't re-attach the root

  if (detached && detached.length > 0) {
    console.log(`Re-attaching ${detached.length} detached nodes...`);
    
    for (const node of detached) {
      // Find a new spot under the sponsor
      let sponsorId = node.sponsor_id;
      if (!sponsorId) {
        // Fallback to root if no sponsor
        sponsorId = profiles.find(p => !p.parent_id)?.id;
      }

      if (sponsorId) {
        const side = (node.side || node.position || 'LEFT').toUpperCase() as 'LEFT' | 'RIGHT';
        const newSpot = await findBinaryParentExtreme(sponsorId, side);
        
        console.log(`Re-attaching ${node.operator_id} under ${newSpot.parentId} on ${newSpot.side}`);
        
        await supabase.from('profiles')
          .update({
            parent_id: newSpot.parentId,
            side: newSpot.side,
            position: newSpot.side.toLowerCase()
          })
          .eq('id', node.id);
      }
    }
  }

  // 5. Rebuild stats
  console.log('Rebuilding binary stats...');
  await supabase.rpc('rebuild_binary_stats');

  console.log('Binary Integrity Fix Complete.');
}

async function findBinaryParentExtreme(startNodeId: string, side: 'LEFT' | 'RIGHT'): Promise<{ parentId: string, side: 'LEFT' | 'RIGHT' }> {
  let currentId = startNodeId;
  let depth = 0;
  
  while (depth < 1000) {
    const { data: child } = await supabase.from('profiles')
      .select('id')
      .eq('parent_id', currentId)
      .eq('side', side)
      .maybeSingle();

    if (!child) return { parentId: currentId, side };
    currentId = child.id;
    depth++;
  }
  return { parentId: currentId, side };
}

fixBinaryIntegrity();
