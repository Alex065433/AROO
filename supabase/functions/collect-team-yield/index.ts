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

    // 1. AUTHENTICATION
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("UNAUTHORIZED");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) throw new Error("INVALID_SESSION");
    
    const userId = user.id;
    const { selectedNodeIds } = await req.json();

    if (!selectedNodeIds || !Array.isArray(selectedNodeIds) || selectedNodeIds.length === 0) {
      throw new Error("NO_NODES_SELECTED");
    }

    // 2. FETCH AND SUM PENDING YIELD
    const { data: collection, error: collErr } = await supabaseAdmin
        .from('team_collection')
        .select('id, node_id, pending_yield')
        .eq('uid', userId)
        .in('node_id', selectedNodeIds)
        .gt('pending_yield', 0);

    if (collErr) throw new Error(`FETCH_COLLECTION_FAILED: ${collErr.message}`);
    if (!collection || collection.length === 0) {
        return new Response(JSON.stringify({ success: true, message: "No pending yield found for selected nodes." }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    const totalToCollect = collection.reduce((sum, item) => sum + (Number(item.pending_yield) || 0), 0);

    // 3. ATOMIC UPDATES
    // A. Add to yield box (yield_income in profiles)
    const { data: profile, error: pErr } = await supabaseAdmin.from('profiles').select('yield_income, wallet_balance, network_yield_box').eq('id', userId).single();
    if (pErr || !profile) throw new Error("PROFILE_NOT_FOUND");

    const newYieldIncome = (Number(profile.yield_income || 0) + totalToCollect).toFixed(4);
    const newWalletBalance = (Number(profile.wallet_balance || 0) + totalToCollect).toFixed(4);

    await supabaseAdmin.from('profiles').update({ 
        yield_income: newYieldIncome,
        wallet_balance: newWalletBalance,
        network_yield_box: newYieldIncome // Syncing dual column if exists
    }).eq('id', userId);

    // Sync with user_wallets for backend compatibility
    const { data: wallet } = await supabaseAdmin.from('user_wallets').select('network_yield_box').eq('id', userId).single();
    if (wallet) {
        await supabaseAdmin.from('user_wallets').update({
            network_yield_box: (Number(wallet.network_yield_box || 0) + totalToCollect).toFixed(4),
            updated_at: new Date().toISOString()
        }).eq('id', userId);
    } else {
        await supabaseAdmin.from('user_wallets').insert({
            id: userId,
            network_yield_box: totalToCollect.toFixed(4)
        });
    }

    // B. Reset pending_yield in team_collection
    // Using a loop for precision since supabaseAdmin update doesn't support multiple where clauses in one batch easily for unique resets per ID without filter
    // But since they all belong to the same user and we have the IDs, we can update them in one go if they all go to 0.
    const recordIds = collection.map(item => item.id);
    await supabaseAdmin
        .from('team_collection')
        .update({ pending_yield: 0 })
        .in('id', recordIds);

    // C. Log Transaction
    await supabaseAdmin.from('transactions').insert({
        user_id: userId,
        amount: totalToCollect,
        type: 'YIELD_COLLECTION',
        status: 'completed',
        description: `Collected yield from ${collection.length} nodes: ${selectedNodeIds.join(', ')}`
    });

    return new Response(JSON.stringify({ 
        success: true, 
        message: `Successfully collected $${totalToCollect.toFixed(2)} from ${collection.length} nodes.`,
        collected_amount: totalToCollect,
        new_balance: newWalletBalance
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error("[COLLECT-TEAM-YIELD FAILURE]", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
