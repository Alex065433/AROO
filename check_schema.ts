
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function checkSchema(tableName: string) {
  const { data, error } = await supabase.rpc('admin_query_rpc', {
    p_table: 'information_schema.columns',
    p_action: 'select',
    p_data: {},
    p_query: { table_name: tableName }
  });
  
  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Columns for ${tableName}:`);
  data.forEach((c: any) => console.log(`${c.column_name} (${c.data_type})`));
}

checkSchema('team_collection');
