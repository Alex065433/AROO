
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.rpc('admin_execute_sql_rpc', { 
    p_sql: `
      SELECT conname, relname 
      FROM pg_constraint c 
      JOIN pg_class r ON r.oid = c.conrelid 
      WHERE conname = 'unique_income_pair';
    ` 
  });
  console.log('Constraint info:', data, error);
}
check();
