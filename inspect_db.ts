
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function inspectDb() {
  const { data: profiles } = await supabaseAdmin.from('profiles').select('id').limit(1);
  const userId = profiles![0].id;
  console.log('Testing income_logs for unique_income_pair constraint with userId:', userId);
  
  const dummyData = {
    node_id: userId,
    user_id: userId,
    amount: 10,
    type: 'matching',
    source_node: '00000000-0000-0000-0000-000000000002'
  };

  const { error: err1 } = await supabaseAdmin.from('income_logs').insert(dummyData);
  if (err1) {
    console.log('First insert error:', err1.message);
  } else {
    console.log('First insert success');
    const { error: err2 } = await supabaseAdmin.from('income_logs').insert(dummyData);
    if (err2) {
      console.log('Second insert error (potential constraint):', err2.message);
    } else {
      console.log('Second insert also success');
    }
    // Cleanup
    await supabaseAdmin.from('income_logs').delete().match(dummyData);
  }
}
inspectDb();
