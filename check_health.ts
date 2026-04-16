async function check() {
  try {
    console.log('Testing local /api/admin-query...');
    const response = await fetch('http://localhost:3000/api/admin-query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer CORE_SECURE_999'
      },
      body: JSON.stringify({
        table: 'profiles',
        operation: 'select',
        data: 'count'
      })
    });
    
    const status = response.status;
    const text = await response.text();
    console.log(`Status: ${status}`);
    console.log(`Response: ${text.substring(0, 200)}`);
  } catch (error) {
    console.error('Fetch failed:', error);
  }
}

check();
