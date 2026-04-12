
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applySqlFile(filePath: string) {
  console.log(`Applying ${filePath}...`);
  const sql = fs.readFileSync(path.resolve(filePath), 'utf8');
  
  // Try different RPC names with their expected parameter names
  const rpcConfigs = [
    { name: 'admin_execute_sql_rpc', param: 'p_sql' },
    { name: 'exec_sql', param: 'sql' },
    { name: 'execute_sql', param: 'sql' }
  ];
  let success = false;

  for (const config of rpcConfigs) {
    console.log(`Trying RPC: ${config.name}...`);
    const { data, error } = await supabase.rpc(config.name, { [config.param]: sql });
    
    if (!error) {
      console.log(`Successfully applied ${filePath} using ${config.name}`);
      success = true;
      break;
    } else {
      console.log(`${config.name} failed: ${error.message}`);
    }
  }
  
  if (!success) {
    console.log(`Failed to apply ${filePath} using any known RPC. Please apply SQL manually in Supabase SQL Editor.`);
  }
}

async function main() {
  await applySqlFile('update_mlm_logic.sql');
  await applySqlFile('fix_mlm_functions.sql');
}

main().catch(console.error);
