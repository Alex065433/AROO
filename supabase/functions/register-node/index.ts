import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * ELITE MLM ARCHITECT REGISTER-NODE
 * Handles Rule 2 (Extreme Spillover) and Rule 3 (Manual Direct Selection)
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
        sponsor_id, 
        placement_id, 
        position, 
        name, 
        mobile,
        withdrawalPassword,
        twoFactorPin
    } = body;

    // 1. RESOLVE PROFILES TO UUIDs
    const resolveToUuid = async (input: string | null) => {
        if (!input) return null;
        if (/^[0-9a-f-]{36}$/i.test(input)) return input;
        const { data } = await supabaseAdmin.from('profiles').select('id').ilike('operator_id', input.trim()).maybeSingle();
        return data?.id || null;
    };

    const resolvedSponsorId = await resolveToUuid(sponsor_id);
    const resolvedPlacementId = await resolveToUuid(placement_id);

    if (!resolvedSponsorId) throw new Error("INVALID_SPONSOR: Sponsor identity could not be resolved.");

    // 2. GENERATE BRANDED IDENTITY
    const operator_id = `ARW-${Math.floor(100000 + Math.random() * 900000)}`;
    const internalEmail = `${operator_id.toLowerCase()}@arowintrading.com`;

    // 3. AUTH CREATE
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      password: password,
      email_confirm: true,
      user_metadata: { name, operator_id, real_email: email }
    });
    if (authErr) throw new Error(`AUTH_SYSTEM_FAILURE: ${authErr.message}`);
    const userId = authData.user.id;

    // 4. RULE 2 & 3: PLACEMENT LOGIC
    // Rule 3: If placement_id is provided (Manual Click), it takes priority.
    // Rule 2: If only sponsor_id is provided, we traverse the EXTREME leg of that side.
    let currentParentId = resolvedPlacementId || resolvedSponsorId;
    const targetSide = (position || 'LEFT').toUpperCase();
    let isPlaced = false;

    // Extreme Traversal Logic
    while (!isPlaced) {
        const { data: occupant } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('parent_id', currentParentId)
            .eq('side', targetSide)
            .maybeSingle();

        if (!occupant) {
            // Vacancy found
            isPlaced = true;
        } else {
            // RULE 2: ALWAYS GO EXTREME. Move to the occupant and continue on SAME side.
            currentParentId = occupant.id;
        }
    }

    // 5. ATOMIC DB UPSERT
    // Profile entry
    await supabaseAdmin.from('profiles').insert({
        id: userId,
        email: internalEmail,
        real_email: email,
        name: name || 'New Operator',
        operator_id,
        sponsor_id: resolvedSponsorId,
        parent_id: currentParentId,
        side: targetSide,
        position: targetSide.toLowerCase(),
        withdrawal_password: withdrawalPassword,
        two_factor_pin: twoFactorPin,
        status: 'active',
        is_active: true
    });

    // Wallet entry (using confirmed 'id' column)
    await supabaseAdmin.from('user_wallets').insert({ 
        id: userId, 
        master_vault: 0,
        referral_box: 0,
        matching_box: 0
    });

    // Member entry for legacy structure compatibility
    await supabaseAdmin.from('members').insert({
        id: userId,
        sponsor_id: resolvedSponsorId,
        placement_id: currentParentId,
        position: targetSide as any,
        is_active: true
    });

    return new Response(JSON.stringify({ 
        success: true, 
        id: userId, 
        operator_id,
        internal_email: internalEmail
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
    });

  } catch (error: any) {
    console.error("[REGISTER-NODE ERROR]", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
    });
  }
});
