import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql_string: `
      ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_parent_id_side_key;
      DROP INDEX IF EXISTS idx_unique_binary_placement;
      ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS unique_binary_position;
    `
  });
  console.log('Result:', data, error);
}
run();
