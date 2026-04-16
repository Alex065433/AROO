
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function applySql() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase env vars");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const sql = fs.readFileSync('mlm_unified_system.sql', 'utf8');

  console.log("Applying mlm_unified_system.sql...");
  
  // We can't run raw SQL via the client easily unless we have an RPC for it.
  // I'll try to use the 'exec_sql' RPC if it exists, or just tell the user to apply it.
  // Actually, I can try to use the 'admin-query' endpoint if I can make it run raw SQL.
  // But the admin-query endpoint only supports select/insert/update/delete.
  
  console.log("Please ensure you have applied 'mlm_unified_system.sql' in the Supabase SQL Editor.");
  console.log("I will check if the 'purchases' table exists.");
  
  const { error } = await supabase.from('purchases').select('id').limit(1);
  if (error) {
    console.error("Purchases table error:", error.message);
  } else {
    console.log("Purchases table exists.");
  }
}

applySql();
