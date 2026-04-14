
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const rpcs = [
    { name: 'admin_execute_sql_rpc', param: 'p_sql' },
    { name: 'exec_sql', param: 'sql' },
    { name: 'execute_sql', param: 'sql' },
    { name: 'run_sql', param: 'sql' }
  ];
  
  const sql = `DROP TRIGGER IF EXISTS pair_income_trigger ON profiles;`;
  
  for (const rpc of rpcs) {
    console.log(`Trying ${rpc.name}...`);
    const { data, error } = await supabase.rpc(rpc.name, { [rpc.param]: sql });
    if (!error) {
      console.log(`Success with ${rpc.name}!`);
      return;
    }
    console.log(`${rpc.name} failed: ${error.message}`);
  }
}
run();
