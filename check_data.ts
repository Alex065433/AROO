
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function checkData() {
  const { data, error } = await supabase
    .from('team_collection')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('Error:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('Sample row from team_collection:', data[0]);
  } else {
    console.log('team_collection is empty');
  }
}

checkData();
