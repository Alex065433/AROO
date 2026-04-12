
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('admin_query_rpc', {
    p_table: 'information_schema.columns',
    p_action: 'select',
    p_data: {},
    p_query: { table_name: 'transactions' }
  });
  console.log(data?.map((d: any) => d.column_name));
}
run();
