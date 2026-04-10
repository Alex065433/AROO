
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: root } = await supabase
    .from('profiles')
    .select('id')
    .eq('operator_id', 'ARW-123456')
    .single();
  
  if (!root) return;
  
  const { data, error } = await supabase.rpc('get_binary_downline', { root_id: root.id });
  console.log('RPC result count:', data?.length, error);
  if (data) {
    console.log('Nodes:', data.map((n: any) => ({ id: n.operator_id, parent: n.parent_id, side: n.side })));
  }
}
check();
