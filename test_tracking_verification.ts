
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testTracking() {
  // 1. Get root
  const { data: root } = await supabase.from('profiles').select('id, operator_id, wallets').order('created_at', { ascending: true }).limit(1).single();
  console.log(`Root: ${root.operator_id}, Left Last: ${root.wallets?.tree_meta?.left_last_id}`);

  // 2. Find extreme left
  let currentId = root.id;
  while (true) {
    const { data: child } = await supabase.from('profiles').select('id').eq('parent_id', currentId).eq('side', 'LEFT').single();
    if (!child) break;
    currentId = child.id;
  }
  console.log(`Calculated Extreme Left: ${currentId}`);
  
  if (root.wallets?.tree_meta?.left_last_id === currentId) {
    console.log("✅ Tracking matches extreme traversal!");
  } else {
    console.log("❌ Tracking mismatch!");
  }
}
testTracking();
