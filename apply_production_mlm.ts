
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!, 
    process.env.VITE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function runSql() {
  const sql = fs.readFileSync('./production_mlm.sql', 'utf8');
  console.log('Executing SQL from production_mlm.sql...');
  
  // Try calling the execute rpc if it exists
  const { data, error } = await supabase.rpc('admin_execute_sql_rpc', { p_sql: sql });
  
  if (error) {
    console.error('Error executing SQL via RPC:', error.message);
    console.log('Attempting alternative method...');
    // If RPC fails, we might need a different approach or inform the user
  } else {
    console.log('Success:', data);
  }
}

runSql();
