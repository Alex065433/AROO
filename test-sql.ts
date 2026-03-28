import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const testUid = '94eff062-4bea-45fd-81ed-65a269551341'; // ARW-756553
  const testOperatorId = 'ARW-756553';
  
  console.log(`Attempting to insert node for ${testOperatorId} into team_collection...`);
  const nodeToCreate = {
    uid: testUid,
    node_id: `${testOperatorId}-R1`,
    name: `Lord Rank Node 1`,
    balance: 0,
    eligible: true
  };

  const { data, error } = await supabase.from('team_collection').insert(nodeToCreate).select();
  
  if (error) {
    console.error('Error inserting node:', error);
  } else {
    console.log('Node inserted successfully:', data);
  }
}
test();
