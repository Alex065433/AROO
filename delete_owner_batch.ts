import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const { data, error } = await supabase.from('profiles').select('id').eq('email', 'kethankumar130@gmail.com');
  if (error) {
    console.error('Error fetching:', error.message);
    return;
  }
  if (!data) return;
  for (const profile of data) {
    const randomId = `ARW-REMOVED-${Math.floor(100000 + Math.random() * 899999)}`;
    const { error: updateError } = await supabase.from('profiles').update({ 
      email: `removed-${profile.id.substring(0, 8)}@arowin.internal`,
      operator_id: randomId,
      full_name: 'REMOVED USER',
      status: 'blocked'
    }).eq('id', profile.id);
    if (updateError) {
      console.error(`Error updating ${profile.id}:`, updateError.message);
    } else {
      console.log(`Updated profile ${profile.id} to ${randomId}`);
    }
  }
}
run();
