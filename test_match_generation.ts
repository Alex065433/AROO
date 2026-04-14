
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  // 1. Find a user with a parent
  const { data: users } = await supabase.from('profiles').select('id, parent_id, side, left_business, right_business').not('parent_id', 'is', null).limit(10);
  if (!users || users.length === 0) {
    console.log('No users with parents found');
    return;
  }

  const user = users[0];
  console.log('Testing for user:', user.id, 'Parent:', user.parent_id);
  
  const startTime = new Date().toISOString();
  
  // 2. Trigger matching upline
  console.log('Calling process_matching_upline...');
  const { error } = await supabase.rpc('process_matching_upline', { 
    start_user_id: user.id,
    trigger_user_id: user.id 
  });
  
  if (error) {
    console.error('RPC Error:', error);
    return;
  }

  // 3. Check for new transactions
  const { data: txs } = await supabase
    .from('transactions')
    .select('*')
    .gt('created_at', startTime);
    
  console.log('New transactions:', txs?.length);
  if (txs) {
    txs.forEach(t => console.log(`- ${t.description}: ${t.amount}`));
  }
}
test();
