
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: parent } = await supabase
    .from('profiles')
    .select('id')
    .eq('operator_id', 'ARW-123456')
    .single();
  
  if (!parent) return;
  
  const { data: children } = await supabase
    .from('profiles')
    .select('operator_id, side, parent_id')
    .eq('parent_id', parent.id);
  
  console.log('Children of ARW-123456:', children);
}
check();
