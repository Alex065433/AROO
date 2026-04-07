import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase with service_role key to bypass RLS
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

router.post('/', async (req, res) => {
  const { uid, packageAmount, isFree } = req.body;
  const authToken = req.headers['x-auth-token'];

  if (authToken !== 'CORE_SECURE_999') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Get user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single();

    if (profileError || !profile) throw new Error('User profile not found');

    // 2. Check and deduct balance if not free
    if (packageAmount > 0 && !isFree) {
      const masterBalance = Number(profile.wallet_balance ?? profile.deposit_wallet ?? (profile.wallets?.master?.balance || 0));
      if (masterBalance < packageAmount) {
        throw new Error(`Insufficient balance. Required: ${packageAmount} USDT, Available: ${masterBalance} USDT`);
      }

      const newBalance = Math.max(0, masterBalance - packageAmount);
      const newWallets = { ...profile.wallets };
      if (newWallets.master) {
        newWallets.master.balance = newBalance;
      }

      const { error: balanceError } = await supabaseAdmin
        .from('profiles')
        .update({ 
          wallets: newWallets,
          wallet_balance: newBalance,
          deposit_wallet: newBalance
        })
        .eq('id', uid);
      
      if (balanceError) throw balanceError;
    }

    // 3. Update active_package and total_deposit
    const isFirstActivation = !profile.active_package || profile.active_package === 0;
    const { error: packageUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        active_package: packageAmount, 
        total_deposit: (Number(profile.total_deposit) || 0) + packageAmount,
        status: 'active'
      })
      .eq('id', uid);

    if (packageUpdateError) throw packageUpdateError;

    // 4. Referral Bonus (5% of total package price to sponsor)
    if (profile.sponsor_id && packageAmount > 0 && isFirstActivation) {
      const referralBonus = packageAmount * 0.05;
      
      // Get sponsor profile
      const { data: sponsor, error: sponsorError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', profile.sponsor_id)
        .single();

      if (sponsor && !sponsorError) {
        const newSponsorWallets = { ...sponsor.wallets };
        newSponsorWallets.referral = newSponsorWallets.referral || { balance: 0, currency: 'USDT' };
        newSponsorWallets.referral.balance += referralBonus;

        await supabaseAdmin
          .from('profiles')
          .update({
            wallets: newSponsorWallets,
            referral_income: (Number(sponsor.referral_income) || 0) + referralBonus,
            total_income: (Number(sponsor.total_income) || 0) + referralBonus
          })
          .eq('id', profile.sponsor_id);
          
        // Log referral bonus transaction
        await supabaseAdmin.from('transactions').insert({
          uid: profile.sponsor_id,
          amount: referralBonus,
          type: 'referral_bonus',
          description: `Direct Referral Bonus from ${profile.operator_id}`,
          status: 'completed'
        });
      }
    }

    // 5. Update Team Business & Team Size up the tree via RPC
    const { error: rpcError } = await supabaseAdmin.rpc('activate_package', { 
      p_user_id: uid, 
      p_amount: packageAmount 
    });

    if (rpcError) {
      console.error('RPC Error in activate_package:', rpcError);
    }

    // 6. Log activation payment
    await supabaseAdmin.from('payments').insert({
      uid: uid,
      amount: isFree ? 0 : packageAmount,
      type: 'package_activation',
      method: isFree ? 'FREE' : 'WALLET',
      description: `Package Activation: $${packageAmount}${isFree ? ' (FREE)' : ''}`,
      status: 'finished',
      currency: 'usdtbsc'
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Admin Package Activation Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
