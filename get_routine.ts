import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const response = await fetch('http://localhost:3000/api/admin-query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer CORE_SECURE_999'
    },
    body: JSON.stringify({
      table: 'information_schema.routines',
      operation: 'select',
      data: 'routine_name, routine_definition',
      match: { routine_name: 'find_binary_parent_extreme' }
    })
  });
  
  const data = await response.json();
  console.log(data);
}
run();
