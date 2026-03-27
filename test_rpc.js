import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.rpc('admin_add_payment_rpc', {
    p_uid: '014ef716-085a-4e56-a774-c11a7d810cbf',
    p_amount: '100',
    p_type: 'deposit'
  });
  console.log("RPC result:", data, error);
}
check();
