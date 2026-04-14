
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { error } = await supabase.from('purchases').insert({
    user_id: '00000000-0000-0000-0000-000000000001',
    sponsor_id: '00000000-0000-0000-0000-000000000001',
    side: 'LEFT',
    package_amount: 100
  });
  console.log('Insert result:', error);
}
test();
