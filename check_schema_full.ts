
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.rpc('get_schema_info');
  if (error) {
    console.log('Error:', error);
    return;
  }
  if (!data) {
    console.log('No data');
    return;
  }
  console.log('Tables:', data.tables?.map((t: any) => t.table_name));
  console.log('Functions:', data.functions?.map((f: any) => f.name));
  const hasRanks = data.functions?.some((f: any) => f.name === 'update_user_ranks');
  console.log('Has update_user_ranks:', hasRanks);
  console.log('Triggers:', data.triggers?.map((t: any) => ({ table: t.event_object_table, name: t.trigger, action: t.action_statement })));
}
check();
