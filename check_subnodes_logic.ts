
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const operatorId = 'ARW-123456'; // Example
  const uid = '38c04bee-44d5-4ea1-bf64-36ee6f7eaa93'; // Example
  
  const { data: existingProfiles, error } = await supabase
    .from('profiles')
    .select('id, operator_id')
    .like('operator_id', `${operatorId}%`)
    .eq('sponsor_id', uid)
    .order('operator_id', { ascending: true });
    
  console.log('Error:', error);
  console.log('Existing Profiles:', existingProfiles);
}

check();
