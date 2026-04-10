
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: node } = await supabase
    .from('profiles')
    .select('operator_id')
    .eq('id', 'b4c87c25-7e79-44d7-90a5-107705de52bd')
    .single();
  
  console.log('Node b4c87c25-7e79-44d7-90a5-107705de52bd is:', node?.operator_id);
}
check();
