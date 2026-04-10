
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.rpc('get_schema_info');
  if (data && data.functions) {
     console.log('Functions:', data.functions.filter((f: any) => f.name.toLowerCase().includes('sql')));
  } else {
     console.log('No functions found in schema info');
  }
}
check();
