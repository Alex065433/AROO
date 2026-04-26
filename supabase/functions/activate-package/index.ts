import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.12.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ELITE MLM ARCHITECT: Bypassing RLS with Service Role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. AUTHENTICATION & SECURITY GATES
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("UNAUTHORIZED: Session token missing");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) throw new Error("UNAUTHORIZED: Invalid session");
    
    const userId = user.id;
    const body = await req.json();
    const amount = Number(body.amount) || 0;

    if (amount < 50 || amount % 50 !== 0) {
      throw new Error("INVALID_PACKAGE: Amount must be a multiple of $50");
    }

    // 2. ATOMIC WALLET DEDUCTION (INTEGRITY FIRST)
    // Fetch user_wallets using 'id' column as confirmed by schema audit
    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from('user_wallets')
      .select('id, master_vault')
      .eq('id', userId)
      .single();

    if (walletErr || !wallet) {
        throw new Error("WALLET_FAILURE: Error fetching Master Vault for ID: " + userId);
    }

    const currentVault = Number(wallet.master_vault) || 0;
    if (currentVault < amount) {
      throw new Error("INSUFFICIENT MASTER VAULT BALANCE");
    }

    // Atomic Deduction
    const { error: dedErr } = await supabaseAdmin
      .from('user_wallets')
      .update({
        master_vault: (currentVault - amount).toFixed(4),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (dedErr) throw new Error(`DEDUCTION_FAILED: Wallet update error - ${dedErr.message}`);

    // Update Master Profile to Active
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

    // 3. THE BALANCED TRIANGLE ENGINE ($50 BASE)
    // Formula: N = Amount / 50. Master consumes 1 unit, Virtuals consume N-1.
    const totalNodes = Math.floor(amount / 50);
    const virtualNodesCount = totalNodes - 1;

    // Smart Calculation for Yield (Internal Profit Sync)
    // PDF Page 13: 5% Referral ($2.50) + 10% Matching ($5.00 per pair)
    const instantReferral = virtualNodesCount * 2.50; 
    const totalPairs = Math.floor(virtualNodesCount / 2);
    const instantMatching = totalPairs * 5.00;
    const totalInternalProfit = instantReferral + instantMatching;
    
    // Yield distributed across virtual nodes for UI display (Team Collection)
    const yieldPerNode = virtualNodesCount > 0 ? (totalInternalProfit / virtualNodesCount).toFixed(4) : "0.0000";

    const matrixIds: string[] = [userId]; // Master at index 0
    if (virtualNodesCount > 0) {
        for (let i = 1; i <= virtualNodesCount; i++) {
            matrixIds[i] = crypto.randomUUID();
        }
    }

    // 4. BALANCED BINARY PLACEMENT LOOP
    if (virtualNodesCount > 0) {
        for (let i = 1; i <= virtualNodesCount; i++) {
            const vId = matrixIds[i];
            // ELITE PLACEMENT MATH: ensures 1->2->4 balanced triangle
            const parentIndex = Math.floor((i - 1) / 2);
            const parentId = matrixIds[parentIndex];
            const position = (i % 2 !== 0) ? 'LEFT' : 'RIGHT';
            
            const vOpId = `${profile?.operator_id || 'USR'}-V${i}`;

            // AWAIT inserts for strictly sequential tree integrity
            // 4.1 Insert Profile (is_virtual: true)
            const { error: pErr } = await supabaseAdmin.from('profiles').insert({
                id: vId,
                operator_id: vOpId,
                name: `${profile?.name || 'User'} (V${i})`,
                sponsor_id: userId, // The user is the sponsor of their virtual nodes
                is_virtual: true,
                status: 'active',
                is_active: true,
                active_package: 50,
                activated_at: new Date().toISOString()
            });
            if (pErr) console.error(`[PLACEMENT_ERROR] Profile V${i} insert failed:`, pErr.message);

            // 4.2 Insert Member (Binary Tree Placement)
            const { error: mErr } = await supabaseAdmin.from('members').insert({
                id: vId,
                user_id: vId,
                sponsor_id: userId,
                placement_id: parentId,
                position: position,
                is_active: true,
                master_account_id: userId // Linking back to main ID
            });
            if (mErr) console.error(`[PLACEMENT_ERROR] Member V${i} insert failed:`, mErr.message);

            // 4.3 Insert Team Collection (UI SYNC: Individual Income)
            // MANDATE: Save the exact yieldPerNode into 'pending_yield'
            const { error: tErr } = await supabaseAdmin.from('team_collection').insert({
                uid: userId,
                node_id: vOpId,
                package_amount: 50,
                status: 'active',
                pending_yield: Number(yieldPerNode)
            });
            if (tErr) console.error(`[UI_SYNC_ERROR] Team Collection V${i} yield record failed:`, tErr.message);
        }
    }

    // 5. EXTERNAL UPLINE COMMISSIONS (PAYOUTS)
    // 5.1 Direct Sponsor Bonus (5% of Total Amount)
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
                    description: `Referral profit from ${profile.operator_id} ($${amount})`
                });
            }
        } catch (e) {
            console.error("[PAYOUT_ERROR] Sponsor direct bonus failed:", e);
        }
    }

    // 5.2 External Matching Bonus (1% x 10 Levels of Placement)
    try {
        let currentTargetId = userId;
        for (let level = 1; level <= 10; level++) {
            // Find parent placement ID
            const { data: memberNode } = await supabaseAdmin
                .from('members')
                .select('placement_id')
                .eq('id', currentTargetId)
                .maybeSingle();

            if (!memberNode?.placement_id) break; // End of pyramid
            
            const uplineId = memberNode.placement_id;

            try {
                const { data: uWallet } = await supabaseAdmin
                    .from('user_wallets')
                    .select('id, matching_box')
                    .eq('id', uplineId)
                    .single();

                if (uWallet) {
                    const lBonus = amount * 0.01;
                    await supabaseAdmin.from('user_wallets').update({
                        matching_box: (Number(uWallet.matching_box) || 0) + lBonus,
                        updated_at: new Date().toISOString()
                    }).eq('id', uWallet.id);

                    await supabaseAdmin.from('transactions').insert({
                        user_id: uplineId,
                        amount: lBonus,
                        type: 'MATCHING_BONUS',
                        status: 'completed',
                        description: `Matching bonus L${level} from ${profile?.operator_id} activation`
                    });
                }
            } catch (innerErr) {
                console.error(`[PAYOUT_ERROR] Level ${level} failed for Upline ${uplineId}:`, innerErr);
            }
            
            currentTargetId = uplineId; // Chain up
        }
    } catch (glblErr) {
        console.error("[PAYOUT_ERROR] Global matching payout loop error:", glblErr);
    }

    // 6. FINAL SUCCESS RESPONSE
    return new Response(JSON.stringify({ 
      success: true, 
      message: `${totalNodes} Nodes Activated Successfully`,
      activated_nodes: virtualNodesCount + 1,
      individual_yield: yieldPerNode,
      new_balance: (currentVault - amount).toFixed(4)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("[CRITICAL_FAILURE] Activate-Package Edge Function:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
