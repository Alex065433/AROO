import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupAdmin() {
  console.log('--- Arowin Admin Security Protocol ---');
  
  const adminEmail = 'admin@arowintrading.com';
  const adminPassword = 'ARW_Secure_2026_#' + Math.floor(1000 + Math.random() * 9000);
  const operatorId = 'ARW-ADMIN-01';

  console.log(`Setting up Admin: ${adminEmail}`);

  try {
    // 1. Create or Reset Auth User
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { role: 'admin', operator_id: operatorId }
    });

    if (authErr) {
      if (authErr.message.includes('already registered')) {
        console.log('Admin already exists. Resetting password...');
        // Find user by email
        const { data: users } = await supabase.auth.admin.listUsers();
        const existing = (users.users as any[]).find(u => u.email === adminEmail);
        if (existing) {
          await supabase.auth.admin.updateUserById(existing.id, { password: adminPassword });
        }
      } else {
        throw authErr;
      }
    }

    const { data: uData } = await supabase.auth.admin.listUsers();
    const finalUser = (uData.users as any[]).find(u => u.email === adminEmail);
    
    if (finalUser) {
      // 2. Sync Profile
      await supabase.from('profiles').upsert({
        id: finalUser.id,
        email: adminEmail,
        operator_id: operatorId,
        name: 'System Root Admin',
        role: 'admin',
        status: 'active'
      });

      // 3. Setup Wallet
      await supabase.from('user_wallets').upsert({
        user_id: finalUser.id,
        master_vault: 1000000 // Admin has initial liquidity
      });

      console.log('SUCCESS: Admin deployed.');
      console.log('-----------------------------------');
      console.log(`EMAIL: ${adminEmail}`);
      console.log(`PASSWORD: ${adminPassword}`);
      console.log(`OPERATOR ID: ${operatorId}`);
      console.log('-----------------------------------');
      console.log('IMPORTANT: Save these credentials safely.');
    }

  } catch (err) {
    console.error('CRITICAL FAILURE during admin setup:', err);
  }
}

setupAdmin();
