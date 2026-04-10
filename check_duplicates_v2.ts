
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, operator_id, parent_id, side')
    .not('parent_id', 'is', null);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  const placements = new Map<string, string>();
  const duplicates = [];
  
  for (const node of data || []) {
    const key = `${node.parent_id}-${node.side}`;
    if (placements.has(key)) {
      duplicates.push({
        key,
        node1: placements.get(key),
        node2: node.operator_id
      });
    } else {
      placements.set(key, node.operator_id);
    }
  }
  
  console.log('Duplicate placements:', duplicates.length);
  if (duplicates.length > 0) {
    console.log('Duplicates:', duplicates);
  }
}
check();
