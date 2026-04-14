
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/admin-query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer CORE_SECURE_999`,
    },
    body: JSON.stringify({
      table: 'table_constraints',
      operation: 'select',
      match: { constraint_name: 'unique_income_pair' }
    }),
  }).then(res => res.json());
  
  console.log('Constraint info:', data || error);
}
// check(); // This might not work if table_constraints is in information_schema and from() only works for public
