import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const res = await fetch(`${supabaseUrl}/rest/v1/payments?limit=1`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  const data = await res.json();
  console.log("Payments columns:", data.length > 0 ? Object.keys(data[0]) : "No rows, can't see columns easily");
  
  if (data.length === 0) {
    // try to insert a dummy row to get the error message
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/payments`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ amount: 0, type: 'test' })
    });
    const insertData = await insertRes.json();
    console.log("Insert error:", insertData);
  }
}
check();
