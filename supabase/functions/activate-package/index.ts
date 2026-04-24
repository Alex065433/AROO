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

    // 2. FETCH USER PROFILE & ASSERT WALLET INFRASTRUCTURE
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('operator_id, sponsor_id, wallet_balance, wallets, parent_id')
      .eq('id', userId)
      .single();

    if (profileErr || !profile) {
      throw new Error("Wallet infrastructure not found. Profile is missing.");
    }

    let userWalletBalance = Number(profile.wallet_balance || 0);
    
    if (userWalletBalance < amount) {
      throw new Error("Insufficient funds in Master Vault.");
    }

    let userWallets = profile.wallets || {};
    if (typeof userWallets === "string") {
        try { userWallets = JSON.parse(userWallets); } catch(e) { userWallets = {}; }
    }

    // 3. CORE DEDUCTION LOGIC
    userWalletBalance -= amount;
    if (!userWallets.master) userWallets.master = { balance: userWalletBalance, currency: "USDT" };
    else userWallets.master.balance = Number((Number(userWallets.master.balance || 0) - amount).toFixed(2));

    // Calculate virtual nodes and internal commissions beforehand to combine DB updates
    const virtualCount = Math.floor(amount / 50) - 1;
    let internalCommission = 0;
    if (virtualCount > 0) {
        internalCommission = virtualCount * 2.50;
        if (!userWallets.referral) userWallets.referral = { balance: 0, currency: "USDT" };
        userWallets.referral.balance = Number((Number(userWallets.referral.balance || 0) + internalCommission).toFixed(2));
    }

    // 4. ATOMIC COMMIT (One Update for Deduction, Status, and Internal Commission)
    const { error: dedErr } = await supabaseAdmin.from('profiles').update({
        wallet_balance: userWalletBalance,
        wallets: userWallets,
        status: 'active', 
        is_virtual: false,
        active_package: amount,
        activated_at: new Date().toISOString(),
        is_active: true
    }).eq('id', userId);

    if (dedErr) throw new Error(`DEDUCTION_FAILED: ${dedErr.message}`);

    // Log the deduction transaction
    await supabaseAdmin.from('transactions').insert({
      user_id: userId,
      uid: userId,
      amount: -amount,
      type: 'package_activation',
      status: 'completed',
      description: `Package Activation: $${amount}`
    });

    // Sync to legacy tables for backwards compatibility
    await supabaseAdmin.from('members').update({ is_active: true }).eq('id', userId);

    // 5. VIRTUAL NODES PLACEMENT
    if (virtualCount > 0) {
        for (let i = 1; i <= virtualCount; i++) {
            const vOpId = `${profile.operator_id}-V${i}`;
            const vId = crypto.randomUUID();
            
            // Nodes stay in team_collection, parent_id is null for main tree separation
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

            await supabaseAdmin.from('transactions').insert({
                uid: userId,
                user_id: userId,
                amount: 2.50,
                type: 'referral_bonus',
                description: `Internal Commission from Virtual Node ${vOpId}`,
                status: 'completed'
            });
        }
    }

    // 6. EXTERNAL SPONSOR COMMISSION (5%) - REFERRAL INCOME
    if (profile.sponsor_id && profile.sponsor_id !== userId) {
        const extCommission = amount * 0.05;
        
        // Update JSON wallets
        const { data: sponProf } = await supabaseAdmin.from('profiles').select('wallets').eq('id', profile.sponsor_id).maybeSingle();
        if (sponProf) {
            let sponWallets = sponProf.wallets || {};
            if (typeof sponWallets === "string") {
                try { sponWallets = JSON.parse(sponWallets); } catch(e) { sponWallets = {}; }
            }
            if (!sponWallets.referral) sponWallets.referral = { balance: 0, currency: "USDT" };
            sponWallets.referral.balance = Number((Number(sponWallets.referral.balance || 0) + extCommission).toFixed(2));
            await supabaseAdmin.from('profiles').update({ wallets: sponWallets }).eq('id', profile.sponsor_id);
        }

        // Atomically update user_wallets.referral_box as requested
        const { data: sponUserWallet } = await supabaseAdmin.from('user_wallets').select('referral_box').eq('user_id', profile.sponsor_id).maybeSingle();
        if (sponUserWallet) {
             await supabaseAdmin.from('user_wallets').update({
                referral_box: Number(sponUserWallet.referral_box || 0) + extCommission,
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

    // 7. MATCHING INCOME (TREE TRAVERSAL UPWARD)
    let currentParentId = profile.parent_id; // placement_id
    let level = 1;
    const maxLevels = 10; // Distribute 1% up to 10 levels for example
    
    while (currentParentId && level <= maxLevels) {
        const matchingAmount = amount * 0.01; // Example: 1% of activated package per valid upline
        
        const { data: uplineProf } = await supabaseAdmin
            .from('profiles')
            .select('id, parent_id, operator_id')
            .eq('id', currentParentId)
            .maybeSingle();

        if (!uplineProf) break;
        
        // Update user_wallets.matching_box as requested
        const { data: uplineWallet } = await supabaseAdmin.from('user_wallets').select('matching_box').eq('user_id', uplineProf.id).maybeSingle();
        if (uplineWallet) {
             await supabaseAdmin.from('user_wallets').update({
                 matching_box: Number(uplineWallet.matching_box || 0) + matchingAmount,
                 last_updated: new Date().toISOString()
             }).eq('user_id', uplineProf.id);
        }

        // Insert Transaction
        await supabaseAdmin.from('transactions').insert({
            uid: uplineProf.id,
            user_id: uplineProf.id,
            amount: matchingAmount,
            type: 'MATCHING_BONUS',
            description: `Matching Bonus from ${profile.operator_id} (Level ${level})`,
            status: 'completed'
        });

        // Move to the next upline
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
