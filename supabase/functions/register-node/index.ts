
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    
    // 1. Flexible Parsing (Handle both snake_case and camelCase)
    const rawSponsor = body.sponsor_id || body.sponsorId || body.referred_by || body.referrer_id;
    const rawSide = body.placement_side || body.placementSide || body.position || body.side;
    const rawEmail = body.email || body.userEmail;
    const rawPassword = body.password || body.userPassword;

    // 2. Auto-Generate Missing Auth Fields
    // If email is missing, we generate a unique internal placeholder
    const email = rawEmail || `node_${crypto.randomUUID()}@arowintrading.com`;
    // If password is missing, we use a random string
    const password = rawPassword || crypto.randomUUID();

    if (!rawSponsor || !rawSide) {
      throw new Error("PROTOCOL REJECTION: Sponsor ID and Placement Side are mandatory.");
    }

    // Resolve Sponsor ID (Handle ARW-XXXXXX or UUID)
    let sponsor_id = rawSponsor;
    if (String(rawSponsor).startsWith('ARW-')) {
        const { data: sponsorProf, error: sErr } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('operator_id', rawSponsor)
            .maybeSingle();
        
        if (sErr || !sponsorProf) {
            throw new Error(`INVALID SPONSOR: Protocol ID ${rawSponsor} not found.`);
        }
        sponsor_id = sponsorProf.id;
    }

    const side = (String(rawSide).toUpperCase() === 'LEFT') ? 'LEFT' : 'RIGHT';

    // 3. Extreme Spillover Logic
    // Logic: Start from sponsor_id, traverse down the extreme side edge until an empty spot is found.
    let currentParentId = sponsor_id;
    let finalPlacementId = null;

    console.log(`[PLACEMENT] Initiating Extreme Spillover from ${sponsor_id} for side ${side}`);

    while (true) {
      const { data: child, error: childError } = await supabaseAdmin
        .from('members')
        .select('id')
        .eq('placement_id', currentParentId)
        .eq('position', side)
        .maybeSingle();

      if (childError) throw childError;

      if (!child) {
        // Empty spot found at currentParentId on the side edge
        finalPlacementId = currentParentId;
        break;
      }

      currentParentId = child.id;
    }

    // 4. Create Auth User with Uniqueness Check for operatorId
    let operatorId = '';
    let isUnique = false;
    while (!isUnique) {
      operatorId = `ARW-${Math.floor(100000 + Math.random() * 900000)}`;
      const { data: existing } = await supabaseAdmin.from('profiles').select('id').eq('operator_id', operatorId).maybeSingle();
      if (!existing) isUnique = true;
    }
    
    const internalEmail = `${operatorId.toLowerCase()}@arowin.internal`;

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      password: password,
      email_confirm: true,
      user_metadata: { 
        real_email: email,
        operator_id: operatorId,
        name: email.split('@')[0],
        is_auto_generated: !rawEmail
      }
    });

    if (authError) throw authError;

    const userId = authUser.user.id;

    // 5. Database Sync: profiles and members
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: userId,
      email: email,
      operator_id: operatorId,
      name: email.split('@')[0],
      sponsor_id: sponsor_id,
      parent_id: finalPlacementId,
      side: side,
      position: side.toLowerCase(),
      status: 'inactive',
      role: 'user',
      created_at: new Date().toISOString()
    });

    if (profileError) {
      // Rollback auth
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(`Profile Sync Failed: ${profileError.message}`);
    }

    const { error: memberError } = await supabaseAdmin.from('members').insert({
      id: userId,
      sponsor_id: sponsor_id,
      placement_id: finalPlacementId,
      position: side,
      is_active: false,
      created_at: new Date().toISOString()
    });

    if (memberError) {
      throw new Error(`Member Sync Failed: ${memberError.message}`);
    }

    console.log(`[SUCCESS] Registered node ${operatorId} under parent ${finalPlacementId} (${side})`);

    return new Response(JSON.stringify({ 
      success: true, 
      user: { 
        id: userId, 
        operator_id: operatorId,
        email: email,
        password: rawPassword ? '******' : password // Return password only if we generated it
      } 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("[REGISTER-NODE FATAL]:", error.message);
    return new Response(JSON.stringify({ error: error.message, success: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
