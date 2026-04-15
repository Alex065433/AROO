
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const url = 'http://localhost:3000/api/admin-query';
  const token = 'CORE_SECURE_999';
  
  console.log(`Testing URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        table: 'profiles',
        operation: 'select',
        data: 'id',
        match: {}
      })
    });
    
    console.log(`Status: ${response.status}`);
    const text = await response.text();
    console.log(`Response: ${text.substring(0, 500)}`);
    
    if (response.ok) {
      const data = JSON.parse(text);
      console.log(`Data count: ${data.length}`);
    }
  } catch (error: any) {
    console.error(`Fetch failed:`, error.message);
  }
}

test();
