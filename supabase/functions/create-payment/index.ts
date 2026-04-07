import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const nowPaymentsApiKey = Deno.env.get("NOWPAYMENTS_API_KEY");

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
    const body = await req.json();
    const { amount, user_id, currency } = body;
    const uid = user_id || body.uid; // Support both for compatibility
    const payCurrency = currency || "usdtbsc";

    if (!amount || !uid) {
      throw new Error('Missing required fields: amount or user_id');
    }

    let paymentData: any;

    if (nowPaymentsApiKey) {
      const response = await fetch('https://api.nowpayments.io/v1/payment', {
        method: 'POST',
        headers: {
          'x-api-key': nowPaymentsApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          price_amount: amount,
          price_currency: payCurrency,
          pay_currency: payCurrency,
          order_id: uid,
          order_description: `Deposit for ${uid}`,
          ipn_callback_url: `https://jhlxehnwnlzftoylancq.supabase.co/functions/v1/payment-webhook`
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`NowPayments API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      paymentData = {
        payment_id: data.payment_id,
        pay_address: data.pay_address,
        pay_amount: data.pay_amount,
        pay_currency: data.pay_currency,
        payment_status: data.payment_status,
        uid: uid,
        description: `Deposit for ${uid}`
      };
    } else {
      // Mock payment
      const paymentId = `PAY-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
      const mockAddress = payCurrency === 'usdttrc20' 
        ? 'TX' + Math.random().toString(36).substring(2, 34).toUpperCase()
        : '0x' + Math.random().toString(16).substring(2, 42);

      paymentData = {
        payment_id: paymentId,
        pay_address: mockAddress,
        pay_amount: amount,
        pay_currency: payCurrency,
        payment_status: 'waiting',
        uid: uid,
        description: `Deposit for ${uid}`
      };
    }

    // Log to Supabase
    const { error } = await supabase.from('payments').insert({
      uid,
      amount,
      type: 'deposit',
      status: 'waiting',
      method: payCurrency,
      description: `Payment ID: ${paymentData.payment_id} - Deposit for ${uid}`,
      external_id: paymentData.payment_id.toString()
    });

    if (error) console.error('Supabase log error:', error.message);

    return new Response(JSON.stringify(paymentData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
