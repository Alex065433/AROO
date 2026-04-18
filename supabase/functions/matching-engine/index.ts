
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

    const { userId, volume } = await req.json();
    if (!userId || !volume) throw new Error("Missing required parameters: userId and volume");

    console.log(`[BINARY ENGINE] Processing volume ${volume} for user ${userId}`);

    let currentId = userId;
    
    // Traverse up the placement tree
    while (true) {
        // Find placement node
        const { data: member, error: memberError } = await supabaseAdmin
          .from('members')
          .select('placement_id, position')
          .eq('id', currentId)
          .single();

        if (memberError || !member || !member.placement_id) {
            console.log(`[BINARY ENGINE] Reached root or node not found for ${currentId}. Ending traversal.`);
            break;
        }

        const parentId = member.placement_id;
        const side = member.position; // 'LEFT' or 'RIGHT'

        // Fetch parent's PV data
        const { data: parent, error: parentError } = await supabaseAdmin
          .from('members')
          .select('left_pv, right_pv, carry_forward_pv, total_earned')
          .eq('id', parentId)
          .single();

        if (parentError || !parent) {
            console.error(`[BINARY ENGINE] Parent ${parentId} not found in members table.`);
            break;
        }

        let leftPV = Number(parent.left_pv || 0);
        let rightPV = Number(parent.right_pv || 0);

        // Update sides
        if (side === 'LEFT') leftPV += volume;
        else rightPV += volume;

        // Matching Logic: 10% of the matching volume
        const matchingVolume = Math.min(leftPV, rightPV);
        let commission = 0;

        if (matchingVolume > 0) {
            commission = matchingVolume * 0.10; // 10% matching fee
            leftPV -= matchingVolume;
            rightPV -= matchingVolume;

            console.log(`[BINARY MATCH] Matched ${matchingVolume} PV for parent ${parentId}. Commission: $${commission}`);

            // Update parent's wallet and total earned
            const { data: profile, error: profError } = await supabaseAdmin
              .from('profiles')
              .select('wallet_balance, wallets, total_income')
              .eq('id', parentId)
              .single();

            if (!profError && profile) {
                const newBalance = (Number(profile.wallet_balance) || 0) + commission;
                const newTotalIncome = (Number(profile.total_income) || 0) + commission;
                
                const updatedWallets = { ...profile.wallets };
                if (updatedWallets.master) {
                    updatedWallets.master.balance = newBalance;
                }

                await supabaseAdmin
                  .from('profiles')
                  .update({
                      wallet_balance: newBalance,
                      total_income: newTotalIncome,
                      wallets: updatedWallets
                  })
                  .eq('id', parentId);

                // Log matching commission
                await supabaseAdmin.from('transactions').insert({
                    user_id: parentId,
                    uid: parentId,
                    amount: commission,
                    type: 'matching',
                    description: `Binary Matching Dividend: 10% on ${matchingVolume} PV`,
                    status: 'completed'
                });
            }
        }

        // Update parent volume in members table
        await supabaseAdmin
          .from('members')
          .update({
              left_pv: leftPV,
              right_pv: rightPV,
              total_earned: (Number(parent.total_earned) || 0) + commission
          })
          .eq('id', parentId);

        // Move up to next level
        currentId = parentId;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error(`[BINARY ENGINE FATAL]: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
