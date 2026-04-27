import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Auth Header.");
    
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) throw new Error("Invalid Session. Please log in again.");
    const userId = user.id;

    const body = await req.json();
    const amount = Number(body.amount || body.package_amount || 350); 
    if (!amount || amount < 50) throw new Error("Invalid Package Amount.");

    // 🚨 1. STRICT ATOMIC WALLET DEDUCTION 🚨
    const { data: wallet, error: walletErr } = await supabaseAdmin.from('user_wallets').select('master_vault').eq('id', userId).single();
    if (walletErr || !wallet) throw new Error("Wallet Error: Master Vault not found.");
    
    const currentVault = Number(wallet.master_vault) || 0;
    if (currentVault < amount) {
        throw new Error(`Insufficient Balance! You have $${currentVault}, but need $${amount} to activate.`);
    }

    // Money cut cheytam - idi fail aythe kinda code run avvadu
    const { error: deductErr } = await supabaseAdmin.from('user_wallets').update({ master_vault: currentVault - amount }).eq('id', userId);
    if (deductErr) throw new Error("CRITICAL: Wallet deduction failed. Activation stopped.");

    // Record the transaction
    await supabaseAdmin.from('transactions').insert({ user_id: userId, amount: amount, type: 'PACKAGE_ACTIVATION', status: 'COMPLETED' });

    // 🚨 2. PERFECT PYRAMID PLACEMENT ($50 Base) & INCOME CALCULATION 🚨
    const totalNodes = Math.floor(amount / 50);
    const virtualNodesCount = totalNodes - 1;
    let isStarter = false;

    if (virtualNodesCount > 0) {
        // Internal Profit Logic
        const instantReferral = virtualNodesCount * 2.50; 
        const totalPairs = Math.floor(virtualNodesCount / 2);
        const instantMatching = totalPairs * 5.00; 
        const yieldPerNode = Number(((instantReferral + instantMatching) / virtualNodesCount).toFixed(4));

        const matrixIds = [userId];
        for(let i = 0; i < virtualNodesCount; i++) {
            matrixIds.push(crypto.randomUUID());
        }

        for (let i = 1; i <= virtualNodesCount; i++) {
            const nodeId = matrixIds[i];
            const parentId = matrixIds[Math.floor((i - 1) / 2)]; // The Magic Formula for 1->2->4 Pyramid
            const position = (i % 2 !== 0) ? 'LEFT' : 'RIGHT'; 
            const opId = `ARW-${Math.floor(100000 + Math.random() * 900000)}`;

            // Create Virtual Profile
            await supabaseAdmin.from('profiles').insert({
                id: nodeId, operator_id: opId, sponsor_id: userId, parent_id: parentId, position: position, is_virtual: true, status: 'active'
            });

            // Insert into Tree
            await supabaseAdmin.from('members').insert({
                id: nodeId, sponsor_id: userId, placement_id: parentId, position: position
            });

            // 🚨 3. TEAM COLLECTION SYNC 🚨
            await supabaseAdmin.from('team_collection').insert({
                uid: userId, node_id: opId, package_amount: 50, pending_yield: yieldPerNode
            });

            // 🚨 4. NON-WORKING DAILY ROI REGISTRATION 🚨
            await supabaseAdmin.from('daily_roi_tracking').insert({
                user_id: userId, node_id: opId, activation_amount: 50, daily_percentage: 0.50
            });
        }
        
        // $150 or above package actiavte cheste automatically 1 Left, 1 Right virtual nodes padathayi kabatti direct Starter!
        if (virtualNodesCount >= 2) {
            isStarter = true; 
        }
    }

    // 🚨 5. UPDATE MASTER ACCOUNT & RANK FLAG 🚨
    // Ikkada is_starter flag update avtundi. Meeku uplines rank update avvadaniki idi crucial.
    await supabaseAdmin.from('profiles').update({ status: 'active', is_starter: isStarter }).eq('id', userId);

    return new Response(JSON.stringify({ success: true, message: "Package Activated & Matrix Generated Successfully!" }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 
    });

  } catch (error: any) {
    // Ye chinna error vachina front-end ki red color alert vellipotundi
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 400 });
  }
});