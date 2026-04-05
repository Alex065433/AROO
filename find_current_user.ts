import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error('Error:', error.message);
  } else {
    const user = data.users.find(u => u.email === 'kethankumar130@gmail.com');
    if (user) {
      console.log('Found user in Auth:', user.id);
      // Now find the profile
      const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (profile) {
        console.log('Current Profile:', profile);
      } else {
        console.log('Profile not found for this user ID.');
      }
    } else {
      console.log('User not found in Auth.');
    }
  }
}
run();
