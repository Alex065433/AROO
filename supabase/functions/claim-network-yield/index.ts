
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.12.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * claim-network-yield: Sweep all PENDING dividends from sub-nodes to Master Vault.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Identify Master Node from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error("Authentication missing.");

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: masterUser }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !masterUser) throw new Error("Invalid session context.");

    const masterId = masterUser.id;

    // 2. Map Clan of Owned Nodes
    // In profiles, sub-nodes are mapped with sponsor_id = Master Node ID
    const { data: ownedNodes, error: nodesErr } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('sponsor_id', masterId);

    if (nodesErr) throw nodesErr;
    const nodeIds = [masterId, ...(ownedNodes?.map(n => n.id) || [])];

    // 3. Aggregate Pending Dividends
    // Sum is calculated based on incomes earned by ANY node in the master's family
    const { data: ledgerRecords, error: ledgerErr } = await supabaseAdmin
      .from('income_ledger')
      .select('id, amount')
      .in('user_id', nodeIds)
      .eq('status', 'PENDING');

    if (ledgerErr) throw ledgerErr;

    const totalSum = ledgerRecords?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;

    if (totalSum <= 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "No yield to claim", 
        message: "No pending dividends were found for your node network."
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 4. Sequential Transactional Sweep
    // A. Fund Master Vault
    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from('user_wallets')
      .select('master_vault')
      .eq('id', masterId)
      .single();

    if (walletErr || !wallet) throw new Error("Account rejected: Master wallet unavailable.");

    // Update Master Vault
    await supabaseAdmin
      .from('user_wallets')
      .update({ master_vault: Number(wallet.master_vault || 0) + totalSum })
      .eq('id', masterId);

    // Record in Transactions Table for UI Reflection
    await supabaseAdmin.from('transactions').insert({
        user_id: masterId,
        amount: totalSum,
        type: 'claim',
        description: `Sweep: Collected ${totalSum} USDT from node family`,
        status: 'COMPLETED'
    });

    // B. Claim Specific Ledger Records
    const recordIds = ledgerRecords.map(r => r.id);
    await supabaseAdmin
      .from('income_ledger')
      .update({ status: 'CLAIMED' })
      .in('id', recordIds);

    // 5. Success Payload
    return new Response(JSON.stringify({ 
      success: true, 
      claimed_amount: totalSum, 
      message: "Swept to Master Vault" 
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
