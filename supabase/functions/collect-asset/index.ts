import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. AUTHENTICATION
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Authorization required');
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) throw new Error('Invalid session protocol.');

    const userId = user.id;

    // 2. ATOMIC ASSET COLLECTION
    // Fetch current wallet boxes
    const { data: wallets, error: walErr } = await supabaseAdmin
        .from('user_wallets')
        .select('*')
        .eq('user_id', userId)
        .single();
    
    if (walErr || !wallets) throw new Error('WALLETS_NOT_FOUND: User wallet infrastructure is missing.');

    const refIncome = Number(wallets.referral_box || 0);
    const matchIncome = Number(wallets.matching_box || 0);
    const totalToCollect = refIncome + matchIncome;

    if (totalToCollect <= 0) {
        return new Response(JSON.stringify({ 
            success: false, 
            message: "No claimable assets found in localized boxes." 
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    // 3. SECURE TRANSFER (Atomic Update)
    const { error: updErr } = await supabaseAdmin
        .from('user_wallets')
        .update({
            master_vault: Number(wallets.master_vault || 0) + totalToCollect,
            referral_box: 0,
            matching_box: 0
        })
        .eq('user_id', userId);

    if (updErr) throw new Error(`PROTOCOL_ERROR: Failed to transfer assets to master vault. ${updErr.message}`);

    // 4. TRANSACTION LOGGING
    await supabaseAdmin.from('transactions').insert([
        {
            uid: userId,
            user_id: userId,
            amount: totalToCollect,
            type: 'collection',
            description: `Asset Collection: ${refIncome.toFixed(2)} Referral + ${matchIncome.toFixed(2)} Matching`,
            status: 'completed'
        }
    ]);

    return new Response(JSON.stringify({ 
      success: true, 
      collected: totalToCollect,
      message: `Successfully claimed ${totalToCollect.toFixed(2)} USDT to Master Vault.`
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
