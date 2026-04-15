
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function runSql() {
  const sql = fs.readFileSync('./mlm_unified_system.sql', 'utf8');
  console.log('Executing SQL from mlm_unified_system.sql...');
  const { data, error } = await supabase.rpc('admin_execute_sql_rpc', { p_sql: sql });
  if (error) {
    console.error('Error executing SQL:', error);
    console.log('If the RPC does not exist, please copy the content of mlm_unified_system.sql and run it in the Supabase SQL Editor.');
    return;
  }
  console.log('Success:', data);
}

runSql();
