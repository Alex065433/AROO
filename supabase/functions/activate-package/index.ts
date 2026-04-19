
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { amount, userId } = body; // amount is total package price

    if (!amount || !userId) {
      throw new Error("Amount and User ID are required.");
    }

    const { data: masterProf, error: masterProfErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (masterProfErr || !masterProf) throw new Error("Master profile not found.");

    const numberOfNodes = Math.floor(amount / 50);
    const nodes: any[] = [userId]; // Node 1 is the Master

    // 1. Activate Master Node
    await supabaseAdmin.from('profiles').update({ is_active: true, active_package: amount, status: 'active' }).eq('id', userId);
    await supabaseAdmin.from('members').update({ is_active: true, total_investment: 50 }).eq('id', userId);

    // Initial Income for Master? (Only if it was referred)
    const { data: masterMember } = await supabaseAdmin.from('members').select('sponsor_id').eq('id', userId).single();
    if (masterMember?.sponsor_id) {
       await processIncomeProtocol(supabaseAdmin, userId, masterMember.sponsor_id, userId, 50);
    }

    // 2. Generate Sub-Nodes (Triangle Logic)
    for (let k = 2; k <= numberOfNodes; k++) {
        // Parent calculation for balanced triangle: parent of k is floor(k/2)
        const parentIdx = Math.floor(k / 2) - 1;
        const parentId = nodes[parentIdx];
        const side: 'LEFT' | 'RIGHT' = (k % 2 === 0) ? 'LEFT' : 'RIGHT';

        // Get Unique ARW ID
        const { data: seqVal } = await supabaseAdmin.rpc('get_next_operator_id');
        const operatorId = `ARW-${seqVal || Math.floor(100000 + Math.random() * 900000)}`;
        const internalEmail = `${operatorId.toLowerCase()}@arowin.internal`;

        // Create Auth
        const { data: subAuth, error: subAuthErr } = await supabaseAdmin.auth.admin.createUser({
            email: internalEmail,
            password: crypto.randomUUID(),
            email_confirm: true,
            user_metadata: { master_id: userId, operator_id: operatorId }
        });

        if (subAuthErr) throw subAuthErr;
        const subId = subAuth.user.id;
        nodes.push(subId);

        // Sync Data
        await supabaseAdmin.from('profiles').insert({
            id: subId,
            master_id: userId,
            operator_id: operatorId,
            name: `${masterProf.name} ID-${k-1}`,
            email: internalEmail,
            sponsor_id: parentId, // For internal routing
            parent_id: parentId,
            side: side,
            position: side.toLowerCase(),
            is_active: true,
            status: 'active',
            rank: 1
        });

        await supabaseAdmin.from('members').insert({
            id: subId,
            sponsor_id: parentId,
            placement_id: parentId,
            position: side,
            is_active: true,
            total_investment: 50
        });

        // Team Collection Visibility
        await supabaseAdmin.from('team_collection').insert({
            uid: userId,
            node_id: operatorId,
            node_id_uuid: subId,
            name: `${masterProf.name} ID-${k-1}`,
            balance: 0,
            eligible: true
        });

        // Income routing for this node creation
        await processIncomeProtocol(supabaseAdmin, subId, parentId, subId, 50);
    }

    // 3. Final Balance Sync (Master Wallet)
    // Assume wallet_balance in profiles
    const { data: latestProf } = await supabaseAdmin.from('profiles').select('wallet_balance').eq('id', userId).single();
    if (latestProf) {
      await supabaseAdmin.from('profiles').update({
        wallet_balance: Number(latestProf.wallet_balance) - amount
      }).eq('id', userId);
    }

    // Rank Achievement Checks for all created nodes
    for (const nodeUid of nodes) {
        await checkRankAchievement(supabaseAdmin, nodeUid);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      nodes_count: nodes.length,
      message: `Successfully activated ${nodes.length} nodes for ${masterProf.operator_id}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message, success: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});

/**
 * Income Protocol: Direct Referral (5%) and Binary Matching (10%)
 */
async function processIncomeProtocol(supabase: any, nodeId: string, sponsorId: string, sourceNodeUid: string, volume: number) {
    if (!sponsorId) return;

    // Resolve Master Owner for Income
    const { data: sProf } = await supabase.from('profiles').select('id, master_id').eq('id', sponsorId).single();
    const ownerId = sProf?.master_id || sponsorId;

    // 1. Direct Referral (5%)
    const directBonus = volume * 0.05;
    await logIncome(supabase, ownerId, sponsorId, directBonus, 'direct_referral', `Direct Referral Dividend`);

    // 2. Binary Matching (Recursive Flow)
    let currentId = nodeId;
    while (true) {
        const { data: member } = await supabase.from('members').select('placement_id, position').eq('id', currentId).maybeSingle();
        if (!member || !member.placement_id) break;

        const parentId = member.placement_id;
        const side = member.position;

        const { data: parentMember } = await supabase.from('members').select('*').eq('id', parentId).single();
        if (!parentMember) break;

        let leftPV = Number(parentMember.left_pv || 0);
        let rightPV = Number(parentMember.right_pv || 0);

        if (side === 'LEFT') leftPV += volume;
        else rightPV += volume;

        // Matching logic
        const match = Math.min(leftPV, rightPV);
        let matchingBonus = 0;
        if (match > 0) {
            matchingBonus = match * 0.10;
            leftPV -= match;
            rightPV -= match;

            const { data: pProf } = await supabase.from('profiles').select('id, master_id').eq('id', parentId).single();
            const pOwnerId = pProf?.master_id || parentId;

            // Apply Capping check here (Static placeholder: $250 for Starter)
            // ... (ommited for brevity but logic would go here)

            await logIncome(supabase, pOwnerId, parentId, matchingBonus, 'binary_matching', `Binary Matching Dividend`);
        }

        // Update Tree Data
        await supabase.from('members').update({
            left_pv: leftPV,
            right_pv: rightPV,
            total_earned: Number(parentMember.total_earned || 0) + matchingBonus
        }).eq('id', parentId);

        currentId = parentId;
    }
}

async function logIncome(supabase: any, masterId: string, earningNodeId: string, amount: number, type: string, description: string) {
    // 1. Raw Ledger
    await supabase.from('income_ledger').insert({
        user_id: masterId,
        earned_by_node_id: earningNodeId,
        amount: amount,
        type: type,
        description: description
    });

    // 2. Claimable Balance in Members
    const { data: currentMem } = await supabase.from('members').select('claimable_balance').eq('id', earningNodeId).single();
    await supabase.from('members').update({
        claimable_balance: Number(currentMem?.claimable_balance || 0) + amount
    }).eq('id', earningNodeId);

    // 3. Update team_collection balance for UI
    const { data: currentTc } = await supabase.from('team_collection').select('balance').eq('node_id_uuid', earningNodeId).maybeSingle();
    if (currentTc) {
        await supabase.from('team_collection').update({
            balance: Number(currentTc.balance || 0) + amount
        }).eq('node_id_uuid', earningNodeId);
    }
}

async function checkRankAchievement(supabase: any, nodeId: string) {
    // Basic Starter Logic: 1L and 1R active direct referrals
    // In this complex pack system, internal children count
    const { data: children } = await supabase.from('profiles').select('side').eq('parent_id', nodeId);
    const leftCount = children?.filter((c: any) => c.side === 'LEFT').length || 0;
    const rightCount = children?.filter((c: any) => c.side === 'RIGHT').length || 0;

    if (leftCount >= 1 && rightCount >= 1) {
        // Upgrade to Starter (Rank 2)
        const { data: prof } = await supabase.from('profiles').select('rank').eq('id', nodeId).single();
        if (prof && prof.rank < 2) {
            await supabase.from('profiles').update({ rank: 2 }).eq('id', nodeId);
            // Weekly Rank Bonus logic placeholder...
        }
    }
}
