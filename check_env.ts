
console.log(JSON.stringify(Object.keys(process.env).filter(k => k.includes('SUPABASE')), null, 2));
