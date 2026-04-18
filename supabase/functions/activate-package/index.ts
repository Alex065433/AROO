
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2. Extract and Verify JWT Token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Authentication REQUIRED: No Authorization Token provided.');
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error(`Authentication FAILED: ${authError?.message || 'Invalid Session Credentials'}`);
    }

    // 3. Parse Request Payload
    const { packageId, amount, targetUserId } = await req.json();
    if (!amount || amount <= 0) throw new Error('Invalid Transaction: Package amount must be positive.');

    // 4. Resolve Target UID (Default to self)
    let finalTargetUid = user.id;
    if (targetUserId && targetUserId !== user.id) {
       // Check if caller is admin
       const { data: callerProfile } = await supabaseAdmin
         .from('profiles')
         .select('role')
         .eq('id', user.id)
         .single();
         
       if (callerProfile?.role !== 'admin') {
          throw new Error('Unauthorized ACCESS: Only administrators can activate packages for other nodes.');
       }
       finalTargetUid = targetUserId;
    }

    console.log(`[CORE] Activating package for target: ${finalTargetUid}, Amount: ${amount}`);

    // 5. Atomic Execution Logic
    // Fetch Current Profile Data
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('wallet_balance, wallets, sponsor_id, operator_id')
      .eq('id', finalTargetUid)
      .single();

    if (profileError || !profile) throw new Error('System Error: Target node signature not found.');

    const currentBalance = Number(profile.wallet_balance || (profile.wallets?.master?.balance || 0));
    
    // Safety: If admin is doing it, we might skip balance check for "Free Activation", 
    // but the prompt says "Deduct the package amount", so we follow that.
    if (currentBalance < amount) {
      throw new Error(`Transaction REJECTED: Insufficient liquidity in node wallet. Required: ${amount}, Current: ${currentBalance}`);
    }

    const newBalance = currentBalance - amount;

    // A. Deduct Balances from Target Profile
    const { error: withdrawalError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        wallet_balance: newBalance,
        is_active: true,
        status: 'active',
        active_package: amount,
        package_amount: amount,
        activated_at: new Date().toISOString(),
        wallets: {
           ...profile.wallets,
           master: { ...profile.wallets?.master, balance: newBalance }
        }
      })
      .eq('id', finalTargetUid);

    if (withdrawalError) throw new Error(`Ledger Update FAILED: ${withdrawalError.message}`);

    // B. Synchronize to MLM Core members table
    const { error: memberError } = await supabaseAdmin
      .from('members')
      .upsert({
        id: finalTargetUid,
        is_active: true,
        total_investment: amount,
        sponsor_id: profile.sponsor_id
      }, { onConflict: 'id' });

    if (memberError) console.error(`[CRITICAL] Member sync failed: ${memberError.message}`);

    // B.1 Trigger Binary Matching Engine (Async/Background)
    const matchingUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/matching-engine`;
    fetch(matchingUrl, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
       },
       body: JSON.stringify({ userId: finalTargetUid, volume: amount })
    }).catch(err => console.error(`[ASYNC ERROR] Matching engine trigger failed: ${err.message}`));

    // C. Distribute 5% Direct Referral Bonus to Sponsor
    if (profile.sponsor_id) {
       const referralBonus = amount * 0.05;
       
       const { data: sponsor, error: sponsorError } = await supabaseAdmin
         .from('profiles')
         .select('wallet_balance, wallets, total_income, operator_id')
         .eq('id', profile.sponsor_id)
         .single();

       if (!sponsorError && sponsor) {
          const sponsorNewBalance = (Number(sponsor.wallet_balance) || 0) + referralBonus;
          const sponsorNewTotal = (Number(sponsor.total_income) || 0) + referralBonus;
          
          const updatedWallets = { ...sponsor.wallets };
          if (updatedWallets.master) {
             updatedWallets.master.balance = sponsorNewBalance;
          }

          await supabaseAdmin
            .from('profiles')
            .update({
               wallet_balance: sponsorNewBalance,
               total_income: sponsorNewTotal,
               wallets: updatedWallets
            })
            .eq('id', profile.sponsor_id);

          await supabaseAdmin.from('transactions').insert({
             user_id: profile.sponsor_id,
             uid: profile.sponsor_id,
             amount: referralBonus,
             type: 'referral',
             description: `Direct Referral Dividend from activation of ${profile.operator_id}`,
             status: 'completed'
          });
       }
    }

    // D. Log Debit Transaction for Target Node
    await supabaseAdmin.from('transactions').insert({
       user_id: finalTargetUid,
       uid: finalTargetUid,
       amount: -amount,
       type: 'package_activation',
       description: `Arowin Node Activation: ${packageId || 'Node ' + amount}`,
       status: 'completed'
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Protocol Synchronization Successful. Node activated.',
        new_balance: newBalance
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('[FATAL] Package Activation Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
