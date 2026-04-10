
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function checkRoots() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, operator_id, parent_id')
    .is('parent_id', null);
  
  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Roots found:', data.length);
  data.forEach(r => console.log(`Root: ${r.operator_id} (${r.id})`));
}

checkRoots();
