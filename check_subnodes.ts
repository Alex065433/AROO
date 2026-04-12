
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSubNodes() {
  const { data: profiles, error } = await supabase.from('profiles').select('id, operator_id, parent_id');
  if (error) {
    console.error(error);
    return;
  }

  const subNodes = profiles.filter(p => p.operator_id.includes('-0'));
  console.log(`Found ${subNodes.length} sub-nodes in profiles.`);
  console.log(subNodes.slice(0, 5));
}
checkSubNodes();
