
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function listConstraints() {
  const response = await fetch(`${process.env.APP_URL || 'http://127.0.0.1:3000'}/api/admin-query`, {
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
  
  const data = await response.json();
  console.log('Constraint info:', data);
}
listConstraints();
