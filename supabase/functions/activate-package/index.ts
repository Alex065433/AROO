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

    const body = await req.json();
    const amount = Number(body.amount) || 0;

    if (amount < 50 || amount % 50 !== 0) {
      throw new Error("Invalid activation amount. Must be a multiple of 50.");
    }

    // 2. SECURE WALLET FETCHING & DEDUCTION
    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from('user_wallets')
      .select('id, master_vault')
      .eq('id', userId)
      .single();

    if (walletErr || !wallet) throw new Error("Wallet not found.");

    const currentBalance = Number(wallet.master_vault) || 0;
    if (currentBalance < amount) {
      throw new Error("Insufficient funds in Master Vault.");
    }

    const { error: dedErr } = await supabaseAdmin
      .from('user_wallets')
      .update({
        master_vault: (currentBalance - amount).toFixed(4),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (dedErr) throw new Error(`DEDUCTION_FAILED: ${dedErr.message}`);

    // Update profile status
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('operator_id, sponsor_id')
      .eq('id', userId)
      .single();

    await supabaseAdmin.from('profiles').update({
      status: 'active',
      is_active: true,
      active_package: amount,
      activated_at: new Date().toISOString()
    }).eq('id', userId);

    // 3. THE PERFECT PYRAMID MATRIX (VIRTUAL NODES)
    let virtualNodesCount = 0;
    if (amount >= 100) {
      virtualNodesCount = Math.floor(amount / 50) - 1;
    }

    const matrixIds: string[] = [userId];
    for (let i = 1; i <= virtualNodesCount; i++) {
        matrixIds[i] = crypto.randomUUID();
    }

    // TEAM COLLECTION UI SYNC CALCS
    const instantReferral = virtualNodesCount * 2.50;
    const instantMatching = Math.floor(virtualNodesCount / 2) * 5.00;
    const totalProfit = instantReferral + instantMatching;
    const yieldPerNode = virtualNodesCount > 0 ? (totalProfit / virtualNodesCount) : 0;

    for (let i = 1; i <= virtualNodesCount; i++) {
      const vId = matrixIds[i];
      const parentId = matrixIds[Math.floor((i - 1) / 2)];
      const position = i % 2 !== 0 ? 'LEFT' : 'RIGHT';
      const vOpId = `${profile?.operator_id || 'ARW'}-V${i}`;

      // AWAIT Inserts to ensure consistency
      // Insert Profile
      const { error: pErr } = await supabaseAdmin.from('profiles').insert({
        id: vId,
        operator_id: vOpId,
        sponsor_id: userId,
        is_virtual: true,
        status: 'active',
        is_active: true,
        active_package: 50,
        activated_at: new Date().toISOString()
      });
      if (pErr) console.error(`Error inserting virtual profile ${i}:`, pErr.message);

      // Insert into Members table for Binary Tree
      const { error: mErr } = await supabaseAdmin.from('members').insert({
        id: vId,
        user_id: vId,
        sponsor_id: userId,
        placement_id: parentId,
        position: position,
        status: 'active'
      });
      if (mErr) console.error(`Error inserting virtual member ${i}:`, mErr.message);

      // Insert into Team Collection for UI Yield
      const { error: tErr } = await supabaseAdmin.from('team_collection').insert({
        uid: userId,
        node_id: vOpId,
        package_amount: 50,
        status: 'active',
        pending_yield: Number(yieldPerNode.toFixed(4))
      });
      if (tErr) console.error(`Error inserting team collection ${i}:`, tErr.message);
    }

    // 4. EXTERNAL UPLINE COMMISSIONS
    // Sponsor Commission (5%)
    if (profile?.sponsor_id) {
        try {
            const { data: sponsorWallet } = await supabaseAdmin
                .from('user_wallets')
                .select('id, referral_box')
                .eq('id', profile.sponsor_id)
                .single();
            
            if (sponsorWallet) {
                const commission = amount * 0.05;
                await supabaseAdmin.from('user_wallets').update({
                    referral_box: (Number(sponsorWallet.referral_box) || 0) + commission,
                    updated_at: new Date().toISOString()
                }).eq('id', profile.sponsor_id);

                await supabaseAdmin.from('transactions').insert({
                    user_id: profile.sponsor_id,
                    amount: commission,
                    type: 'DIRECT_REFERRAL',
                    status: 'completed',
                    description: `Referral commission from ${profile.operator_id} package activation`
                });
            }
        } catch (err) {
            console.error("Sponsor commission error:", err);
        }
    }

    // External Matching Commissions (1% x 10 levels)
    try {
        let currentLevelUserId = userId;
        for (let level = 1; level <= 10; level++) {
            // Traverse up via members.placement_id
            const { data: currentMember, error: memErr } = await supabaseAdmin
                .from('members')
                .select('placement_id')
                .eq('id', currentLevelUserId)
                .single();
            
            if (memErr || !currentMember?.placement_id) break;
            
            const uplineId = currentMember.placement_id;
            
            try {
                const { data: uplineWallet, error: uwErr } = await supabaseAdmin
                    .from('user_wallets')
                    .select('id, matching_box')
                    .eq('id', uplineId)
                    .single();
                
                if (!uwErr && uplineWallet) {
                    const bonus = amount * 0.01;
                    await supabaseAdmin.from('user_wallets').update({
                        matching_box: (Number(uplineWallet.matching_box) || 0) + bonus,
                        updated_at: new Date().toISOString()
                    }).eq('id', uplineId);

                    await supabaseAdmin.from('transactions').insert({
                        user_id: uplineId,
                        amount: bonus,
                        type: 'MATCHING_BONUS',
                        status: 'completed',
                        description: `Level ${level} matching bonus from ${profile?.operator_id}`
                    });
                }
            } catch (innerErr) {
                console.error(`Upline commissions level ${level} inner error:`, innerErr);
            }
            
            currentLevelUserId = uplineId;
        }
    } catch (err) {
        console.error("External matching loop error:", err);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Package activated successfully",
      new_balance: (currentBalance - amount).toFixed(4)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("[ACTIVATE-PACKAGE ERROR]", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
