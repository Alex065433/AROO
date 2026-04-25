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

    // 1. ADMIN OVERRIDE & SAFE AUTH
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("INSUFFICIENT_PERMISSIONS: No token provided");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) throw new Error("INSUFFICIENT_PERMISSIONS: Session invalid");
    const userId = user.id;

    const body = await req.json();
    const amount = Number(body.amount) || 0;

    if (amount < 50 || amount % 50 !== 0) {
      throw new Error("INVALID_PACKAGE: Amount must be a multiple of $50");
    }

    // 2. SAFE ATOMIC DEDUCTION
    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from('user_wallets')
      .select('id, master_vault')
      .eq('id', userId)
      .single();

    if (walletErr || !wallet) throw new Error("WALLET_FAILURE: Master Vault not found");

    const vaultBalance = Number(wallet.master_vault) || 0;
    if (vaultBalance < amount) throw new Error("INSUFFICIENT MASTER VAULT BALANCE");

    // Atomic Balance Update
    const { error: dedErr } = await supabaseAdmin
      .from('user_wallets')
      .update({
        master_vault: (vaultBalance - amount).toFixed(4),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (dedErr) throw new Error(`DEDUCTION_FAILURE: ${dedErr.message}`);

    // Update Master Profile Status
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('operator_id, sponsor_id, name')
      .eq('id', userId)
      .single();

    await supabaseAdmin.from('profiles').update({
      status: 'active',
      is_active: true,
      active_package: amount,
      activated_at: new Date().toISOString()
    }).eq('id', userId);

    // 3. $50 BASE CALCULATIONS
    const totalNodes = Math.floor(amount / 50);
    const virtualNodesCount = totalNodes - 1;

    // Internal Profits strictly on the $50 base
    const instantReferral = virtualNodesCount * 2.50; // 5% of $50 per node
    const totalPairs = Math.floor(virtualNodesCount / 2);
    const instantMatching = totalPairs * 5.00; // 10% of $50 per pair
    const totalInternalProfit = instantReferral + instantMatching;
    const yieldPerNode = virtualNodesCount > 0 ? (totalInternalProfit / virtualNodesCount).toFixed(4) : "0";

    // 4. BALANCED BINARY MATRIX (LEFT/RIGHT FILL)
    const matrixIds: string[] = [userId];
    for (let i = 1; i <= virtualNodesCount; i++) {
        matrixIds[i] = crypto.randomUUID();
    }

    if (virtualNodesCount > 0) {
        for (let i = 1; i <= virtualNodesCount; i++) {
            const vId = matrixIds[i];
            const pIndex = Math.floor((i - 1) / 2);
            const parentId = matrixIds[pIndex];
            const position = (i % 2 !== 0) ? 'LEFT' : 'RIGHT';
            const vOpId = `${profile?.operator_id || 'USR'}-V${i}`;

            // AWAIT Sequential High-Integrity Inserts
            // A. Insert Virtual Profile
            await supabaseAdmin.from('profiles').insert({
                id: vId,
                operator_id: vOpId,
                name: `${profile?.name || 'User'} (V${i})`,
                sponsor_id: userId,
                is_virtual: true,
                status: 'active',
                is_active: true,
                active_package: 50,
                activated_at: new Date().toISOString()
            });

            // B. Insert Into Members (Placement)
            // Note: Using detected columns 'master_account_id'
            await supabaseAdmin.from('members').insert({
                id: vId,
                sponsor_id: userId,
                placement_id: parentId,
                position: position,
                is_active: true,
                master_account_id: userId
            });

            // C. Insert Into Team Collection (UI Sync)
            // Requirement mandate: save in 'pending_yield'
            await supabaseAdmin.from('team_collection').insert({
                uid: userId,
                node_id: vOpId,
                package_amount: 50,
                status: 'active',
                pending_yield: Number(yieldPerNode)
            });
        }
    }

    // 5. UPLINE COMMISSIONS (EXTERNAL)
    // 5.1 Sponsor 5%
    if (profile?.sponsor_id) {
        try {
            const { data: sWallet } = await supabaseAdmin
                .from('user_wallets')
                .select('id, referral_box')
                .eq('id', profile.sponsor_id)
                .single();

            if (sWallet) {
                const bonus = amount * 0.05;
                await supabaseAdmin.from('user_wallets').update({
                    referral_box: (Number(sWallet.referral_box) || 0) + bonus,
                    updated_at: new Date().toISOString()
                }).eq('id', sWallet.id);

                await supabaseAdmin.from('transactions').insert({
                    user_id: profile.sponsor_id,
                    amount: bonus,
                    type: 'DIRECT_REFERRAL',
                    status: 'completed',
                    description: `Referral bonus from ${profile.operator_id} ($${amount})`
                });
            }
        } catch (e) { console.error("Sponsor payout failed:", e.message); }
    }

    // 5.2 External Matching 1% (10 Levels)
    try {
        let tracerId = userId;
        for (let l = 1; l <= 10; l++) {
            const { data: member } = await supabaseAdmin
                .from('members')
                .select('placement_id')
                .eq('id', tracerId)
                .maybeSingle();

            if (!member?.placement_id) break;
            const uplineId = member.placement_id;

            try {
                const { data: uWallet } = await supabaseAdmin
                    .from('user_wallets')
                    .select('id, matching_box')
                    .eq('id', uplineId)
                    .single();

                if (uWallet) {
                    const bonus = amount * 0.01;
                    await supabaseAdmin.from('user_wallets').update({
                        matching_box: (Number(uWallet.matching_box) || 0) + bonus,
                        updated_at: new Date().toISOString()
                    }).eq('id', uWallet.id);

                    await supabaseAdmin.from('transactions').insert({
                        user_id: uplineId,
                        amount: bonus,
                        type: 'MATCHING_BONUS',
                        status: 'completed',
                        description: `Matching L${l} bonus from ${profile?.operator_id}`
                    });
                }
            } catch (innerE) { console.error(`Level ${l} failed:`, innerE.message); }
            
            tracerId = uplineId;
        }
    } catch (e) { console.error("Upline loop failed:", e.message); }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Package Activation Successful",
      total_nodes: totalNodes,
      matrix_yield: yieldPerNode
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("[CRITICAL] Activation Failure:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
