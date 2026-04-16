
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkSql() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase env vars");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log("Checking for 'process_purchase_mlm' function in pg_proc...");
  
  const { data, error } = await supabase
    .from('pg_proc')
    .select('proname')
    .ilike('proname', '%process_purchase_mlm%');
  
  if (error) {
    console.error("Error checking pg_proc:", error.message);
    // Try checking if we can call it
    console.log("Attempting to check if function is callable...");
  } else {
    console.log("Functions found:", data);
  }

  console.log("Checking for triggers on 'purchases' table...");
  const { data: triggers, error: triggerErr } = await supabase
    .from('pg_trigger')
    .select('tgname')
    .match({ tgenabled: 'O' }); // 'O' means enabled
    
  if (triggerErr) {
    console.error("Error checking pg_trigger:", triggerErr.message);
  } else {
    console.log("Triggers found:", triggers?.filter(t => t.tgname.includes('mlm')));
  }
}

checkSql();
