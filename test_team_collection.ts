
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function checkColumns() {
  const { data, error } = await supabase
    .from('team_collection')
    .select('*')
    .limit(0);
  
  if (error) {
    console.error('Error:', error);
    return;
  }

  // This is a trick to get column names if the table exists
  // But select * limit 0 might not return columns in some drivers.
  // I'll try to insert a dummy row and see what happens.
}

async function tryInsert() {
    const { error } = await supabase.from('team_collection').insert({
        uid: '00000000-0000-0000-0000-000000000000',
        node_id: 'TEST-NODE',
        name: 'Test Node',
        balance: 0,
        eligible: true
    });
    if (error) {
        console.log('Insert failed:', error.message);
        if (error.message.includes('column "uid" of relation "team_collection" does not exist')) {
            console.log('Column "uid" is missing!');
        }
    } else {
        console.log('Insert successful! Column "uid" exists.');
    }
}

tryInsert();
