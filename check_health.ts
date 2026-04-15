
async function check() {
  try {
    const res = await fetch('http://localhost:3000/api/debug-env', { method: 'POST' });
    console.log('Status:', res.status);
    console.log('Body:', await res.text());
  } catch (e) {
    console.error('Error:', e.message);
  }
}
check();
