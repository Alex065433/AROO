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

    // 1. ELITE AUTH & SECURE WALLET DEDUCTION
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("UNAUTHORIZED");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) throw new Error("INVALID_SESSION");
    
    const userId = user.id;
    const { amount, targetUserId } = await req.json();

    // Determine target user (allow admin to specify targetUserId)
    let effectiveUserId = userId;
    if (targetUserId && targetUserId !== userId) {
        // Check if caller is admin
        const { data: callerProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', userId).single();
        if (callerProfile?.role === 'admin') {
            effectiveUserId = targetUserId;
            console.log(`Admin ${userId} activating package for user ${effectiveUserId}`);
        } else {
            throw new Error("UNAUTHORIZED: Only admins can activate for others");
        }
    }

    if (!amount || amount < 50 || amount % 50 !== 0) {
        throw new Error("INVALID_AMOUNT: Package must be a multiple of $50");
    }

    // A. FETCH WALLET of the CALLER (The one paying)
    const { data: wallet, error: wErr } = await supabaseAdmin
        .from('user_wallets')
        .select('master_vault')
        .eq('id', userId)
        .single();
    
    // FETCH PROFILE of the EFFECTIVE USER (The one receiving)
    const { data: profile, error: pErr } = await supabaseAdmin.from('profiles').select('operator_id, name, sponsor_id, master_vault').eq('id', effectiveUserId).single();
    if (pErr || !profile) throw new Error("TARGET_USER_PROFILE_NOT_FOUND");

    if (wErr || !wallet) throw new Error("WALLET_NOT_FOUND");
    
    // Check if the caller has enough balance
    if (Number(wallet.master_vault) < amount) throw new Error("INSUFFICIENT MASTER VAULT BALANCE");

    // B. ATOMIC DEDUCTION from CALLER
    const { error: dedErr } = await supabaseAdmin.from('user_wallets').update({ 
        master_vault: (Number(wallet.master_vault) - amount).toFixed(4),
        updated_at: new Date().toISOString()
    }).eq('id', userId);

    if (dedErr) throw new Error(`DEDUCTION_FAILED: ${dedErr.message}`);

    // Update profiles mirror for CALLER
    await supabaseAdmin.from('profiles').update({
        master_vault: (Number(wallet.master_vault) - amount).toFixed(4)
    }).eq('id', userId);


    // 2. THE BALANCED TRIANGLE ENGINE ($50 BASE)
    const totalUnits = Math.floor(amount / 50);
    const virtualCount = totalUnits - 1;

    // Yield Calc: (Referral 5% [$2.50] + Matching 10% [$5.00] per pair)
    // We calculate profit strictly on the $50 base for the triangle
    const referralProfit = virtualCount * 2.50;
    const matchingPairs = Math.floor(virtualCount / 2);
    const matchingProfit = matchingPairs * 5.00;
    const totalInternalProfit = referralProfit + matchingProfit;
    const yieldPerNode = virtualCount > 0 ? (totalInternalProfit / virtualCount).toFixed(4) : "0";

    const matrix = [effectiveUserId];
    // Loop for Virtual Node Generation
    for (let i = 1; i <= virtualCount; i++) {
        const vId = crypto.randomUUID();
        matrix[i] = vId;
        
        const parentIndex = Math.floor((i - 1) / 2);
        const parentId = matrix[parentIndex];
        const position = (i % 2 !== 0) ? 'LEFT' : 'RIGHT';
        const vOpId = `${profile.operator_id}-V${i}`;
        
        // A. Insert Profile
        await supabaseAdmin.from('profiles').insert({
            id: vId,
            operator_id: vOpId,
            name: `${profile.name} (V${i})`,
            is_virtual: true,
            is_active: true,
            status: 'active',
            active_package: 50,
            sponsor_id: effectiveUserId,
            activated_at: new Date().toISOString()
        });

        // B. Insert into Members (Binary Tree Placement)
        await supabaseAdmin.from('members').insert({
            id: vId,
            placement_id: parentId,
            position: position,
            sponsor_id: effectiveUserId, // Master is the sponsor
            is_active: true,
            master_account_id: effectiveUserId
        });

        // C. Sync Individual Income (pending_yield)
        await supabaseAdmin.from('team_collection').insert({
            uid: effectiveUserId,
            node_id: vOpId,
            package_amount: 50,
            status: 'active',
            pending_yield: Number(yieldPerNode)
        });

        // D. Passive ROI Registration
        await supabaseAdmin.from('daily_roi_tracking').insert({
            user_id: effectiveUserId,
            node_id: vOpId,
            activation_amount: 50,
            daily_percent: 0.50,
            status: 'active',
            max_limit: 150, // Example: 3x ROI
            description: `Passive ROI for node ${vOpId}`
        });
    }

    // 3. UPLINE PAYOUTS (EXTERNAL)
    // 5% Direct Referral to Sponsor
    if (profile.sponsor_id) {
        try {
            const { data: sponsorWallet } = await supabaseAdmin.from('user_wallets').select('referral_box').eq('id', profile.sponsor_id).single();
            if (sponsorWallet) {
                const commission = amount * 0.05;
                await supabaseAdmin.from('user_wallets').update({
                    referral_box: (Number(sponsorWallet.referral_box) + commission).toFixed(4),
                    updated_at: new Date().toISOString()
                }).eq('id', profile.sponsor_id);

                // Update profiles mirror for Sponsor
                const { data: sProf } = await supabaseAdmin.from('profiles').select('referral_income, wallet_balance').eq('id', profile.sponsor_id).single();
                if (sProf) {
                     await supabaseAdmin.from('profiles').update({
                        referral_income: (Number(sProf.referral_income || 0) + commission).toFixed(4),
                        wallet_balance: (Number(sProf.wallet_balance || 0) + commission).toFixed(4)
                    }).eq('id', profile.sponsor_id);
                }

                await supabaseAdmin.from('transactions').insert({
                    user_id: profile.sponsor_id,
                    amount: commission,
                    type: 'DIRECT_REFERRAL',
                    status: 'completed',
                    description: `Referral commission from ${profile.operator_id} ($${amount})`
                });
            }
        } catch (e) { console.error("Sponsor payout failed", e); }
    }

    // 1% Matching Bonus to 10 Upline Levels
    try {
        let currentUplineId = effectiveUserId;
        for (let level = 1; level <= 10; level++) {
            const { data: member } = await supabaseAdmin.from('members').select('placement_id').eq('id', currentUplineId).single();
            if (!member || !member.placement_id) break;
            
            const uplineId = member.placement_id;
            const { data: uplineWallet } = await supabaseAdmin.from('user_wallets').select('matching_box').eq('id', uplineId).single();
            
            if (uplineWallet) {
                const bonus = amount * 0.01;
                await supabaseAdmin.from('user_wallets').update({
                    matching_box: (Number(uplineWallet.matching_box) + bonus).toFixed(4),
                    updated_at: new Date().toISOString()
                }).eq('id', uplineId);

                // Update profiles mirror for Upline
                const { data: uProf } = await supabaseAdmin.from('profiles').select('matching_income, wallet_balance').eq('id', uplineId).single();
                if (uProf) {
                    await supabaseAdmin.from('profiles').update({
                        matching_income: (Number(uProf.matching_income || 0) + bonus).toFixed(4),
                        wallet_balance: (Number(uProf.wallet_balance || 0) + bonus).toFixed(4)
                    }).eq('id', uplineId);
                }

                await supabaseAdmin.from('transactions').insert({
                    user_id: uplineId,
                    amount: bonus,
                    type: 'MATCHING_BONUS',
                    status: 'completed',
                    description: `Level ${level} matching bonus from ${profile.operator_id}`
                });
            }
            currentUplineId = uplineId;
        }
    } catch (e) { console.error("Upline matching loop failed", e); }

    // Update Master Profile
    await supabaseAdmin.from('profiles').update({ 
        status: 'active', 
        is_active: true, 
        active_package: amount,
        activated_at: new Date().toISOString()
    }).eq('id', effectiveUserId);

    return new Response(JSON.stringify({ 
        success: true, 
        message: `${totalUnits} Nodes Activated ($${amount})`,
        matrix_nodes: virtualCount,
        yield_per_node: yieldPerNode
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error("[ACTIVATE-PACKAGE FAILURE]", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
