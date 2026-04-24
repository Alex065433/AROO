
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_SERVICE_KEY!);

const parentId = '10d2b6b0-a4b9-43e8-a5ca-4545b12916d9';

async function checkChildren() {
  const { data, error } = await supabase.from('profiles').select('id, name, side, position, parent_id, is_virtual').eq('parent_id', parentId);
  if (error) console.error(error.message);
  else console.log('Children:', data);
}

checkChildren();
