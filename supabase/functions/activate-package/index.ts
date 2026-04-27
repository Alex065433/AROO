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
    if (!authHeader) throw new Error("UNAUTHORIZED: Session token missing");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) throw new Error("UNAUTHORIZED: Invalid session");
    
    const userId = user.id;
    const { amount } = await req.json();

    if (!amount || amount < 50 || amount % 50 !== 0) {
        throw new Error("INVALID_AMOUNT: Package must be a multiple of $50");
    }

    // A. FETCH WALLET
    const { data: wallet, error: wErr } = await supabaseAdmin
        .from('user_wallets')
        .select('master_vault')
        .eq('id', userId)
        .single();

    if (wErr || !wallet) throw new Error("WALLET_NOT_FOUND");
    if (Number(wallet.master_vault) < amount) throw new Error("INSUFFICIENT BALANCE");

    // FIX 1: STRICT ATOMIC WALLET DEDUCTION
    const { error: dedErr } = await supabaseAdmin.from('user_wallets').update({ 
        master_vault: (Number(wallet.master_vault) - amount).toFixed(4),
        updated_at: new Date().toISOString()
    }).eq('id', userId);

    if (dedErr) throw new Error("WALLET DEDUCTION FAILED");

    // 2. THE BALANCED TRIANGLE ENGINE ($50 BASE)
    const totalUnits = Math.floor(amount / 50);
    const virtualCount = totalUnits - 1;

    // Yield Calc: (Referral 5% [$2.50] + Matching 10% [$5.00] per pair)
    const referralProfit = virtualCount * 2.50;
    const matchingPairs = Math.floor(virtualCount / 2);
    const matchingProfit = matchingPairs * 5.00;
    const totalInternalProfit = referralProfit + matchingProfit;
    const yieldPerNode = virtualCount > 0 ? (totalInternalProfit / virtualCount).toFixed(4) : "0";

    const matrix = [userId];
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('operator_id, name, sponsor_id')
        .eq('id', userId)
        .single();

    // Update Master Profile to Active
    await supabaseAdmin.from('profiles').update({
        status: 'active',
        is_active: true,
        active_package: amount,
        activated_at: new Date().toISOString()
    }).eq('id', userId);

    // Also update Members entry for Master to ensure it is counted as active in upline Starter evaluations
    await supabaseAdmin.from('members').update({ is_active: true }).eq('id', userId);

    // ROI Rule: ONLY insert into daily_roi_tracking IF amount === 50
    if (amount === 50) {
        await supabaseAdmin.from('daily_roi_tracking').insert({
            user_id: userId,
            node_id: profile.operator_id,
            activation_amount: 50,
            daily_percent: 0.50,
            status: 'active',
            max_limit: 150,
            description: `Passive ROI for Master node ${profile.operator_id}`
        });
    }

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
            sponsor_id: userId,
            activated_at: new Date().toISOString()
        });

        // B. Insert into Members (Binary Tree Placement)
        await supabaseAdmin.from('members').insert({
            id: vId,
            placement_id: parentId,
            position: position,
            sponsor_id: userId,
            is_active: true,
            master_account_id: userId
        });

        // C. Sync Team Collection Income
        await supabaseAdmin.from('team_collection').insert({
            uid: userId,
            node_id: vOpId,
            package_amount: 50,
            status: 'active',
            pending_yield: Number(yieldPerNode)
        });
        
        // Note: Daily ROI is skipped for virtual nodes because total amount > 50 if virtual nodes exist
    }

    // 3. UPLINE PAYOUTS & RANK SYSTEM
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

    // FIX 3: STARTER-BASED RANK SYSTEM UPDATE
    // We need to evaluate qualification for nodes that were just activated
    // Matrix contains [userId, vId1, vId2, ...]
    // We should evaluate in reverse order (bottom-up within the matrix) to trigger nested starters
    for (let i = matrix.length - 1; i >= 0; i--) {
        const nodeId = matrix[i];
        
        // Check if this node itself is now a Starter
        const { data: children } = await supabaseAdmin
            .from('members')
            .select('id, position, is_active')
            .eq('placement_id', nodeId);
        
        const hasActiveLeft = children?.some((c: any) => c.position === 'LEFT' && c.is_active);
        const hasActiveRight = children?.some((c: any) => c.position === 'RIGHT' && c.is_active);
        
        if (hasActiveLeft && hasActiveRight) {
            // Check if already a starter
            const { data: pData } = await supabaseAdmin.from('profiles').select('is_starter').eq('id', nodeId).single();
            
            if (pData && !pData.is_starter) {
                // MARK AS STARTER
                await supabaseAdmin.from('profiles').update({ is_starter: true }).eq('id', nodeId);
                
                // Traverse UP to increment starter counts for uplines
                let currentTracerId = nodeId;
                let shouldContinueIncrementing = true;

                while (currentTracerId && shouldContinueIncrementing) {
                    const { data: tracerMember } = await supabaseAdmin
                        .from('members')
                        .select('placement_id, position')
                        .eq('id', currentTracerId)
                        .maybeSingle();
                    
                    if (!tracerMember?.placement_id) break;
                    
                    const parentId = tracerMember.placement_id;
                    const side = tracerMember.position; // LEFT or RIGHT
                    
                    const starterField = side === 'LEFT' ? 'left_starters' : 'right_starters';
                    
                    const { data: parentProfile } = await supabaseAdmin
                        .from('profiles')
                        .select(`id, left_starters, right_starters, rank, is_starter`)
                        .eq('id', parentId)
                        .single();
                    
                    if (parentProfile) {
                        const newLeft = side === 'LEFT' ? (parentProfile.left_starters || 0) + 1 : (parentProfile.left_starters || 0);
                        const newRight = side === 'RIGHT' ? (parentProfile.right_starters || 0) + 1 : (parentProfile.right_starters || 0);
                        
                        // Check if parent becomes a starter
                        // A parent is a starter if they have 1 Active Left child and 1 Active Right child
                        // Actually, the prompt says "exactly 1 Active Left and 1 Active Right". 
                        // The child that triggered this was just marked active.
                        // We already checked this logic for nodeId. Now for parent.
                        const { data: parentChildren } = await supabaseAdmin
                            .from('members')
                            .select('id, position, is_active')
                            .eq('placement_id', parentId);
                        
                        const pHasActiveLeft = parentChildren?.some((c: any) => c.position === 'LEFT' && c.is_active);
                        const pHasActiveRight = parentChildren?.some((c: any) => c.position === 'RIGHT' && c.is_active);
                        
                        const becameStarter = pHasActiveLeft && pHasActiveRight && !parentProfile.is_starter;
                        
                        // Evaluate New Rank
                        let newRank = parentProfile.rank || 'Member';
                        if (newLeft >= 250 && newRight >= 250) newRank = 'Blue Sapphire';
                        else if (newLeft >= 100 && newRight >= 100) newRank = 'Diamond';
                        else if (newLeft >= 31 && newRight >= 31) newRank = 'Platina';
                        else if (newLeft >= 15 && newRight >= 15) newRank = 'Gold';
                        else if (newLeft >= 7 && newRight >= 7) newRank = 'Silver';
                        else if (newLeft >= 3 && newRight >= 3) newRank = 'Bronze';
                        
                        const updates: any = {
                            [starterField]: (parentProfile[starterField] || 0) + 1,
                            rank: newRank,
                            rank_name: newRank
                        };
                        
                        if (becameStarter) {
                            updates.is_starter = true;
                            // continue incrementing for the next level up
                            shouldContinueIncrementing = true;
                        } else {
                            // stop incrementing starter counts for upper levels because this one was already a starter
                            // or didn't become one yet
                            shouldContinueIncrementing = false;
                        }
                        
                        await supabaseAdmin.from('profiles').update(updates).eq('id', parentId);
                    } else {
                        shouldContinueIncrementing = false;
                    }
                    
                    currentTracerId = parentId;
                }
            }
        }
    }

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
