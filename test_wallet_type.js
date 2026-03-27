import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
  const uid = profiles[0].id;
  
  const res1 = await supabase.from('payments').insert({ user_id: uid, amount: 0, type: 'test', wallet_type: 'master' }).select();
  console.log("Insert with wallet_type:", res1.error ? res1.error.message : "Success");
}
check();
