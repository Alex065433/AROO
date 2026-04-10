
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function testInsert() {
  const randomId = '00000000-0000-0000-0000-' + Math.floor(Math.random() * 1000000000000).toString().padStart(12, '0');
  const { data, error } = await supabase.from('profiles').insert({
    id: randomId,
    email: 'test-subnode@arowin.internal',
    operator_id: 'TEST-SUB-01',
    name: 'Test Subnode',
    status: 'active'
  });
  
  if (error) {
    console.error('Insert failed:', error.message);
  } else {
    console.log('Insert successful:', data);
    // Cleanup
    await supabase.from('profiles').delete().eq('id', randomId);
  }
}

testInsert();
