
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_SERVICE_KEY!);

const rootId = '10d2b6b0-a4b9-43e8-a5ca-4545b12916d9';

async function testRpc() {
  const { data, error } = await supabase.rpc('get_binary_downline', { root_id: rootId });
  if (error) console.error('RPC Error:', error.message);
  else {
    console.log('Downline size:', data?.length);
    console.log('Sample node:', data?.[0]);
  }
}

testRpc();
