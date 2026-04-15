
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_SERVICE_KEY!);

async function listRpcs() {
  const response = await fetch('http://localhost:3000/api/admin-query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer CORE_SECURE_999'
    },
    body: JSON.stringify({
      table: 'profiles', // Use profiles to get a valid response, then we'll try to guess the constraint table
      operation: 'select',
      data: 'id',
      match: {}
    })
  });
  
  // Actually, let's try to find the constraint by querying ALL tables we know
  const tables = ['profiles', 'team_collection', 'income_logs', 'transactions', 'payments', 'purchases'];
  for (const table of tables) {
    const res = await fetch('http://localhost:3000/api/admin-query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer CORE_SECURE_999'
      },
      body: JSON.stringify({
        table: table,
        operation: 'select',
        data: '*',
        match: {}
      })
    });
    const data = await res.json();
    console.log(`Table ${table} data sample:`, Array.isArray(data) ? data.slice(0, 1) : data);
  }
}
listRpcs();
