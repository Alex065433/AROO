
import dotenv from 'dotenv';
dotenv.config();
console.log('VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL);
console.log('VITE_SUPABASE_SERVICE_KEY set:', !!process.env.VITE_SUPABASE_SERVICE_KEY);
