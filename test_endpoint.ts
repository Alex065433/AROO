
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const url = 'https://jhlxehnwnlzftoylancq.supabase.co/functions/v1/create-payment';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
  
  console.log(`Testing URL: ${url}`);
  console.log(`Using Anon Key: ${anonKey ? 'Present' : 'Missing'}`);
  
  try {
    const response = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        'apikey': anonKey,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization, x-client-info, apikey, content-type',
        'Origin': 'http://localhost:3000'
      }
    });
    
    console.log(`Status: ${response.status}`);
    console.log(`Headers:`, Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const getResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': anonKey,
          'x-client-info': 'arowin-web-client'
        }
      });
      console.log(`GET Status: ${getResponse.status}`);
      const data = await getResponse.json();
      console.log(`GET Data:`, data);
    }
  } catch (error: any) {
    console.error(`Fetch failed:`, error.message);
  }
}

test();
