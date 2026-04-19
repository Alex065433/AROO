
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

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

    const body = await req.json();
    const { amount, userId: passedUserId } = body;

    // Use passed userId or get from auth token
    const authHeader = req.headers.get('Authorization');
    let userId = passedUserId;
    if (!userId && authHeader) {
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
      if (!authError && user) userId = user.id;
    }

    if (!userId) throw new Error("User ID is required for activation.");
    if (!amount || amount < 50) throw new Error("Invalid activation amount.");

    const numberOfNodes = Math.floor(amount / 50);
    const PV_PER_NODE = 50;

    console.log(`[ACTIVATE] Activating ${numberOfNodes} nodes for User ID: ${userId}`);

    // 1. Fetch Master Profile & Member
    const { data: masterProf, error: masterProfError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (masterProfError || !masterProf) throw new Error("Master profile not found.");

    // Balance check (optional, usually handled by caller, but good for safety)
    const currentBalance = Number(masterProf.wallet_balance || 0);
    if (currentBalance < amount) {
      throw new Error(`Insufficient balance. Required: ${amount}, Available: ${currentBalance}`);
    }

    // --- INCOME ENGINE HELPER ---
    const processIncomes = async (nodeId: string, sponsorId: string, earnedByNodeUid: string) => {
      if (!sponsorId) return;

      // Master Account is the owner of the earning node (if it's a sub-node)
      // We look up the masterId of the sponsor
      const { data: sponsorMember } = await supabaseAdmin
        .from('members')
        .select('master_account_id')
        .eq('id', sponsorId)
        .maybeSingle();
      
      const sponsorMasterId = sponsorMember?.master_account_id || sponsorId;

      // A. Direct Referral (5%)
      const directBonus = 50 * 0.05; // $2.50
      await supabaseAdmin.from('incomes').insert({
        user_id: sponsorMasterId,
        earned_by_node_id: sponsorId, // Note: The sponsorId earned this referral bonus
        amount: directBonus,
        type: 'direct_referral',
        description: `Direct Referral from node ${earnedByNodeUid}`,
        status: 'pending'
      });

      // Update team_collection balance for the earning node
      const { data: currentTc } = await supabaseAdmin
        .from('team_collection')
        .select('balance')
        .eq('node_id_uuid', sponsorId)
        .maybeSingle();
      
      if (currentTc) {
        await supabaseAdmin
          .from('team_collection')
          .update({ balance: Number(currentTc.balance || 0) + directBonus })
          .eq('node_id_uuid', sponsorId);
      }

      // B. Binary Matching (10%)
      // Flow 50 PV upwards
      let currentId = nodeId;
      while (true) {
        const { data: currentMember } = await supabaseAdmin
          .from('members')
          .select('placement_id, position')
          .eq('id', currentId)
          .maybeSingle();
        
        if (!currentMember || !currentMember.placement_id) break;

        const parentId = currentMember.placement_id;
        const side = currentMember.position;

        const { data: parentMember, error: pError } = await supabaseAdmin
          .from('members')
          .select('*')
          .eq('id', parentId)
          .single();

        if (pError || !parentMember) break;

        let leftPV = Number(parentMember.left_pv || 0);
        let rightPV = Number(parentMember.right_pv || 0);

        if (side === 'LEFT') leftPV += 50;
        else rightPV += 50;

        // Matching logic
        const match = Math.min(leftPV, rightPV);
        let bonus = 0;
        if (match > 0) {
          bonus = match * 0.10; // 10% match
          leftPV -= match;
          rightPV -= match;

          // Resolve parent's master account
          const { data: pMemInfo } = await supabaseAdmin
            .from('members')
            .select('master_account_id')
            .eq('id', parentId)
            .maybeSingle();
          const pMasterId = pMemInfo?.master_account_id || parentId;

          await supabaseAdmin.from('incomes').insert({
            user_id: pMasterId,
            earned_by_node_id: parentId,
            amount: bonus,
            type: 'binary_matching',
            description: `Binary matching bonus of 10% on matched PV ${match}`,
            status: 'pending'
          });

          // Update team_collection balance for the parent node
          const { data: pTc } = await supabaseAdmin
            .from('team_collection')
            .select('balance')
            .eq('node_id_uuid', parentId)
            .maybeSingle();
          
          if (pTc) {
            await supabaseAdmin
              .from('team_collection')
              .update({ balance: Number(pTc.balance || 0) + bonus })
              .eq('node_id_uuid', parentId);
          }
        }

        // Update parent volume
        await supabaseAdmin.from('members').update({
          left_pv: leftPV,
          right_pv: rightPV,
          total_earned: Number(parentMember.total_earned || 0) + bonus
        }).eq('id', parentId);

        currentId = parentId;
      }
    };

    // --- MULTI-NODE GENERATION ---
    const generatedNodeIds = [userId]; // Node 1 at index 0 (if we using 0-based for array storage)
    
    // 2. Activate Master Node (Node 1)
    await supabaseAdmin.from('profiles').update({ is_active: true, status: 'active', active_package: amount }).eq('id', userId);
    await supabaseAdmin.from('members').update({ is_active: true, total_investment: 50 }).eq('id', userId);

    // Ensure Master Node (Node 1) is in team_collection
    await supabaseAdmin.from('team_collection').upsert({
        uid: userId,
        node_id: masterProf.operator_id,
        node_id_uuid: userId,
        name: `${masterProf.name} (MASTER)`,
        balance: 0,
        eligible: true
    }, { onConflict: 'node_id_uuid' });

    // Initial income for Master (Node 1)
    const { data: masterMember } = await supabaseAdmin.from('members').select('sponsor_id').eq('id', userId).single();
    if (masterMember?.sponsor_id) {
        await processIncomes(userId, masterMember.sponsor_id, userId);
    }

    // 3. Generate and Place Sub-nodes
    for (let k = 2; k <= numberOfNodes; k++) {
        const parentIdxInArray = Math.floor(k / 2) - 1;
        const parentId = generatedNodeIds[parentIdxInArray];
        const side: 'LEFT' | 'RIGHT' = (k % 2 === 0) ? 'LEFT' : 'RIGHT';

        const nodeOpId = `${masterProf.operator_id}-${k-1}`;
        const internalEmail = `${nodeOpId.toLowerCase()}@arowin.internal`;

        // Create Auth
        const { data: subAuth, error: subAuthError } = await supabaseAdmin.auth.admin.createUser({
            email: internalEmail,
            password: `NODE_SECURE_${Math.random().toString(36).slice(-8)}`,
            email_confirm: true,
            user_metadata: { master_account_id: userId, operator_id: nodeOpId, is_sub_node: true }
        });

        if (subAuthError) throw subAuthError;
        const subUserId = subAuth.user.id;
        generatedNodeIds.push(subUserId);

        // Profile insert
        await supabaseAdmin.from('profiles').insert({
            id: subUserId,
            operator_id: nodeOpId,
            name: `${masterProf.name} ID-${k-1}`,
            email: internalEmail,
            sponsor_id: parentId,
            parent_id: parentId,
            side: side,
            position: side.toLowerCase(),
            is_active: true,
            status: 'active',
            role: 'user',
            created_at: new Date().toISOString()
        });

        // Member insert with master_account_id
        await supabaseAdmin.from('members').insert({
            id: subUserId,
            sponsor_id: parentId,
            placement_id: parentId,
            position: side,
            is_active: true,
            total_investment: 50,
            master_account_id: userId,
            created_at: new Date().toISOString()
        });

        // Team Collection Sync (if table exists)
        await supabaseAdmin.from('team_collection').insert({
            uid: userId,
            node_id: nodeOpId,
            node_id_uuid: subUserId,
            name: `${masterProf.name} ID-${k-1}`,
            balance: 0,
            eligible: true
        });

        // Process income for this individual sub-node
        await processIncomes(subUserId, parentId, subUserId);
    }

    // 4. Update Wallet Balance for Master Node (minus total package cost)
    await supabaseAdmin.from('profiles').update({
        wallet_balance: currentBalance - amount
    }).eq('id', userId);

    // Log Global Activation
    await supabaseAdmin.from('transactions').insert({
        uid: userId,
        user_id: userId,
        amount: -amount,
        type: 'package_activation',
        description: `Package Activation $${amount} (${numberOfNodes} IDs generated)`,
        status: 'completed'
    });

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Successfully activated package with ${numberOfNodes} nodes.`,
      nodes: generatedNodeIds
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("[ACTIVATE-PACKAGE FATAL]:", error.message);
    return new Response(JSON.stringify({ error: error.message, success: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
