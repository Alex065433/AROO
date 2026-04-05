import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
if (!supabaseKey) {
  console.error("VITE_SUPABASE_SERVICE_KEY is missing!");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
async function run() {
  const email = 'admin@arowin.internal';
  const password = 'ArowinAdmin2024!';
  
  // Create user in Auth
  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  
  if (userError) {
    console.log('User creation error:', userError.message);
    // Try to find the user anyway
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
    const user = (listData?.users as any[])?.find(u => u.email === email);
    if (user) {
      console.log('Found existing user in Auth:', user.id);
      await createProfile(user.id);
    } else {
      console.error('Could not find user in Auth after creation error.');
    }
  } else if (userData.user) {
    console.log('User created in Auth:', userData.user.id);
    await createProfile(userData.user.id);
  }
}

async function createProfile(userId: string) {
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    email: 'admin@arowin.internal',
    operator_id: 'ARW-ADMIN-01',
    role: 'admin',
    status: 'active',
    full_name: 'System Administrator'
  });
  
  if (profileError) {
    console.error('Error creating profile:', profileError.message);
  } else {
    console.log('Admin profile created/updated successfully.');
  }
}

run();
