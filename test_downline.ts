
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testDownline() {
  // Get the first user (root)
  const { data: root } = await supabase.from('profiles').select('id, operator_id').order('created_at', { ascending: true }).limit(1).single();
  if (!root) return;

  console.log(`Root: ${root.operator_id} (${root.id})`);

  const { data: downline, error } = await supabase.rpc('get_binary_downline', { root_id: root.id });
  if (error) {
    console.error("RPC Error:", error);
    return;
  }

  console.log(`RPC returned ${downline.length} nodes.`);

  const { count: totalProfiles } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  console.log(`Total profiles in DB: ${totalProfiles}`);
}
testDownline();
