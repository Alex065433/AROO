
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { email, password, sponsor_id: rawSponsorId, placement_side: rawSide } = body;

    if (!rawSponsorId || !rawSide) {
      throw new Error("Sponsor ID and Placement Side are mandatory.");
    }

    // 1. Resolve Sponsor & Side
    let sponsorId = rawSponsorId;
    if (String(rawSponsorId).startsWith('ARW-')) {
      const { data: sProf } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('operator_id', rawSponsorId)
        .single();
      if (sProf) sponsorId = sProf.id;
    }

    const { data: sponsorProfile, error: sponsorError } = await supabaseAdmin
      .from('profiles')
      .select('name')
      .eq('id', sponsorId)
      .single();

    if (sponsorError || !sponsorProfile) {
      throw new Error("Invalid Sponsor.");
    }

    const side = String(rawSide).toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';

    // 2. Strict Power-Leg Placement (Extreme Edge)
    let currentId = sponsorId;
    let finalPlacementId = null;

    while (true) {
      const { data: child } = await supabaseAdmin
        .from('members')
        .select('id')
        .eq('placement_id', currentId)
        .eq('position', side)
        .maybeSingle();

      if (!child) {
        finalPlacementId = currentId;
        break;
      }
      currentId = child.id;
    }

    // 3. Generate 'ARW-' ID from Sequence
    // We use RPC to get the nextval safely
    const { data: seqVal } = await supabaseAdmin.rpc('get_next_operator_id');
    const operatorId = `ARW-${seqVal || Math.floor(100000 + Math.random() * 900000)}`;

    // 4. Create Auth User
    const internalEmail = email || `${operatorId.toLowerCase()}@arowin.internal`;
    const userPassword = password || crypto.randomUUID();

    const { data: userData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      password: userPassword,
      email_confirm: true,
      user_metadata: { 
        operator_id: operatorId,
        name: email ? email.split('@')[0] : `User ${operatorId}`
      }
    });

    if (authError) throw authError;
    const userId = userData.user.id;

    // 5. Database Sync
    await supabaseAdmin.from('profiles').insert({
      id: userId,
      email: internalEmail,
      operator_id: operatorId,
      name: email ? email.split('@')[0] : `User ${operatorId}`,
      sponsor_id: sponsorId,
      parent_id: finalPlacementId,
      side: side,
      position: side.toLowerCase(),
      status: 'inactive'
    });

    await supabaseAdmin.from('members').insert({
      id: userId,
      sponsor_id: sponsorId,
      placement_id: finalPlacementId,
      position: side,
      is_active: false
    });

    return new Response(JSON.stringify({ 
      success: true, 
      sponsor_name: sponsorProfile.name,
      placed_side: side,
      user: { id: userId, operator_id: operatorId, email: internalEmail } 
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

// Note: Ensure the RPC 'get_next_operator_id' is defined in your SQL:
// CREATE OR REPLACE FUNCTION get_next_operator_id() RETURNS INT AS $$ BEGIN RETURN nextval('operator_id_seq'); END; $$ LANGUAGE plpgsql;
