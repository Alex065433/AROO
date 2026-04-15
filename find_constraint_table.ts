
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function findConstraint() {
  const { data, error } = await supabase.rpc('get_schema_info');
  if (error) {
    console.error('Error getting schema info:', error);
    return;
  }

  // The get_schema_info might return tables and their constraints if it's a custom RPC
  // Let's try to find it in the output
  console.log('Searching for unique_income_pair in schema info...');
  
  // If get_schema_info doesn't have it, we'll try to use admin-query to query information_schema
  const response = await fetch('http://localhost:3000/api/admin-query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer CORE_SECURE_999'
    },
    body: JSON.stringify({
      table: 'information_schema.table_constraints',
      operation: 'select',
      data: 'table_name, constraint_name',
      match: { constraint_name: 'unique_income_pair' }
    })
  });
  
  const constraintData = await response.json();
  console.log('Constraint Location:', constraintData);
}

findConstraint();
