
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sql = fs.readFileSync('create_mlm_rpcs.sql', 'utf8');
  const { data, error } = await supabase.rpc('admin_execute_sql_rpc', { p_sql: sql });
  console.log('Result:', data, error);
}
run();
