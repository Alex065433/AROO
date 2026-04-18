
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log("[ROI ENGINE] Initiating daily yield distribution...");

    // 1. Fetch all active nodes
    const { data: activeNodes, error: fetchError } = await supabaseAdmin
      .from('members')
      .select('id, total_investment')
      .eq('is_active', true)
      .gt('total_investment', 0);

    if (fetchError) throw fetchError;
    if (!activeNodes || activeNodes.length === 0) {
      return new Response(JSON.stringify({ message: "No active nodes found for yield distribution." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];

    // 2. Iterate through nodes and distribute 0.5% ROI
    for (const node of activeNodes) {
      const dailyYield = Number(node.total_investment) * 0.005; // 0.5% daily
      
      if (dailyYield > 0) {
        // Fetch User Profile for current balances
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('wallet_balance, wallets, total_income, yield_balance')
          .eq('id', node.id)
          .single();

        if (profile) {
          const newYieldTotal = (Number(profile.yield_balance) || 0) + dailyYield;
          const newMasterBalance = (Number(profile.wallet_balance) || 0) + dailyYield;
          const newTotalIncome = (Number(profile.total_income) || 0) + dailyYield;

          const updatedWallets = { ...profile.wallets };
          if (!updatedWallets.yield) updatedWallets.yield = { balance: 0, currency: 'USDT' };
          updatedWallets.yield.balance = (Number(updatedWallets.yield.balance) || 0) + dailyYield;
          
          if (updatedWallets.master) {
             updatedWallets.master.balance = newMasterBalance;
          }

          // Update Ledger
          await supabaseAdmin
            .from('profiles')
            .update({
              wallet_balance: newMasterBalance,
              yield_balance: newYieldTotal,
              total_income: newTotalIncome,
              wallets: updatedWallets
            })
            .eq('id', node.id);

          // Log Yield Transaction
          await supabaseAdmin.from('transactions').insert({
            user_id: node.id,
            uid: node.id,
            amount: dailyYield,
            type: 'yield',
            description: `Daily Node Yield (0.5% on $${node.total_investment})`,
            status: 'completed'
          });

          results.push({ userId: node.id, yield: dailyYield });
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processed: results.length,
      total_yield_distributed: results.reduce((acc, curr) => acc + curr.yield, 0)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[ROI FATAL]: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});
