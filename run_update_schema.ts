
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sql = fs.readFileSync('update_schema.sql', 'utf8');
  
  // Try exec_sql
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    console.log('exec_sql failed:', error.message);
    
    // Try admin_execute_sql_rpc
    const { data: data2, error: error2 } = await supabase.rpc('admin_execute_sql_rpc', { p_sql: sql });
    if (error2) {
        console.log('admin_execute_sql_rpc failed:', error2.message);
    } else {
        console.log('admin_execute_sql_rpc success!');
    }
  } else {
    console.log('exec_sql success!');
  }
}

run();
