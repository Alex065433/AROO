import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.12.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. SECURE AUTHENTICATION
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Invalid Session: Missing Auth Header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) throw new Error("Invalid Session: Token Expired or Invalid");
    const userId = user.id;

    const { amount, packageId } = await req.json();

    if (!amount || amount < 50 || amount % 50 !== 0) throw new Error("Invalid activation amount.");

    // 2. FETCH USER PROFILE & WALLET INFRASTRUCTURE
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('operator_id, sponsor_id, wallet_balance, wallets, parent_id')
      .eq('id', userId)
      .single();

    if (profileErr || !profile) {
      throw new Error("Profile not found.");
    }

    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from('user_wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!wallet) {
      throw new Error("Wallet infrastructure not found.");
    }

    const currentMasterVault = Number(wallet.master_vault || 0);
    
    if (currentMasterVault < amount) {
      throw new Error("Insufficient funds in Master Vault.");
    }

    // 3. MATHEMATICAL MODEL CALCULATIONS
    const total_ids = amount / 50;
    const virtualCount = total_ids - 1;
    const instant_referral = virtualCount * 2.50;
    const instant_matching = Math.floor(virtualCount / 2) * 5.00;

    // 4. ATOMIC DEDUCTION & MASTER PROFILE UPDATE
    const newUserBalance = currentMasterVault - amount;
    
    const { error: dedErr } = await supabaseAdmin.from('user_wallets').update({
        master_vault: newUserBalance,
        last_updated: new Date().toISOString()
    }).eq('user_id', userId);

    if (dedErr) throw new Error(`DEDUCTION_FAILED: ${dedErr.message}`);

    // Sync profiles table balance as well for UI consistency
    await supabaseAdmin.from('profiles').update({
        wallet_balance: newUserBalance,
        status: 'active', 
        is_virtual: false,
        active_package: amount,
        activated_at: new Date().toISOString(),
        is_active: true
    }).eq('id', userId);

    // Log the deduction transaction
    await supabaseAdmin.from('transactions').insert({
      user_id: userId,
      uid: userId,
      amount: -amount,
      type: 'package_activation',
      status: 'completed',
      description: `Package Activation: $${amount}`
    });

    // 5. VIRTUAL NODES PLACEMENT & INSTANT PROFIT DISTRIBUTION
    if (virtualCount > 0) {
        // Generate Virtual Nodes
        for (let i = 1; i <= virtualCount; i++) {
            const vOpId = `${profile.operator_id}-V${i}`;
            const vId = crypto.randomUUID();
            
            await supabaseAdmin.from('profiles').insert({
                id: vId,
                operator_id: vOpId,
                sponsor_id: userId,
                parent_id: null, 
                is_virtual: true,
                status: 'active',
                active_package: 50,
                is_active: true,
                activated_at: new Date().toISOString(),
                wallet_balance: 0,
                wallets: { master: { balance: 0, currency: "USDT" } }
            });

            await supabaseAdmin.from('team_collection').insert({
                uid: userId,
                node_id: vOpId,
                package_amount: 50,
                status: 'active'
            });
        }

        // Atomically Add Instant Profits to Master's boxes
        const { error: profitErr } = await supabaseAdmin.from('user_wallets').update({
            referral_box: (Number(wallet.referral_box) || 0) + instant_referral,
            matching_box: (Number(wallet.matching_box) || 0) + instant_matching,
            last_updated: new Date().toISOString()
        }).eq('user_id', userId);

        if (profitErr) console.error("Error distributing instant profits:", profitErr);

        // Log Instant Profit Transactions
        if (instant_referral > 0) {
            await supabaseAdmin.from('transactions').insert({
                uid: userId,
                user_id: userId,
                amount: instant_referral,
                type: 'DIRECT_REFERRAL',
                description: `Instant Internal Referral Bonus ($2.50 x ${virtualCount} Nodes)`,
                status: 'completed'
            });
        }

        if (instant_matching > 0) {
            await supabaseAdmin.from('transactions').insert({
                uid: userId,
                user_id: userId,
                amount: instant_matching,
                type: 'MATCHING_BONUS',
                description: `Instant Internal Matching Bonus ($5.00 x ${Math.floor(virtualCount/2)} Pairs)`,
                status: 'completed'
            });
        }
    }

    // 6. EXTERNAL SPONSOR COMMISSION (5%) - REFERRAL INCOME
    if (profile.sponsor_id && profile.sponsor_id !== userId) {
        const extCommission = amount * 0.05;
        
        // Update user_wallets.referral_box
        const { data: sponUserWallet } = await supabaseAdmin.from('user_wallets').select('referral_box').eq('user_id', profile.sponsor_id).maybeSingle();
        if (sponUserWallet) {
             await supabaseAdmin.from('user_wallets').update({
                referral_box: (Number(sponUserWallet.referral_box) || 0) + extCommission,
                last_updated: new Date().toISOString()
             }).eq('user_id', profile.sponsor_id);
        }

        await supabaseAdmin.from('transactions').insert({
            uid: profile.sponsor_id,
            user_id: profile.sponsor_id,
            amount: extCommission,
            type: 'DIRECT_REFERRAL',
            description: `Direct Referral Reward from ${profile.operator_id} Activation`,
            status: 'completed'
        });
    }

    // 7. EXTERNAL MATCHING INCOME (TREE TRAVERSAL UPWARD)
    let currentParentId = profile.parent_id; 
    let level = 1;
    const maxLevels = 50; 
    
    while (currentParentId && level <= maxLevels) {
        const matchingAmount = amount * 0.01; // Example: 1% per upline
        
        const { data: uplineProf } = await supabaseAdmin
            .from('profiles')
            .select('id, parent_id')
            .eq('id', currentParentId)
            .maybeSingle();

        if (!uplineProf) break;
        
        const { data: uplineWallet } = await supabaseAdmin.from('user_wallets').select('matching_box').eq('user_id', uplineProf.id).maybeSingle();
        if (uplineWallet) {
             await supabaseAdmin.from('user_wallets').update({
                 matching_box: (Number(uplineWallet.matching_box) || 0) + matchingAmount,
                 last_updated: new Date().toISOString()
             }).eq('user_id', uplineProf.id);
        }

        await supabaseAdmin.from('transactions').insert({
            uid: uplineProf.id,
            user_id: uplineProf.id,
            amount: matchingAmount,
            type: 'MATCHING_BONUS',
            description: `Network Matching Bonus from House ${profile.operator_id} (Level ${level})`,
            status: 'completed'
        });

        currentParentId = uplineProf.parent_id;
        level++;
    }

    return new Response(JSON.stringify({ 
        success: true,
        message: "Activation Complete. Welcome to Arowin Network." 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("[EDGE_FUNCTION_ACTIVATE]", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
