
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function runSql(sql: string) {
  const { data, error } = await supabase.rpc('admin_execute_sql_rpc', { p_sql: sql });
  if (error) {
    console.error('Error:', error);
    return;
  }
  console.log('Success:', data);
}

runSql(`
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS main_user_id UUID;
ALTER TABLE team_collection ADD COLUMN IF NOT EXISTS uid UUID;
`);
