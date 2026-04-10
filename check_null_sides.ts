
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
    .not('parent_id', 'is', null)
    .is('side', null);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Nodes with parent but NO side:', data?.length);
  if (data && data.length > 0) {
    console.log('Sample nodes:', data.slice(0, 5));
  }
}
check();
