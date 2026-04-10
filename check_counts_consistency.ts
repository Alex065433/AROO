
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: parents, error } = await supabase
    .from('profiles')
    .select('id, operator_id, left_count, right_count');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  for (const parent of parents || []) {
    if (Number(parent.left_count) > 0) {
      const { data: leftChild } = await supabase
        .from('profiles')
        .select('id')
        .eq('parent_id', parent.id)
        .eq('side', 'LEFT')
        .limit(1);
      
      if (!leftChild || leftChild.length === 0) {
        console.log(`Parent ${parent.operator_id} has left_count=${parent.left_count} but NO child with side=LEFT`);
      }
    }
    
    if (Number(parent.right_count) > 0) {
      const { data: rightChild } = await supabase
        .from('profiles')
        .select('id')
        .eq('parent_id', parent.id)
        .eq('side', 'RIGHT')
        .limit(1);
      
      if (!rightChild || rightChild.length === 0) {
        console.log(`Parent ${parent.operator_id} has right_count=${parent.right_count} but NO child with side=RIGHT`);
      }
    }
  }
}
check();
