
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTree() {
  const { data: profiles, error } = await supabase.from('profiles').select('id, parent_id, side, operator_id');
  if (error) {
    console.error(error);
    return;
  }

  const nodesByParent = new Map();
  const duplicates = [];
  const orphans = [];

  const profileMap = new Map(profiles.map(p => [p.id, p]));

  profiles.forEach(p => {
    if (p.parent_id) {
      if (!profileMap.has(p.parent_id)) {
        orphans.push(p);
      } else {
        const key = `${p.parent_id}-${p.side}`;
        if (nodesByParent.has(key)) {
          duplicates.push({ existing: nodesByParent.get(key), new: p });
        } else {
          nodesByParent.set(key, p);
        }
      }
    }
  });

  console.log(`Total profiles: ${profiles.length}`);
  console.log(`Orphans (parent_id not found): ${orphans.length}`);
  console.log(`Duplicates (same parent and side): ${duplicates.length}`);
  if (duplicates.length > 0) {
    console.log("Sample duplicates:", duplicates.slice(0, 5));
  }
}
checkTree();
