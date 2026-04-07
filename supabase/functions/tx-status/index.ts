import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl!, supabaseServiceRoleKey!);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) throw new Error("Missing ID");

    const { data: payment, error } = await supabase
      .from('payments')
      .select('status')
      .eq('description', `Payment ID: ${id}`)
      .maybeSingle();

    if (error) throw error;

    return new Response(JSON.stringify({ 
      payment_id: id,
      payment_status: payment?.status || 'waiting'
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
