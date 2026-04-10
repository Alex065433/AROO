
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('profiles')
    .select('operator_id, side, parent_id')
    .eq('parent_id', '38c04bee-44d5-4ea1-bf64-36ee6f7eaa93');
  
  console.log('Children of ARW-123456:', data);
}
check();
