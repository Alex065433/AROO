
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sql = fs.readFileSync('fix_mlm_v2.sql', 'utf8');
  // We'll try to use a direct query if possible, or an RPC if we have one.
  // Since we don't have a reliable exec_sql RPC, I'll try to use the admin_execute_sql_rpc if it exists.
  
  const { data, error } = await supabase.rpc('admin_execute_sql_rpc', { p_sql: sql });
  console.log('Result:', data, error);
}
run();
