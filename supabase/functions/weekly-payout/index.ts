
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase Client with Service Role Key (needed for cron background processing)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log("Weekly Payout: Scanning qualified members...");

    // 1. Identify users qualifying for Rank Bonus (e.g., rank_level > 0 and weeks_paid < 52)
    const { data: members, error: fetchError } = await supabase
      .from('members')
      .select('id, rank_level, weeks_paid')
      .gt('rank_level', 0)
      .lt('weeks_paid', 52);

    if (fetchError) throw fetchError;

    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ message: "No qualified members for payout this week" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    const results = [];

    // 2. Map rank bonuses (Institutional standard: define in code or lookup table)
    const RANK_BONUSES: Record<number, number> = {
      1: 12,  // Executive: $12/week
      2: 25,  // Manager: $25/week
      3: 60,  // Director: $60/week
      4: 150, // President: $150/week
    };

    // 3. Process payouts sequentially or in batches (for demo, simple loop)
    for (const member of members) {
      const bonusAmount = RANK_BONUSES[member.rank_level] || 0;
      
      if (bonusAmount > 0) {
        // Increment weeks_paid and update total_earned
        const { error: updateError } = await supabase
          .from('members')
          .update({ 
            weeks_paid: member.weeks_paid + 1,
            total_earned: (member.total_earned || 0) + bonusAmount
          })
          .eq('id', member.id);

        if (!updateError) {
          // Log transaction
          await supabase.from('transactions').insert({
            user_id: member.id,
            amount: bonusAmount,
            type: 'WEEKLY_RANK_BONUS',
            description: `Week ${member.weeks_paid + 1} of 52 Rank Bonus payout`,
            status: 'completed'
          });
          results.push({ userId: member.id, status: "paid", amount: bonusAmount });
        } else {
          results.push({ userId: member.id, status: "failed", error: updateError.message });
        }
      }
    }

    return new Response(JSON.stringify({ 
      processed: results.length, 
      details: results 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400
    });
  }
});
