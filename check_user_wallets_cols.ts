
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
      table: 'information_schema.columns',
      operation: 'select',
      data: 'column_name, data_type',
      match: { table_name: 'user_wallets' }
    })
  });
  
  const data = await response.json();
  console.log('user_wallets columns:', data);
}
run();
