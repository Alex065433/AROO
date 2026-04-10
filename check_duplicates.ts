
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function checkDuplicates() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, operator_id, side, parent_id');
  
  if (error) {
    console.error('Error:', error);
    return;
  }

  const placements = new Map<string, string>();
  data.forEach(p => {
    if (p.parent_id && p.side) {
      const key = `${p.parent_id}-${p.side.toUpperCase()}`;
      if (placements.has(key)) {
        console.log(`DUPLICATE PLACEMENT: ${p.operator_id} and ${placements.get(key)} both on ${p.side} of ${p.parent_id}`);
      } else {
        placements.set(key, p.operator_id);
      }
    }
  });
  console.log('Check complete.');
}

checkDuplicates();
