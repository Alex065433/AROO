import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
  try {
    const { data, error } = await supabase.rpc('get_policies', { table_name: 'profiles' });
    console.log('Policies for profiles:', data, error);
  } catch (err) {
    console.error('Failed to get policies:', err);
  }
}

run();
