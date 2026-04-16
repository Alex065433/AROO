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
      table: 'information_schema.table_constraints',
      operation: 'select',
      data: 'table_name, constraint_name',
      match: { table_name: 'profiles' }
    })
  });
  
  const data = await response.json();
  console.log(data);
}
run();
