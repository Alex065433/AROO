
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function checkSides() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, operator_id, side, parent_id');
  
  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Total profiles:', data.length);
  const sideCounts: Record<string, number> = {};
  data.forEach(p => {
    const side = p.side === null ? 'NULL' : `'${p.side}'`;
    sideCounts[side] = (sideCounts[side] || 0) + 1;
    if (p.side === null && p.parent_id !== null) {
        console.log(`Node with NULL side but has parent: ${p.operator_id}, parent: ${p.parent_id}`);
    }
  });
  console.log('Side counts:', sideCounts);
}

checkSides();
