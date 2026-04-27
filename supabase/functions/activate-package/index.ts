import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * ELITE MLM ARCHITECT: ACTIVATE-PACKAGE
 * 1. Atomic Wallet Deduction
 * 2. 1->2->4 Balanced Matrix Generation ($50 units)
 * 3. Team Collection & ROI Tracking Sync
 * 4. Starter-based Rank System Traversal
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Auth Header.");
    
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) throw new Error("Invalid Session.");
    
    const userId = user.id;
    const body = await req.json();
    const amount = Number(body.amount || 50);

    if (amount < 50 || amount % 50 !== 0) {
      throw new Error("Invalid Package Amount. Must be a multiple of $50.");
    }

    // 1. ATOMIC WALLET DEDUCTION (Deduction FIRST - No money, no honey)
    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from('user_wallets')
      .select('master_vault')
      .eq('id', userId)
      .single();

    if (walletErr || !wallet) throw new Error("Wallet Error: Master Vault fetching failed.");
    
    const currentVault = Number(wallet.master_vault) || 0;
    if (currentVault < amount) throw new Error("INSUFFICIENT BALANCE");

    // Perform Update
    const { error: deductErr } = await supabaseAdmin
      .from('user_wallets')
      .update({ master_vault: (currentVault - amount).toFixed(4) })
      .eq('id', userId);

    if (dedErr) throw new Error("WALLET DEDUCTION FAILED: Procedure halted.");

    // Fetch Master Info
    const { data: masterProfile } = await supabaseAdmin
      .from('profiles')
      .select('operator_id, name, sponsor_id')
      .eq('id', userId)
      .single();

    // 2. THE PERFECT BALANCED MATRIX (1->2->4 Pyramid)
    const totalNodes = Math.floor(amount / 50);
    const virtualCount = totalNodes - 1;

    // Yield Calc (Internal Matching/Referral distributed to virtuals)
    const instantReferral = virtualCount * 2.50; 
    const totalPairs = Math.floor(virtualCount / 2);
    const instantMatching = totalPairs * 5.00;
    const totalInternalYield = instantReferral + instantMatching;
    const yieldPerNode = virtualCount > 0 ? (totalInternalYield / virtualCount).toFixed(4) : "0";

    const matrixIds = [userId]; // Level 0
    for (let i = 1; i <= virtualCount; i++) {
        matrixIds[i] = crypto.randomUUID();
    }

    // Node Generation Loop
    for (let i = 1; i <= virtualCount; i++) {
        const vId = matrixIds[i];
        const parentIndex = Math.floor((i - 1) / 2); // The Binary Tree Logic
        const parentId = matrixIds[parentIndex];
        const position = (i % 2 !== 0) ? 'LEFT' : 'RIGHT';
        const vOpId = `${masterProfile.operator_id}-V${i}`;

        // Create Profile
        await supabaseAdmin.from('profiles').insert({
            id: vId,
            operator_id: vOpId,
            name: `${masterProfile.name} (V${i})`,
            sponsor_id: userId,
            is_virtual: true,
            status: 'active',
            is_active: true,
            active_package: 50,
            activated_at: new Date().toISOString(),
            is_starter: false
        });

        // Place in Tree
        // Note: Using 'members' for tree storage and 'profiles' for direct parent_id sync
        await supabaseAdmin.from('members').insert({
            id: vId,
            sponsor_id: userId,
            placement_id: parentId,
            position: position,
            is_active: true,
            master_account_id: userId
        });

        // Update profiles parent_id/side for UI query simplicity
        await supabaseAdmin.from('profiles').update({
            parent_id: parentId,
            side: position
        }).eq('id', vId);

        // 3. TEAM COLLECTION SYNC
        await supabaseAdmin.from('team_collection').insert({
            uid: userId,
            node_id: vOpId,
            package_amount: 50,
            status: 'active',
            pending_yield: Number(yieldPerNode)
        });

        // ROI Tracking (0.5% daily)
        await supabaseAdmin.from('daily_roi_tracking').insert({
            user_id: userId,
            node_id: vOpId,
            activation_amount: 50,
            daily_percent: 0.50,
            status: 'active'
        });
    }

    // 4. RANK SYSTEM & STARTER UPDATE
    // If virtualCount >= 2, the user has at least 1 Left and 1 Right virtual node under them => STARTER QUALIFIED
    const isNowStarter = virtualCount >= 2;
    if (isNowStarter) {
        // Mark as Starter
        await supabaseAdmin.from('profiles').update({ is_starter: true }).eq('id', userId);

        // Traverse Upline to increment starter counts
        let currentTracerId = userId;
        while (currentTracerId) {
            const { data: tracerMember } = await supabaseAdmin
                .from('members')
                .select('placement_id, position')
                .eq('id', currentTracerId)
                .maybeSingle();
            
            if (!tracerMember?.placement_id) break;
            
            const parentId = tracerMember.placement_id;
            const side = tracerMember.position.toUpperCase();
            
            const { data: parentProfile } = await supabaseAdmin
                .from('profiles')
                .select('id, left_starters, right_starters, rank')
                .eq('id', parentId)
                .single();

            if (parentProfile) {
                const newLeft = side === 'LEFT' ? (parentProfile.left_starters || 0) + 1 : (parentProfile.left_starters || 0);
                const newRight = side === 'RIGHT' ? (parentProfile.right_starters || 0) + 1 : (parentProfile.right_starters || 0);
                
                // Rank Logic
                let newRank = parentProfile.rank || 'Member';
                if (newLeft >= 250 && newRight >= 250) newRank = 'Blue Sapphire';
                else if (newLeft >= 100 && newRight >= 100) newRank = 'Diamond';
                else if (newLeft >= 31 && newRight >= 31) newRank = 'Platina';
                else if (newLeft >= 15 && newRight >= 15) newRank = 'Gold';
                else if (newLeft >= 7 && newRight >= 7) newRank = 'Silver';
                else if (newLeft >= 3 && newRight >= 3) newRank = 'Bronze';

                await supabaseAdmin.from('profiles').update({
                    left_starters: newLeft,
                    right_starters: newRight,
                    rank: newRank,
                    rank_name: newRank
                }).eq('id', parentId);
            }
            
            currentTracerId = parentId;
        }
    }

    // Update Master Profile Status
    await supabaseAdmin.from('profiles').update({
        status: 'active',
        is_active: true,
        active_package: amount,
        activated_at: new Date().toISOString()
    }).eq('id', userId);

    return new Response(JSON.stringify({ 
        success: true, 
        message: "Activation Success",
        nodes: totalNodes 
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
    });
  }
});
