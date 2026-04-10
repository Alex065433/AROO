
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('profiles')
    .select('side')
    .not('side', 'is', null);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  const sides = new Set();
  data?.forEach(p => sides.add(p.side));
  console.log('Unique side values:', Array.from(sides));
}
check();
