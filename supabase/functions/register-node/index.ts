
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.12.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * register-node: MLM Registration with Smart Placement & Redundant Success Payloads
 */
serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const authHeader = req.headers.get('Authorization');

    // 1. Resolve Frontend Payload Variations
    const rawSponsor = body.sponsor_id || body.ref || body.parent;
    const name = body.full_name || body.name || "Arowin Member";
    const mobile = body.mobile_access || body.mobile || "";
    const password = body.security_key || body.vault_key || body.password || crypto.randomUUID();
    const twoFaPin = body.two_fa_pin || body.pin || "";
    const email = body.email;
    const side = (body.side || body.placement_side || 'LEFT').toUpperCase();

    if (!rawSponsor) throw new Error("Sponsor reference is mandatory for registration.");

    // 2. Dual ID Lookup (Profiles & Members)
    let resolvedSponsorId: string;
    
    // Check for ARW- operator_id or UUID in Profiles
    const { data: prof, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .or(`id.eq.${rawSponsor},operator_id.eq.${rawSponsor}`)
      .maybeSingle();

    if (prof) {
      resolvedSponsorId = prof.id;
    } else {
      // Check for UUID in Members table
      const { data: mem } = await supabaseAdmin
        .from('members')
        .select('id')
        .eq('id', rawSponsor)
        .maybeSingle();
      
      if (!mem) throw new Error("Identity Breach: Provided Sponsor ID not found in system.");
      resolvedSponsorId = mem.id;
    }

    // 3. Smart Placement (Tree Context vs. Referral Context)
    let trueSponsorId: string;
    let placementId: string;
    let isTreeInteraction = false;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
      if (!userErr && user) {
        trueSponsorId = user.id;
        placementId = resolvedSponsorId; // Exact placement under clicked node
        isTreeInteraction = true;
      }
    }

    if (!isTreeInteraction) {
      // Referral Link: Start at Sponsor and find Extreme outer edge
      trueSponsorId = resolvedSponsorId;
      let currentId = trueSponsorId;
      while (true) {
        const { data: child } = await supabaseAdmin
          .from('members')
          .select('id')
          .eq('placement_id', currentId)
          .eq('position', side)
          .maybeSingle();

        if (!child) {
          placementId = currentId;
          break;
        }
        currentId = child.id;
      }
    }

    // 4. Sync & Node Generation
    const timestamp = Date.now();
    const finalEmail = email || `node_${timestamp}@arowintrading-internal.com`;

    // Generate Protocol ID (ARW-XXXXXX)
    const { data: seqVal } = await supabaseAdmin.rpc('get_next_operator_id');
    const operatorId = `ARW-${seqVal || Math.floor(100000 + Math.random() * 900000)}`;

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: finalEmail,
      password: password,
      email_confirm: true,
      user_metadata: { name, operator_id: operatorId, mobile, two_fa_pin: twoFaPin }
    });

    if (authErr) throw authErr;
    const newUserId = authData.user.id;

    // Profiles Sync
    await supabaseAdmin.from('profiles').insert({
      id: newUserId,
      email: finalEmail,
      name,
      mobile,
      operator_id: operatorId,
      two_fa_pin: twoFaPin,
      sponsor_id: trueSponsorId,
      parent_id: placementId,
      side: side,
      position: side.toLowerCase(),
      status: 'inactive'
    });

    // Members Sync
    await supabaseAdmin.from('members').insert({
      id: newUserId,
      sponsor_id: trueSponsorId,
      placement_id: placementId,
      position: side,
      is_active: false
    });

    // 5. HYPER-REDUNDANT Success Payload
    const result = {
      success: true,
      message: "Registered",
      id: newUserId,
      user_id: newUserId,
      userId: newUserId,
      operator_id: operatorId,
      data: {
        id: newUserId,
        user_id: newUserId,
        user: { id: newUserId, operator_id: operatorId, email: finalEmail }
      },
      user: { id: newUserId, operator_id: operatorId, email: finalEmail }
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
