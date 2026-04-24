
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_SERVICE_KEY!);

async function checkAbsoluteRoot() {
  const { data, error } = await supabase.from('profiles').select('id, name, is_virtual, parent_id').is('parent_id', null).maybeSingle();
  if (error) console.error(error.message);
  else console.log('Absolute Root:', data);
}

checkAbsoluteRoot();
