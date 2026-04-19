
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

console.log("[REGISTER-NODE] Logic Initialized.");

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
      sponsor_id, 
      placement_id, 
      position, 
      metadata = {} 
    } = body;

    if (!email || !password) {
      throw new Error("Email and password are required.");
    }

    // 1. Resolve Sponsor ID (Handle ARW-XXXXXX or UUID)
    let finalSponsorUuid = null;
    if (sponsor_id) {
        if (sponsor_id.startsWith('ARW-')) {
            const { data: sponsorProfile, error: sponsorError } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('operator_id', sponsor_id)
                .maybeSingle();
            
            if (sponsorError || !sponsorProfile) {
                // If not found, check if this is the first user
                const { count } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true });
                if (count > 0) throw new Error("Invalid Sponsor Protocol ID.");
            } else {
                finalSponsorUuid = sponsorProfile.id;
            }
        } else {
            finalSponsorUuid = sponsor_id;
        }
    }

    // 2. Generate Unique Operator ID
    let operatorId = '';
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 15) {
      const candidateId = `ARW-${Math.floor(100000 + Math.random() * 900000)}`;
      const { data: existing } = await supabaseAdmin.from('profiles').select('id').eq('operator_id', candidateId).maybeSingle();
      if (!existing) {
        operatorId = candidateId;
        isUnique = true;
      }
      attempts++;
    }
    if (!operatorId) throw new Error("Could not generate a unique Protocol ID. Please try again.");

    // 3. Create Supabase Auth User
    // We use internal email format to allow multiple IDs per real email if ever needed,
    // and to standardize login via Operator ID.
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

    // 4. MLM Placement Logic (Spillover)
    let finalParentUuid = placement_id;
    let finalPosition = position || 'LEFT';

    if (finalSponsorUuid && !finalParentUuid) {
        // BFS Placement Logic (Level-Order)
        console.log(`[PLACEMENT] Performing spillover search from sponsor ${finalSponsorUuid}`);
        const queue = [finalSponsorUuid];
        const visited = new Set();
        let found = false;

        while (queue.length > 0 && !found) {
            const currentId = queue.shift()!;
            if (visited.has(currentId)) continue;
            visited.add(currentId);

            // Check Left Slot
            const { data: leftChild } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('parent_id', currentId)
                .eq('side', 'LEFT')
                .maybeSingle();

            if (!leftChild) {
                finalParentUuid = currentId;
                finalPosition = 'LEFT';
                found = true;
                break;
            }
            queue.push(leftChild.id);

            // Check Right Slot
            const { data: rightChild } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('parent_id', currentId)
                .eq('side', 'RIGHT')
                .maybeSingle();

            if (!rightChild) {
                finalParentUuid = currentId;
                finalPosition = 'RIGHT';
                found = true;
                break;
            }
            queue.push(rightChild.id);
            
            // Safety break for extremely large trees in Edge Environment
            if (visited.size > 200) break; 
        }
    }

    // 5. Build Initial Data Objects
    const wallets = {
      master: { balance: 0, currency: 'USDT' },
      referral: { balance: 0, currency: 'USDT' },
      matching: { balance: 0, currency: 'USDT' },
      yield: { balance: 0, currency: 'USDT' },
      rankBonus: { balance: 0, currency: 'USDT' },
      incentive: { balance: 0, currency: 'USDT' },
      rewards: { balance: 0, currency: 'USDT' },
    };

    // Profile Record
    const profileInsert = {
      id: userId,
      email: email,
      operator_id: operatorId,
      name: metadata.name || email.split('@')[0],
      mobile: metadata.mobile || '',
      withdrawal_password: metadata.withdrawalPassword || '',
      two_factor_pin: metadata.twoFactorPin || '',
      sponsor_id: finalSponsorUuid,
      parent_id: finalParentUuid,
      side: finalPosition,
      position: finalPosition.toLowerCase(),
      rank: 1,
      wallet_balance: 0,
      total_income: 0,
      wallets: wallets,
      status: 'inactive',
      role: 'user',
      created_at: new Date().toISOString()
    };

    // Member Record (Enterprise MLM Table)
    const memberInsert = {
      id: userId,
      sponsor_id: finalSponsorUuid,
      placement_id: finalParentUuid,
      position: finalPosition,
      left_pv: 0,
      right_pv: 0,
      carry_forward_pv: 0,
      total_earned: 0,
      total_investment: 0,
      is_active: false,
      rank_level: 0,
      created_at: new Date().toISOString()
    };

    // 6. Database Synchronization
    const [{ error: profError }, { error: memError }] = await Promise.all([
        supabaseAdmin.from('profiles').insert(profileInsert),
        supabaseAdmin.from('members').insert(memberInsert)
    ]);

    if (profError) throw new Error(`Profile Sync Error: ${profError.message}`);
    if (memError) throw new Error(`MLM Member Sync Error: ${memError.message}`);

    console.log(`[REGISTER-NODE] User ${operatorId} (${userId}) successfully enrolled.`);

    return new Response(JSON.stringify({ 
      success: true, 
      user: { 
        id: userId, 
        operator_id: operatorId,
        email: email,
        name: profileInsert.name,
        internal_email: internalEmail
      } 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error(`[REGISTER-NODE FATAL]: ${error.message}`);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
