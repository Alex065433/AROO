
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Authorization required');
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) throw new Error('Invalid session');

    const userId = user.id;

    // Call the RPC we defined in the migration
    const { data: totalClaimed, error: rpcError } = await supabaseAdmin.rpc('claim_node_earnings', { p_user_id: userId });

    if (rpcError) throw rpcError;

    // Also update team_collection balances to 0 for the UI
    await supabaseAdmin
        .from('team_collection')
        .update({ balance: 0 })
        .eq('uid', userId);

    return new Response(JSON.stringify({ 
      success: true, 
      total_claimed: totalClaimed,
      message: `Successfully claimed ${totalClaimed} USDT to Master Wallet.`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message, success: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
