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

    // AUTHENTICATION
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("UNAUTHORIZED: Missing session token");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) throw new Error("UNAUTHORIZED: Invalid session");
    
    const userId = user.id;
    const body = await req.json();
    const amount = Number(body.amount) || 0;

    if (amount < 50 || amount % 50 !== 0) {
      throw new Error("INVALID_PACKAGE: Amount must be a multiple of $50");
    }

    // 1. ATOMIC WALLET DEDUCTION FIRST
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

    // 2. PERFECT BREADTH-FIRST BINARY MATRIX (Level Order)
    const totalNodes = Math.floor(amount / 50);
    const virtualNodesCount = totalNodes - 1;

    // Smart Calculation for Yield ($50 Base)
    // N = virtualNodesCount
    const n = virtualNodesCount;
    const directReferral = n * 2.50;
    const matchingPairs = Math.floor(n / 2) * 5.00;
    const totalProfit = directReferral + matchingPairs;
    const yieldPerNode = n > 0 ? Number((totalProfit / n).toFixed(4)) : 0;

    const matrixIds: string[] = [userId];
    for (let i = 1; i <= virtualNodesCount; i++) {
        matrixIds[i] = crypto.randomUUID();
    }

    if (virtualNodesCount > 0) {
        for (let i = 1; i <= virtualNodesCount; i++) {
            const vId = matrixIds[i];
            const pIndex = Math.floor((i - 1) / 2); // Parent Index for Balanced Tree
            const parentId = matrixIds[pIndex];
            const position = (i % 2 !== 0) ? 'LEFT' : 'RIGHT';
            const vOpId = `${profile?.operator_id || 'USR'}-V${i}`;

            // AWAIT inserts for high-integrity sequential placement
            // A. Insert Profile
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

            // B. Insert into Members (Placement Logic)
            await supabaseAdmin.from('members').insert({
                id: vId,
                sponsor_id: userId,
                placement_id: parentId,
                position: position,
                is_active: true,
                master_account_id: userId
            });

            // C. Insert into Team Collection (UI Sync with pending_yield)
            await supabaseAdmin.from('team_collection').insert({
                uid: userId,
                node_id: vOpId,
                package_amount: 50,
                status: 'active',
                pending_yield: yieldPerNode
            });
        }
    }

    // 3. UPLINE COMMISSIONS (EXTERNAL)
    // 3.1 Sponsor 5%
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
                    description: `Profit from ${profile.operator_id} ($${amount})`
                });
            }
        } catch (e) { console.error("Sponsor Payout Error:", e.message); }
    }

    // 3.2 External Matching 1% (10 Levels)
    try {
        let currentId = userId;
        for (let l = 1; l <= 10; l++) {
            const { data: mem } = await supabaseAdmin
                .from('members')
                .select('placement_id')
                .eq('id', currentId)
                .maybeSingle();

            if (!mem?.placement_id) break;
            const uplineId = mem.placement_id;

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
                        description: `Matching bonus L${l} from ${profile?.operator_id}`
                    });
                }
            } catch (innerE) { console.error(`Level ${l} Payout Error:`, innerE.message); }
            
            currentId = uplineId;
        }
    } catch (e) { console.error("Upline Commission Loop Error:", e.message); }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Package successfully activated",
      total_nodes: totalNodes,
      matrix_yield: yieldPerNode,
      new_balance: (vaultBalance - amount).toFixed(4)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("[CRITICAL FAILURE]", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
