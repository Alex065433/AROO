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

    // 1. SECURE AUTHENTICATION (CRITICAL PROTOCOL)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Invalid Session: Missing Auth Header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) throw new Error("Invalid Session: Token Expired or Invalid");
    const userId = user.id;

    const { amount, packageId } = await req.json();

    if (!amount || amount < 50 || amount % 50 !== 0) throw new Error("Invalid activation amount.");

    // 2. ATOMIC WALLET CHECK
    const { data: wallet, error: walErr } = await supabaseAdmin
      .from('user_wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    let finalWallet = wallet;

    if (!finalWallet) {
        // Auto-provision wallet on the fly from profile balances if needed
        const { data: profile } = await supabaseAdmin.from('profiles').select('wallet_balance').eq('id', userId).single();
        
        const { data: newWallet, error: createWalletErr } = await supabaseAdmin.from('user_wallets').insert({
            user_id: userId,
            master_vault: Number(profile?.wallet_balance || 0),
            referral_box: 0,
            matching_box: 0
        }).select().single();

        if (createWalletErr || !newWallet) {
            throw new Error(`Wallet infrastructure not found and auto-provisioning failed: ${createWalletErr?.message}`);
        }
        finalWallet = newWallet;
    }

    if (Number(finalWallet.master_vault) < amount) throw new Error("Insufficient funds in Master Vault.");

    // 3. DEDUCT & LOG TRANSACTION
    const { error: dedErr } = await supabaseAdmin.from('user_wallets').update({
        master_vault: Number(finalWallet.master_vault) - amount,
        last_updated: new Date().toISOString()
    }).eq('user_id', userId);

    if (dedErr) throw new Error(`DEDUCTION_FAILED: ${dedErr.message}`);

    await supabaseAdmin.from('transactions').insert({
      user_id: userId,
      uid: userId,
      amount: -amount,
      type: 'package_activation',
      status: 'completed',
      description: `Package Activation: $${amount}`
    });

    // 4. MASTER NODE SETUP
    const { data: profile } = await supabaseAdmin.from('profiles').select('operator_id, sponsor_id').eq('id', userId).single();
    
    await supabaseAdmin.from('profiles').update({ 
        status: 'active', 
        is_virtual: false,
        active_package: amount,
        activated_at: new Date().toISOString(),
        is_active: true
    }).eq('id', userId);

    // Sync to members legacy table
    await supabaseAdmin.from('members').update({ is_active: true }).eq('id', userId);

    // 5. VIRTUAL NODES (TEAM COLLECTION)
    const virtualCount = Math.floor(amount / 50) - 1;

    if (virtualCount > 0) {
        for (let i = 1; i <= virtualCount; i++) {
            const vOpId = `${profile?.operator_id}-V${i}`;
            const vId = crypto.randomUUID();
            
            // Nodes stay in team_collection, parent_id is null for main tree separation
            await supabaseAdmin.from('profiles').insert({
                id: vId,
                operator_id: vOpId,
                sponsor_id: userId,
                parent_id: null, 
                is_virtual: true,
                status: 'active',
                active_package: 50,
                is_active: true,
                activated_at: new Date().toISOString()
            });

            await supabaseAdmin.from('team_collection').insert({
                uid: userId,
                node_id: vOpId,
                package_amount: 50,
                status: 'active'
            });

            // Instant Internal Commission (5% = $2.50)
            const commission = 2.50;
            const { data: myWal } = await supabaseAdmin.from('user_wallets').select('referral_box').eq('user_id', userId).single();
            
            await supabaseAdmin.from('user_wallets').update({
                referral_box: Number(myWal?.referral_box || 0) + commission,
                last_updated: new Date().toISOString()
            }).eq('user_id', userId);

            await supabaseAdmin.from('transactions').insert({
                uid: userId,
                user_id: userId,
                amount: commission,
                type: 'referral_bonus',
                description: `Internal Commission from Virtual Node ${vOpId}`,
                status: 'completed'
            });
        }
    }

    // 6. EXTERNAL SPONSOR COMMISSION (5%)
    if (profile?.sponsor_id) {
        const extCommission = amount * 0.05;
        const { data: sponWal } = await supabaseAdmin.from('user_wallets').select('referral_box').eq('user_id', profile.sponsor_id).maybeSingle();
        
        if (sponWal) {
            await supabaseAdmin.from('user_wallets').update({
                referral_box: Number(sponWal.referral_box) + extCommission,
                last_updated: new Date().toISOString()
            }).eq('user_id', profile.sponsor_id);

            await supabaseAdmin.from('transactions').insert({
                uid: profile.sponsor_id,
                user_id: profile.sponsor_id,
                amount: extCommission,
                type: 'referral_bonus',
                description: `Sponsorship Reward from ${profile.operator_id} Activation`,
                status: 'completed'
            });
        }
    }

    return new Response(JSON.stringify({ 
        success: true,
        message: "Activation Complete. Welcome to Arowin Network." 
    }), {
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
