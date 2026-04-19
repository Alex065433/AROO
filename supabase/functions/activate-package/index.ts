
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

console.log("[ACTIVATE-PACKAGE] Protocol v4.0 Multi-Node Engine Booted.");

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Authorization required');
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) throw new Error('Invalid session validation');

    const { amount, targetUserId } = await req.json();
    const finalTargetUid = targetUserId || user.id;

    if (!amount || amount < 50 || amount % 50 !== 0) {
      throw new Error("PROTOCOL ERROR: Activation amount must be a multiple of 50 USDT.");
    }

    const numberOfNodes = Math.floor(amount / 50);
    const PV_PER_NODE = 50;

    // 1. Fetch Master Node Profile
    const { data: masterProfile, error: masterErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', finalTargetUid)
      .single();

    if (masterErr || !masterProfile) throw new Error("INFRASTRUCTURE FAILURE: Target node signature not found.");

    // Balance Verification
    const currentBalance = Number(masterProfile.wallet_balance || 0);
    if (currentBalance < amount) {
      throw new Error(`LIQUIDITY REJECTION: Insufficient balance. Required: ${amount}, Available: ${currentBalance}`);
    }

    // --- INTERNAL ENGINES ---

    /**
     * Engine A: Extreme Spillover Search
     */
    const findExtremePlacement = async (rootId: string, side: 'LEFT' | 'RIGHT'): Promise<{ parentId: string, side: 'LEFT' | 'RIGHT' }> => {
      let currentId = rootId;
      while (true) {
        const { data: child } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('parent_id', currentId)
          .eq('side', side)
          .maybeSingle();

        if (!child) return { parentId: currentId, side: side };
        currentId = child.id;
      }
    };

    /**
     * Engine B: Income Distribution with Master Rollup & Precise Categorization
     */
    const processIncomes = async (nodeId: string, sponsorId: string, volume: number) => {
      // Robust Null Check for Sponsor
      if (!sponsorId) {
        console.log(`[INCOME] Node ${nodeId} has no sponsor (SYSTEM ROOT). Skipping income distribution.`);
        return;
      }

      // 1. Direct Referral Bonus (5%)
      const directBonus = volume * 0.05;
      
      // Credit Sponsor (ALWAYS Rollup to Sponsor's Master Account if sponsor is a sub-node)
      const { data: sponsorProfile } = await supabaseAdmin.from('profiles').select('id, master_id').eq('id', sponsorId).maybeSingle();
      if (sponsorProfile) {
        const walletTargetId = sponsorProfile.master_id || sponsorProfile.id;
        
        const { data: walletOwner } = await supabaseAdmin.from('profiles').select('wallet_balance, total_income').eq('id', walletTargetId).single();
        if (walletOwner) {
          await supabaseAdmin.from('profiles').update({
            wallet_balance: Number(walletOwner.wallet_balance) + directBonus,
            total_income: Number(walletOwner.total_income) + directBonus
          }).eq('id', walletTargetId);

          // Categorized Transaction
          await supabaseAdmin.from('transactions').insert({
            user_id: walletTargetId, uid: walletTargetId, amount: directBonus,
            type: 'direct_referral', 
            description: `Direct Referral Dividend from Node Activation: ${nodeId}`, 
            status: 'completed',
            created_at: new Date().toISOString()
          });
        }
      }

      // 2. Binary Matching PV Flow (10% on Match)
      let currentId = nodeId;
      while (true) {
        const { data: member } = await supabaseAdmin.from('members').select('placement_id, position').eq('id', currentId).maybeSingle();
        if (!member || !member.placement_id) break;

        const parentId = member.placement_id;
        const side = member.position;

        const { data: parentMember } = await supabaseAdmin.from('members').select('*').eq('id', parentId).single();
        if (!parentMember) break;

        let leftPV = Number(parentMember.left_pv || 0);
        let rightPV = Number(parentMember.right_pv || 0);

        if (side === 'LEFT') leftPV += volume;
        else rightPV += volume;

        // Auto-Matching logic (1:1)
        const match = Math.min(leftPV, rightPV);
        let matchingCommission = 0;
        if (match > 0) {
          matchingCommission = match * 0.10;
          leftPV -= match;
          rightPV -= match;

          // Wallet Rollup for Match
          const { data: parentProfile } = await supabaseAdmin.from('profiles').select('id, master_id').eq('id', parentId).maybeSingle();
          const pWalletId = parentProfile?.master_id || parentId;
          
          const { data: pWallet } = await supabaseAdmin.from('profiles').select('wallet_balance, total_income').eq('id', pWalletId).maybeSingle();
          if (pWallet) {
              await supabaseAdmin.from('profiles').update({
                wallet_balance: Number(pWallet.wallet_balance) + matchingCommission,
                total_income: Number(pWallet.total_income) + matchingCommission
              }).eq('id', pWalletId);

              // Categorized Transaction
              await supabaseAdmin.from('transactions').insert({
                user_id: pWalletId, uid: pWalletId, amount: matchingCommission,
                type: 'binary_matching', 
                description: `Binary Matching Dividend (Matched ${match} PV)`, 
                status: 'completed',
                created_at: new Date().toISOString()
              });
          }
        }

        // Update Member Record
        await supabaseAdmin.from('members').update({
          left_pv: leftPV,
          right_pv: rightPV,
          total_earned: Number(parentMember.total_earned || 0) + matchingCommission
        }).eq('id', parentId);

        currentId = parentId;
      }
    };

    // --- EXECUTION PHASE ---

    // 1. Activate Master Node (Node 1)
    const protocolNodes = [finalTargetUid];
    const newBalance = currentBalance - amount;
    
    await supabaseAdmin.from('profiles').update({
      wallet_balance: newBalance,
      is_active: true,
      status: 'active',
      active_package: amount,
      activated_at: new Date().toISOString()
    }).eq('id', finalTargetUid);

    await supabaseAdmin.from('members').update({
      is_active: true,
      total_investment: amount
    }).eq('id', finalTargetUid);

    // Initial Master Collection Entry
    await supabaseAdmin.from('team_collection').insert({
        uid: finalTargetUid,
        node_id: masterProfile.operator_id,
        name: `${masterProfile.name} (MASTER)`,
        balance: 0,
        eligible: true
    });

    // Master Node Income Distribution
    const { data: masterMember } = await supabaseAdmin.from('members').select('sponsor_id').eq('id', finalTargetUid).single();
    await processIncomes(finalTargetUid, masterMember?.sponsor_id, PV_PER_NODE);

    // 2. Multi-Node Generation (Triangle Build)
    if (numberOfNodes > 1) {
        console.log(`[MULTI-NODE] Generating ${numberOfNodes - 1} sub-nodes for ${masterProfile.operator_id}`);
        
        for (let i = 1; i < numberOfNodes; i++) {
            // Find Sponsor (Immediate parent in generated triangle)
            const parentIdx = Math.floor((i - 1) / 2);
            const triangleSponsorId = protocolNodes[parentIdx];
            const triangleSide: 'LEFT' | 'RIGHT' = (i % 2 === 1) ? 'LEFT' : 'RIGHT';

            // Find Physical Placement (Extreme Spillover)
            const placement = await findExtremePlacement(triangleSponsorId, triangleSide);

            const subOperatorId = `${masterProfile.operator_id}-${i}`;
            const subEmail = `${subOperatorId.toLowerCase()}@arowin.internal`;

            // Create Sub-node Auth Record
            const { data: subAuth } = await supabaseAdmin.auth.admin.createUser({
              email: subEmail,
              password: 'PROTO_SUB_' + Math.random(),
              email_confirm: true,
              user_metadata: { master_id: finalTargetUid, is_node: true }
            });

            if (subAuth?.user) {
               const subUid = subAuth.user.id;
               protocolNodes.push(subUid);

               // Profile
               await supabaseAdmin.from('profiles').insert({
                 id: subUid,
                 master_id: finalTargetUid,
                 operator_id: subOperatorId,
                 name: `${masterProfile.name} (ID-${i})`,
                 email: subEmail,
                 sponsor_id: triangleSponsorId,
                 parent_id: placement.parentId,
                 side: placement.side,
                 position: placement.side.toLowerCase(),
                 is_active: true,
                 status: 'active',
                 rank: 1
               });

               // Member
               await supabaseAdmin.from('members').insert({
                 id: subUid,
                 sponsor_id: triangleSponsorId,
                 placement_id: placement.parentId,
                 position: placement.side,
                 is_active: true,
                 total_investment: 50,
                 master_account_id: finalTargetUid // Link to master account
               });

               // Team Collection Entry
               await supabaseAdmin.from('team_collection').insert({
                   uid: finalTargetUid, // Link to MASTER profile
                   node_id: subOperatorId,
                   name: `${masterProfile.name} (Sub-${i})`,
                   balance: 0,
                   eligible: true
               });

               // Income processing for each node
               await processIncomes(subUid, triangleSponsorId, PV_PER_NODE);
            }
        }
    }

    // Ledger Transaction for original purchase
    await supabaseAdmin.from('transactions').insert({
      user_id: finalTargetUid, uid: finalTargetUid, amount: -amount,
      type: 'package_activation',
      description: `Package Activation: Family Pack (${numberOfNodes} Nodes)`,
      status: 'completed',
      created_at: new Date().toISOString()
    });

    return new Response(JSON.stringify({ 
      success: true, 
      nodes_active: numberOfNodes,
      new_balance: newBalance
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error(`[ACTIVATE-PACKAGE FATAL]: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message, success: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
