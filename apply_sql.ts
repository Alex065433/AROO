import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';

if (!supabaseKey) {
  console.error("VITE_SUPABASE_SERVICE_KEY is missing!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sql = fs.readFileSync('activate_mlm.sql', 'utf8');
  
  // Since we can't easily run raw SQL via supabase-js without a custom RPC,
  // we'll try to use the REST API if possible, or just log that the user needs to run it.
  // Wait, we can use the postgres connection if we have it, but we don't.
  // Let's see if there's an exec_sql rpc.
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    console.log('exec_sql not available, please run the SQL manually in Supabase SQL Editor.');
  } else {
    console.log('SQL executed successfully.');
  }
}

run();
