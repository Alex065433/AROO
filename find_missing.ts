
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function findMissing() {
  const { data: root } = await supabase.from('profiles').select('id, operator_id').order('created_at', { ascending: true }).limit(1).single();
  const { data: downline } = await supabase.rpc('get_binary_downline', { root_id: root.id });
  const downlineIds = new Set(downline.map(p => p.id));

  const { data: allProfiles } = await supabase.from('profiles').select('id, operator_id, parent_id, side');
  const missing = allProfiles.filter(p => !downlineIds.has(p.id));

  console.log(`Found ${missing.length} missing profiles.`);
  console.log(missing);
}
findMissing();
