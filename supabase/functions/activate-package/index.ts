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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error("Missing Authorization header");
    
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userErr || !user) throw new Error("Invalid session");

    const { amount } = await req.json();
    const userId = user.id;

    if (!amount || amount < 50 || amount % 50 !== 0) throw new Error("Invalid amount.");

    // 1. ATOMIC WALLET CHECK
    const { data: wallet, error: walkErr } = await supabaseAdmin
      .from('user_wallets')
      .select('master_vault')
      .eq('user_id', userId)
      .maybeSingle();

    if (walkErr || !wallet) throw new Error("Wallet not found.");
    if (Number(wallet.master_vault) < amount) throw new Error("Insufficient funds in Master Vault.");

    // 2. DEDUCT & LOG
    await supabaseAdmin.from('user_wallets').update({
        master_vault: Number(wallet.master_vault) - amount,
        last_updated: new Date().toISOString()
    }).eq('user_id', userId);

    await supabaseAdmin.from('transactions').insert({
      user_id: userId,
      amount: -amount,
      type: 'PACKAGE_ACTIVATION',
      status: 'COMPLETED',
      description: `Activated Package: $${amount}`
    });

    // 3. MASTER NODE ACTIVATION
    const { data: profile } = await supabaseAdmin.from('profiles').select('operator_id, sponsor_id').eq('id', userId).single();
    
    await supabaseAdmin.from('profiles').update({ 
        status: 'active', 
        is_virtual: false,
        active_package: amount,
        activated_at: new Date().toISOString()
    }).eq('id', userId);

    await supabaseAdmin.from('members').update({ is_active: true }).eq('id', userId);

    // 4. VIRTUAL NODES (MINI-TREE)
    const totalNodes = amount / 50;
    const virtualCount = totalNodes - 1;

    if (virtualCount > 0) {
        for (let i = 1; i <= virtualCount; i++) {
            const vId = `${profile?.operator_id}-V${i}`;
            
            // Nodes stay in team_collection, parent_id is null for main tree isolation
            await supabaseAdmin.from('profiles').insert({
                id: crypto.randomUUID(), // Unique ID for record
                operator_id: vId,
                sponsor_id: userId,
                parent_id: null, 
                is_virtual: true,
                status: 'active',
                active_package: 50
            });

            // Log commission for virtual node (5% = $2.50)
            const commission = 2.50;
            const { data: currentWal } = await supabaseAdmin.from('user_wallets').select('referral_box').eq('user_id', userId).single();
            
            await supabaseAdmin.from('user_wallets').update({
                referral_box: Number(currentWal?.referral_box || 0) + commission,
                last_updated: new Date().toISOString()
            }).eq('user_id', userId);

            await supabaseAdmin.from('income_ledger').insert({
                user_id: userId,
                amount: commission,
                type: 'DIRECT_REFERRAL',
                description: `Internal Referral from Virtual Node ${vId}`
            });
        }
    }

    // External Sponsor Referral (if any)
    if (profile?.sponsor_id) {
        const extCommission = amount * 0.05;
        const { data: sponWal } = await supabaseAdmin.from('user_wallets').select('referral_box').eq('user_id', profile.sponsor_id).maybeSingle();
        if (sponWal) {
            await supabaseAdmin.from('user_wallets').update({
                referral_box: Number(sponWal.referral_box) + extCommission,
                last_updated: new Date().toISOString()
            }).eq('user_id', profile.sponsor_id);

            await supabaseAdmin.from('income_ledger').insert({
                user_id: profile.sponsor_id,
                amount: extCommission,
                type: 'DIRECT_REFERRAL',
                description: `Referral income from ${profile.operator_id} Activation`
            });
        }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
