import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
async function check() {
  const { data, error } = await supabase.from('profiles').select('id, sponsor_id, active_package').gt('active_package', 0);
  if (error) {
    console.log(error.message);
  } else {
    for (const user of data || []) {
      if (user.sponsor_id) {
        const { data: sponsor } = await supabase.from('profiles').select('id').eq('id', user.sponsor_id).single();
        console.log(`User ${user.id} (Package ${user.active_package}) has Sponsor ${user.sponsor_id}. Sponsor exists: ${!!sponsor}`);
      } else {
        console.log(`User ${user.id} has no sponsor`);
      }
    }
  }
}
check();
