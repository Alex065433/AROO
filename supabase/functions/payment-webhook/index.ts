import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl!, supabaseServiceRoleKey!);
    
    // NOWPayments sends IPN as a POST request with a form-encoded or JSON body
    // Usually it's JSON if configured correctly, but let's handle both or assume JSON for now
    const body = await req.json();
    console.log("IPN Received:", JSON.stringify(body));

    const { payment_status, pay_amount, price_amount, order_id, payment_id } = body;

    if (payment_status === "finished") {
      const uid = order_id; // We used user_id as order_id in create-payment

      // 1. Update payment record
      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .update({ status: "success" })
        .eq("external_id", payment_id.toString())
        .select()
        .single();

      if (paymentError) {
        console.error("Error updating payment:", paymentError.message);
        // Even if payment update fails, we might want to continue if we can find the user
      }

      // 2. Update user wallet balance
      // Use price_amount (USD) as the balance to add
      const amountToAdd = parseFloat(price_amount || pay_amount);

      if (uid && !isNaN(amountToAdd)) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("wallet_balance")
          .eq("id", uid)
          .single();

        if (profileError) {
          throw new Error(`User profile not found: ${profileError.message}`);
        }

        const newBalance = (parseFloat(profile.wallet_balance || 0)) + amountToAdd;

        const { error: updateError } = await supabase
          .from("profiles")
          .update({ 
            wallet_balance: newBalance,
            total_deposit: supabase.rpc('increment', { row_id: uid, column_name: 'total_deposit', amount: amountToAdd }) // Optional: if you have an increment RPC
          })
          .eq("id", uid);
          
        // Fallback if no RPC
        if (updateError) {
           const { error: updateError2 } = await supabase
            .from("profiles")
            .update({ wallet_balance: newBalance })
            .eq("id", uid);
            
           if (updateError2) throw new Error(`Failed to update wallet: ${updateError2.message}`);
        }

        console.log(`Successfully updated wallet for user ${uid}. Added ${amountToAdd}. New balance: ${newBalance}`);
        
        // 3. Log transaction
        await supabase.from("transactions").insert({
          uid: uid,
          user_id: uid,
          amount: amountToAdd,
          type: "deposit",
          status: "completed",
          description: `Deposit via NOWPayments (ID: ${payment_id})`
        });
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Webhook Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
