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

    // 1. ELITE AUTH & SECURE WALLET DEDUCTION
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("UNAUTHORIZED");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) throw new Error("INVALID_SESSION");
    
    const userId = user.id;
    const { amount } = await req.json();

    // Fetch and lock wallet
    const { data: wallet, error: wErr } = await supabaseAdmin.from('user_wallets').select('master_vault').eq('id', userId).single();
    if (wErr || !wallet) throw new Error("WALLET_NOT_FOUND");
    if (Number(wallet.master_vault) < amount) throw new Error("INSUFFICIENT MASTER VAULT BALANCE");

    // ATOMIC DEDUCTION
    await supabaseAdmin.from('user_wallets').update({ 
        master_vault: (Number(wallet.master_vault) - amount).toFixed(4),
        updated_at: new Date().toISOString()
    }).eq('id', userId);

    // 2. RULE 1: THE BALANCED TRIANGLE ENGINE ($50 BASE)
    const totalUnits = Math.floor(amount / 50);
    const virtualCount = totalUnits - 1;

    // Yield Calc: (Referral 5% + Matching 10%) distributed to virtual nodes
    const profit = (virtualCount * 2.50) + (Math.floor(virtualCount / 2) * 5.00);
    const yieldPerNode = virtualCount > 0 ? (profit / virtualCount).toFixed(4) : "0";

    const matrix = [userId];
    const { data: profile } = await supabaseAdmin.from('profiles').select('operator_id, name').eq('id', userId).single();

    // Generation & Placement Loop
    for (let i = 1; i <= virtualCount; i++) {
        const vId = crypto.randomUUID();
        matrix[i] = vId;
        
        const parentId = matrix[Math.floor((i - 1) / 2)];
        const position = (i % 2 !== 0) ? 'LEFT' : 'RIGHT';
        
        // A. Create Profile
        await supabaseAdmin.from('profiles').insert({
            id: vId,
            operator_id: `${profile.operator_id}-V${i}`,
            name: `${profile.name} (V${i})`,
            is_virtual: true,
            is_active: true,
            status: 'active',
            active_package: 50,
            sponsor_id: userId
        });

        // B. Place in Binary Tree
        await supabaseAdmin.from('members').insert({
            id: vId,
            placement_id: parentId,
            position: position,
            sponsor_id: userId,
            is_active: true,
            master_account_id: userId
        });

        // C. Sync Individual Income (pending_yield)
        await supabaseAdmin.from('team_collection').insert({
            uid: userId,
            node_id: `${profile.operator_id}-V${i}`,
            package_amount: 50,
            status: 'active',
            pending_yield: Number(yieldPerNode)
        });
    }

    // Update Master Package
    await supabaseAdmin.from('profiles').update({ status: 'active', is_active: true, active_package: amount }).eq('id', userId);

    return new Response(JSON.stringify({ success: true, matrix_nodes: virtualCount }), {
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
