
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.12.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * activate-package: Multi-Node Generation, Internal Sponsoring, and ROI Tracking
 */
serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error("Authentication credential missing.");

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !authUser) throw new Error("Invalid or expired session.");

    const body = await req.json();
    const amount = Number(body.amount);
    if (!amount || amount < 50) throw new Error("Protocol failure: Valid package amount required ($50 minimum).");

    const userId = authUser.id;

    // 1. Liquidity Check & Wallet Deduction
    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from('voxmeta_wallets')
      .select('master_vault')
      .eq('id', userId)
      .single();

    if (walletErr || !wallet) throw new Error("Security Rejection: Wallet initialization missing.");
    if (Number(wallet.master_vault) < amount) {
      throw new Error(`Liquidity Rejection: Insufficient funds. Need: ${amount}, Have: ${wallet.master_vault}`);
    }

    // Atomic Deduction (Simulated)
    const { error: deductErr } = await supabaseAdmin
      .from('voxmeta_wallets')
      .update({ master_vault: Number(wallet.master_vault) - amount })
      .eq('id', userId);
    if (deductErr) throw deductErr;

    // 2. Binary Heap Generation (Triangle Logic)
    const NODE_COST = 50;
    const numberOfNodes = Math.floor(amount / NODE_COST);
    const nodeUids: string[] = [userId]; // Master Node is index 0 (Heap Node 1)

    // Activate Master Node
    await supabaseAdmin.from('profiles').update({ status: 'active', is_active: true, active_package: amount }).eq('id', userId);
    await supabaseAdmin.from('members').update({ is_active: true, total_investment: NODE_COST }).eq('id', userId);

    // Initial ROI Tracking for Master
    await supabaseAdmin.from('daily_roi_tracking').insert({
      user_id: userId,
      node_id: userId,
      activation_amount: NODE_COST,
      daily_percent: 0.5,
      max_limit: 100
    });

    // 3. Multi-Node Expansion
    if (numberOfNodes > 1) {
      for (let i = 2; i <= numberOfNodes; i++) {
        // Parent calculation in binary heap: Parent of node i is node at floor(i/2)
        const parentIdx = Math.floor(i / 2) - 1;
        const parentUid = nodeUids[parentIdx];
        const side: 'LEFT' | 'RIGHT' = (i % 2 === 0) ? 'LEFT' : 'RIGHT';

        // ARW- Protocol ID
        const { data: seqVal } = await supabaseAdmin.rpc('get_next_operator_id');
        const operatorId = `ARW-${seqVal || Math.floor(100000 + Math.random() * 900000)}`;

        // Internal sub-node registration
        const ts = Date.now();
        const baseEmail = authUser.email?.split('@')[0];
        const subEmail = `${baseEmail}+node${i}_${ts}@voxmeta-internal.com`;

        const { data: subAuth, error: subAuthErr } = await supabaseAdmin.auth.admin.createUser({
          email: subEmail,
          password: crypto.randomUUID(),
          email_confirm: true,
          user_metadata: { master_id: userId, operator_id: operatorId }
        });

        if (subAuthErr) throw subAuthErr;
        const subId = subAuth.user.id;
        nodeUids.push(subId);

        // --- THE TEAM COLLECTION FIX (PROFILES) ---
        // Mapping: ALL sub-nodes are sponsored by the Master ID
        await supabaseAdmin.from('profiles').insert({
          id: subId,
          master_id: userId,
          operator_id: operatorId,
          name: `${authUser.user_metadata?.name || 'User'} (ID ${i})`,
          email: subEmail,
          sponsor_id: userId, // Direct link to Master Node for Dashboard Tracking
          parent_id: parentUid,
          side: side,
          position: side.toLowerCase(),
          is_active: true,
          status: 'active',
          active_package: NODE_COST
        });

        // --- BINARY TREE FIX (MEMBERS) ---
        // Mapping: Sponsor and Placement are IMMEDIATE Internal Parents
        await supabaseAdmin.from('members').insert({
          id: subId,
          master_account_id: userId,
          sponsor_id: parentUid, // Mathematical parent in the binary triangle
          placement_id: parentUid,
          position: side,
          is_active: true,
          total_investment: NODE_COST
        });

        // 4. Internal Incomes Logic
        const bonus = NODE_COST * 0.05; // $2.50
        await supabaseAdmin.from('income_ledger').insert({
          user_id: userId, // Accrues to the Master's Ledger
          earned_by_node_id: parentUid,
          amount: bonus,
          type: 'direct_referral',
          description: `Internal Referral Bonus for placement of node ${i}`,
          status: 'PENDING'
        });

        // 5. Daily ROI for Sub-node
        await supabaseAdmin.from('daily_roi_tracking').insert({
          user_id: userId,
          node_id: subId,
          activation_amount: NODE_COST,
          daily_percent: 0.5,
          max_limit: 100
        });
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Package activated", 
      nodes_generated: numberOfNodes 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
