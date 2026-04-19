
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

console.log("[REGISTER-NODE] Infrastructure Protocol v3.0 Initialized.");

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { 
      email, 
      password, 
      sponsor_id, // Frontend might send 'ARW-XXXXXX'
      placement_id, // Frontend might send 'ARW-XXXXXX'
      placement_side = 'LEFT',
      metadata = {} 
    } = body;

    if (!email || !password) {
      throw new Error("PROTOCOL REJECTION: Email and password are mandatory.");
    }

    // --- HELPER: RESOLVE OPERATOR ID TO UUID ---
    const resolveToUuid = async (input: string) => {
      if (!input) return null;
      // If already UUID, return it
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(input)) return input;

      // Search by operator_id
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('operator_id', input)
        .maybeSingle();
      
      if (error || !data) return null;
      return data.id;
    };

    // 1. Resolve Sponsor & Placement
    const finalSponsorUuid = await resolveToUuid(sponsor_id);
    let finalPlacementUuid = await resolveToUuid(placement_id);

    // Bootstrap check: If no sponsor found, check if this is the system's first user
    if (!finalSponsorUuid) {
        const { count } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true });
        if (count > 0) throw new Error("INVALID PROTOCOL: Sponsor ID could not be resolved to a valid UUID.");
    }

    // 2. Extreme Spillover Search (If placement_id not explicitly provided or needs validation)
    // "Start from sponsor_id... recursive search to find the absolute bottom-most empty spot on the extreme side edge"
    if (finalSponsorUuid && !finalPlacementUuid) {
        console.log(`[PLACEMENT] Performing EXTREME SPILLOVER check from sponsor ${finalSponsorUuid} on ${placement_side} side`);
        let currentId = finalSponsorUuid;
        while (true) {
            const { data: child } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('parent_id', currentId)
                .eq('side', placement_side)
                .maybeSingle();

            if (!child) {
                // Found empty slot
                finalPlacementUuid = currentId;
                break;
            }
            currentId = child.id;
            
            // Safety depth guard
            if (currentId === null) break; 
        }
    }

    // 3. Generate Unique Operator Protocol ID
    let operatorId = '';
    let isUnique = false;
    while (!isUnique) {
      const candidateId = `ARW-${Math.floor(100000 + Math.random() * 900000)}`;
      const { data: existing } = await supabaseAdmin.from('profiles').select('id').eq('operator_id', candidateId).maybeSingle();
      if (!existing) {
        operatorId = candidateId;
        isUnique = true;
      }
    }

    // 4. Create Supabase Auth Layer
    const internalEmail = `${operatorId.toLowerCase()}@arowin.internal`;
    const { data: userData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      password: password,
      email_confirm: true,
      user_metadata: { 
        ...metadata, 
        operator_id: operatorId, 
        real_email: email,
        name: metadata.name || email.split('@')[0]
      }
    });

    if (authError) throw authError;
    const userId = userData.user.id;

    // 5. Database Synchronization
    const profileInsert = {
      id: userId,
      email: email,
      operator_id: operatorId,
      name: metadata.name || email.split('@')[0],
      mobile: metadata.mobile || '',
      withdrawal_password: metadata.withdrawalPassword || '',
      two_factor_pin: metadata.twoFactorPin || '',
      sponsor_id: finalSponsorUuid,
      parent_id: finalPlacementUuid,
      side: placement_side,
      position: placement_side.toLowerCase(),
      rank: 1,
      status: 'inactive',
      role: 'user',
      created_at: new Date().toISOString()
    };

    const memberInsert = {
      id: userId,
      sponsor_id: finalSponsorUuid,
      placement_id: finalPlacementUuid,
      position: placement_side,
      is_active: false,
      created_at: new Date().toISOString()
    };

    const { error: profError } = await supabaseAdmin.from('profiles').insert(profileInsert);
    const { error: memError } = await supabaseAdmin.from('members').insert(memberInsert);

    if (profError || memError) {
        // Cleanup on fail
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw new Error(`DATABASE SYNC FAILURE: ${profError?.message || memError?.message}`);
    }

    console.log(`[REGISTER-NODE] Protocol ID ${operatorId} successfully registered and placed.`);

    return new Response(JSON.stringify({ 
      success: true, 
      user: { id: userId, operator_id: operatorId, email: email, internal_email: internalEmail } 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error(`[REGISTER-NODE FATAL]: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message, success: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
