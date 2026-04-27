import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * ELITE MLM ARCHITECT: REGISTER-USER (Placement Logic Engine)
 * 1. Rule 1: Extreme Side Spillover (Auto Placement)
 * 2. Rule 2: UI Click - Direct Sponsorship/Placement (Manual)
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { 
      email, 
      password, 
      sponsor_id, // operator_id string
      position, // 'LEFT' or 'RIGHT'
      name, 
      mobile,
      isManualPlacement,
      targetNodeId, // optional for Rule 2
      withdrawalPassword,
      twoFactorPin
    } = body;

    // A. IDENTITY RESOLUTION (operator_id -> UUID)
    const resolveToUuid = async (idOrOp: string) => {
        if (!idOrOp) return null;
        if (/^[0-9a-f-]{36}$/i.test(idOrOp)) return idOrOp;
        const { data } = await supabaseAdmin.from('profiles').select('id').ilike('operator_id', idOrOp).maybeSingle();
        return data?.id;
    };

    let resolvedSponsorId = await resolveToUuid(sponsor_id);
    if (!resolvedSponsorId) throw new Error(`SPONSOR_NOT_FOUND: Identity ${sponsor_id} is invalid.`);

    let resolvedPlacementId: string | null = null;
    let targetSide = (position || 'LEFT').toUpperCase();

    // B. PLACEMENT LOGIC ENGINE
    if (isManualPlacement && targetNodeId) {
        // RULE 2: MANUAL UI CLICK
        // The explicitly clicked node becomes both Sponsor and Placement ID
        const manualTargetId = await resolveToUuid(targetNodeId);
        if (!manualTargetId) throw new Error("MANUAL_TARGET_INVALID: Selected node not found.");
        
        resolvedSponsorId = manualTargetId;
        resolvedPlacementId = manualTargetId;
        // targetSide is whatever they selected for that node's spot
    } else {
        // RULE 1: EXTREME LEG SPILLOVER (REFERRAL LINK)
        // Find absolute bottom-most node on the selected side of the head sponsor
        let currentId = resolvedSponsorId;
        let isLeafFound = false;
        
        while (!isLeafFound) {
            const { data: child } = await supabaseAdmin
                .from('members')
                .select('id')
                .eq('placement_id', currentId)
                .eq('position', targetSide)
                .maybeSingle();
            
            if (child) {
                currentId = child.id;
            } else {
                isLeafFound = true;
                resolvedPlacementId = currentId;
            }
        }
    }

    if (!resolvedPlacementId) throw new Error("PLACEMENT_CALCULATION_FAILED");

    // C. USER PROVISIONING
    const opId = `ARW-${Math.floor(100000 + Math.random() * 900000)}`;
    const internalEmail = `${opId.toLowerCase()}@arowintrading.com`;

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      password: password,
      email_confirm: true,
      user_metadata: { name, operator_id: opId, real_email: email }
    });

    if (authErr) throw new Error(`AUTH_PROVISIONING_FAILED: ${authErr.message}`);
    const userId = authData.user.id;

    // D. ATOMIC DATABASE ASSEMBLY
    // 1. Profile
    await supabaseAdmin.from('profiles').insert({
        id: userId,
        email: internalEmail,
        real_email: email,
        name: name || 'Operator',
        operator_id: opId,
        sponsor_id: resolvedSponsorId,
        parent_id: resolvedPlacementId,
        side: targetSide,
        position: targetSide.toLowerCase(),
        withdrawal_password: withdrawalPassword,
        two_factor_pin: twoFactorPin,
        status: 'inactive',
        is_active: false
    });

    // 2. Member (Tree)
    await supabaseAdmin.from('members').insert({
        id: userId,
        sponsor_id: resolvedSponsorId,
        placement_id: resolvedPlacementId,
        position: targetSide,
        is_active: false
    });

    // 3. User Wallet
    await supabaseAdmin.from('user_wallets').insert({
        id: userId,
        master_vault: 0,
        referral_box: 0,
        matching_box: 0,
        network_yield_box: 0,
        rank_bonus_box: 0
    });

    return new Response(JSON.stringify({ 
        success: true, 
        id: userId, 
        operator_id: opId, 
        internal_email: internalEmail,
        placement: {
            sponsor: resolvedSponsorId,
            placement: resolvedPlacementId,
            side: targetSide
          }
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
    });

  } catch (error: any) {
    console.error("[REGISTER-USER FAILURE]", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
    });
  }
});
