
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_SERVICE_KEY!);

const email = process.argv[2];

async function findProfile() {
  const { data, error } = await supabase.from('profiles').select('*').eq('email', email).maybeSingle();
  if (error) console.error(error.message);
  else console.log('Profile:', data);
}

findProfile();
