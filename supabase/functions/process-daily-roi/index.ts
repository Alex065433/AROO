import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // 1. Fetch Active ROI Records
    const { data: activeRois, error: roiErr } = await supabaseAdmin
      .from("daily_roi_tracking")
      .select("*")
      .eq("status", "ACTIVE")
      .lt("total_days_paid", 200); // Only process if below max_days

    if (roiErr) throw roiErr;

    let processedCount = 0;
    let paidCount = 0;
    let stoppedCount = 0;
    let completedCount = 0;

    if (activeRois && activeRois.length > 0) {
      for (const roi of activeRois) {
        processedCount++;
        
        // 2. CHECK STOP CONDITION: Any MATCHING_BONUS in ledger for this USER?
        // Note: The prompt says "if a node earns". We check if this user has received any matching bonus.
        // In a perfect triangle, Node 1 receives matching from sub-nodes.
        const { count: matchingCount, error: ledgerCheckErr } = await supabaseAdmin
          .from("income_ledger")
          .select("*", { count: "exact", head: true })
          .eq("user_id", roi.user_id)
          .eq("type", "MATCHING_BONUS");

        if (ledgerCheckErr) {
          console.error(`[ROI ERROR] Failed checking ledger for ${roi.user_id}:`, ledgerCheckErr.message);
          continue;
        }

        if (false) { // Condition removed: Matching bonus does not stop ROI in this version
          // STOP ROI for this node permanently
          await supabaseAdmin
            .from("daily_roi_tracking")
            .update({ status: "STOPPED", updated_at: new Date().toISOString() })
            .eq("id", roi.id);
          
          stoppedCount++;
        } else {
          // 3. PAY ROI: 0.5% of activation_amount
          const dailyPercent = 0.005; // 0.5%
          const amountToPay = Number(roi.activation_amount) * dailyPercent;
          const nextDaysCount = Number(roi.total_days_paid) + 1;
          const isNowCompleted = nextDaysCount >= Number(roi.max_days);

          // Update Team Collection: Add to pending_yield
          const { data: teamCol, error: tColErr } = await supabaseAdmin
            .from("team_collection")
            .select("id, pending_yield")
            .eq("uid", roi.user_id)
            .eq("node_id", roi.node_id)
            .single();

          if (tColErr && tColErr.code !== 'PGRST116') { // PGRST116 is not found
            console.error(`[ROI ERROR] Team collection fetch error for ${roi.user_id}:`, tColErr.message);
            continue;
          }

          if (!teamCol) {
            // Create record if it doesn't exist
            await supabaseAdmin.from("team_collection").insert({
                uid: roi.user_id,
                node_id: roi.node_id,
                pending_yield: amountToPay,
                updated_at: new Date().toISOString()
            });
          } else {
            // Update existing
            await supabaseAdmin.from("team_collection").update({
                pending_yield: Number(teamCol.pending_yield || 0) + amountToPay,
                updated_at: new Date().toISOString()
            }).eq("id", teamCol.id);
          }

          // Record in Income Ledger (as pending)
          await supabaseAdmin.from("income_ledger").insert({
            user_id: roi.user_id,
            earned_by_node_id: roi.node_id,
            amount: amountToPay,
            type: "DAILY_ROI_PENDING",
            description: `Daily ROI Payout (Day ${nextDaysCount}/200)`,
            status: "PENDING_COLLECTION"
          });

          // Update ROI Tracking
          await supabaseAdmin
            .from("daily_roi_tracking")
            .update({ 
              total_days_paid: nextDaysCount,
              status: isNowCompleted ? "COMPLETED" : "ACTIVE",
              updated_at: new Date().toISOString()
            })
            .eq("id", roi.id);

          paidCount++;
          if (isNowCompleted) completedCount++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        paid: paidCount,
        stopped: stoppedCount,
        completed: completedCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("[DAILY-ROI-ERROR]:", error.message);
    return new Response(
      JSON.stringify({ error: error.message, success: false }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
