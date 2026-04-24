import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    // 1. UUID RESOLUTION
    const resolveUuid = async (input: string | null) => {
        if (!input) return null;
        if (/^[0-9a-f-]{36}$/i.test(input)) return input;
        
        let cleanId = input.trim().toUpperCase();
        if (/^\d{6}$/.test(cleanId)) cleanId = `ARW-${cleanId}`;
        else if (/^ARW\d{6}$/.test(cleanId)) cleanId = `ARW-${cleanId.substring(3)}`;

        const { data, error } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .ilike('operator_id', cleanId)
            .maybeSingle();
        
        if (error || !data) return null;
        return data.id;
    };

    const resolvedSponsorId = await resolveUuid(sponsor_id);
    const resolvedPlacementId = await resolveUuid(placement_id);

    if (!resolvedSponsorId) {
        throw new Error(`CRITICAL_ERROR: Sponsor ID "${sponsor_id}" could not be resolved.`);
    }

    // 2. GENERATE IDENTITY
    const operator_id = `ARW-${Math.floor(100000 + Math.random() * 900000)}`;
    const internalEmail = `${operator_id.toLowerCase()}@arowintrading.com`;

    // 3. AUTH USER REGISTRATION
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      password: password,
      email_confirm: true,
      user_metadata: { name, mobile, operator_id, real_email: email }
    });

    if (authErr) throw new Error(`AUTH_ERROR: ${authErr.message}`);
    
    // SAFE ID EXTRACTION
    const userId = authData?.user?.id || authData?.id;
    if (!userId) throw new Error("CRITICAL_AUTH_FAILURE: User ID could not be retrieved from registry.");

    // 4. PROFILE & WALLET INITIALIZATION
    await supabaseAdmin.from('profiles').insert({
        id: userId,
        email: internalEmail,
        real_email: email,
        name: name || 'New Operator',
        mobile: mobile || '',
        operator_id,
        sponsor_id: resolvedSponsorId,
        withdrawal_password: withdrawalPassword,
        two_factor_pin: twoFactorPin,
        status: 'active'
    });

    await supabaseAdmin.from('user_wallets').insert({ user_id: userId, master_vault: 0 });

    // 5. AUTO-SLIDE PLACEMENT LOGIC
    let currentParent = resolvedPlacementId || resolvedSponsorId;
    let targetPosition = (position || 'LEFT').toUpperCase();
    let success = false;
    let iterations = 0;

    while (!success && iterations < 100) {
        iterations++;
        
        // Check if spot is occupied
        const { data: occupant } = await supabaseAdmin
            .from('members')
            .select('id')
            .eq('placement_id', currentParent)
            .eq('position', targetPosition)
            .maybeSingle();

        if (!occupant) {
            // Spot is clear, attempt insert
            const { error: insErr } = await supabaseAdmin.from('members').insert({
                id: userId,
                sponsor_id: resolvedSponsorId,
                placement_id: currentParent,
                position: targetPosition
            });

            if (!insErr) {
                success = true;
                break;
            }

            // If someone else grabbed it simultaneously
            if (insErr.code === '23505') {
                continue; // Loop will re-check occupant
            }
            throw new Error(`PLACEMENT_ERROR: ${insErr.message}`);
        } else {
            // SLIDE DOWN: The occupant becomes the new parent
            currentParent = occupant.id;
        }
    }

    if (!success) throw new Error("NETWORK_SATURATION: Could not find vacancy in branch.");

    // FAT PAYLOAD RESPONSE
    return new Response(JSON.stringify({ 
        success: true, 
        userId: userId, 
        id: userId, 
        user: { id: userId }, 
        operator_id,
        internal_email: internalEmail
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
    });
  }
});
