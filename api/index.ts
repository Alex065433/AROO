import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

let supabaseAdmin: any = null;

function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;
  
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseServiceKey) {
    try {
      supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
      console.log("Supabase Admin client initialized successfully.");
    } catch (err: any) {
      console.error(`Supabase Admin initialization FAILED: ${err.message}`);
    }
  } else {
    const missing = [];
    if (!supabaseUrl) missing.push("VITE_SUPABASE_URL");
    if (!supabaseServiceKey) missing.push("VITE_SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY");
    console.warn(`Supabase Admin client NOT initialized. Missing: ${missing.join(", ")}`);
  }
  return supabaseAdmin;
}

app.post("/api/register-user", async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ error: "Admin client not initialized" });

  try {
    const { 
      email, 
      password, 
      sponsor_id, 
      position, 
      name, 
      mobile,
      isManualPlacement,
      targetNodeId,
      withdrawalPassword,
      twoFactorPin
    } = req.body;

    const resolveToUuid = async (idOrOp: string) => {
      if (!idOrOp) return null;
      if (/^[0-9a-f-]{36}$/i.test(idOrOp)) return idOrOp;
      const { data } = await admin.from('profiles').select('id').ilike('operator_id', idOrOp).maybeSingle();
      return data?.id;
    };

    let resolvedSponsorId = await resolveToUuid(sponsor_id);
    if (!resolvedSponsorId) throw new Error(`Sponsor ${sponsor_id} not found.`);

    let resolvedPlacementId: string | null = null;
    let targetSide = (position || 'LEFT').toUpperCase();

    if (isManualPlacement && targetNodeId) {
      const manualTargetId = await resolveToUuid(targetNodeId);
      if (!manualTargetId) throw new Error("Manual target node not found.");
      resolvedSponsorId = manualTargetId;
      resolvedPlacementId = manualTargetId;
    } else {
      let currentId = resolvedSponsorId;
      let isLeafFound = false;
      while (!isLeafFound) {
        const { data: child } = await admin
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

    if (!resolvedPlacementId) throw new Error("Placement calculation failed.");

    const opId = `ARW-${Math.floor(100000 + Math.random() * 900000)}`;
    const internalEmail = `${opId.toLowerCase()}@arowintrading-internal.com`;

    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: internalEmail,
      password: password || 'Arowin123!',
      email_confirm: true,
      user_metadata: { name, operator_id: opId, real_email: email }
    });

    if (authErr) throw authErr;
    const userId = authData.user.id;

    await admin.from('profiles').insert({
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
      status: 'inactive'
    });

    await admin.from('members').insert({
      id: userId,
      sponsor_id: resolvedSponsorId,
      placement_id: resolvedPlacementId,
      position: targetSide,
      is_active: false
    });

    await admin.from('user_wallets').insert({
      id: userId,
      master_vault: 0,
      referral_box: 0,
      matching_box: 0,
      network_yield_box: 0,
      rank_bonus_box: 0
    });

    return res.json({ 
      success: true, 
      id: userId, 
      operator_id: opId, 
      message: "Registration successful" 
    });

  } catch (err: any) {
    console.error("Vercel Registration API failure:", err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/api/activate-package", async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ error: "Admin client not initialized" });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) throw new Error("Invalid Session");
    
    const userId = user.id;
    const { amount } = req.body;
    const activationAmount = Number(amount || 50);

    const { data: wallet } = await admin.from('user_wallets').select('master_vault').eq('id', userId).single();
    if (!wallet || Number(wallet.master_vault) < activationAmount) throw new Error("INSUFFICIENT BALANCE");

    const { error: deductErr } = await admin.from('user_wallets').update({ 
      master_vault: (Number(wallet.master_vault) - activationAmount).toFixed(4)
    }).eq('id', userId);

    if (deductErr) throw new Error("Wallet deduction failed.");

    const { data: masterProf } = await admin.from('profiles').select('operator_id, name').eq('id', userId).single();
    const nodes = Math.floor(activationAmount / 50);
    const matrixIds = [userId];

    for(let i = 1; i < nodes; i++) {
      const vId = crypto.randomUUID();
      matrixIds[i] = vId;
      const parentIdx = Math.floor((i - 1) / 2);
      const parentId = matrixIds[parentIdx];
      const side = (i % 2 !== 0) ? 'LEFT' : 'RIGHT';
      const vOpId = `${masterProf.operator_id}-V${i}`;

      await admin.from('profiles').insert({
        id: vId, operator_id: vOpId, name: `${masterProf.name} (V${i})`,
        sponsor_id: userId, is_virtual: true, status: 'active', is_active: true,
        active_package: 50, activated_at: new Date().toISOString()
      });

      await admin.from('members').insert({
        id: vId, sponsor_id: userId, placement_id: parentId, position: side, is_active: true
      });
    }

    await admin.from('profiles').update({
      status: 'active', is_active: true, active_package: activationAmount,
      activated_at: new Date().toISOString()
    }).eq('id', userId);

    return res.json({ success: true, message: "Activation successful" });
  } catch (err: any) {
    console.error("Vercel Activation API failure:", err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', environment: 'vercel', adminInitialized: !!getSupabaseAdmin() });
});

app.post("/api/admin-query", async (req, res) => {
  try {
    const { table, operation, data, match } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "No authorization header" });
    }

    const token = authHeader.split(" ")[1];
    
    if (!token) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      const missing = [];
      if (!process.env.VITE_SUPABASE_URL) missing.push("VITE_SUPABASE_URL");
      if (!process.env.VITE_SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("VITE_SUPABASE_SERVICE_KEY");
      
      return res.status(500).json({ 
        error: "Supabase Admin client not initialized",
        details: `Missing environment variables: ${missing.join(", ")}. Please add them in the app settings.`
      });
    }

    let query = admin.from(table);
    let result;

    if (operation === 'select') {
      let q = query.select(data || '*');
      if (match) {
        q = q.match(match);
      }
      result = await q;
    } else if (operation === 'insert') {
      result = await query.insert(data).select();
    } else if (operation === 'update') {
      result = await query.update(data).match(match || {}).select();
    } else if (operation === 'delete') {
      result = await query.delete().match(match || {}).select();
    } else {
      return res.status(400).json({ error: "Invalid operation" });
    }

    if (result.error) {
      console.error(`Admin Query Error [${operation} ${table}]:`, result.error);
      return res.status(400).json({ error: result.error.message });
    }

    return res.json(result.data);
  } catch (error: any) {
    console.error("Admin Query Exception:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin-setup", async (req, res) => {
  try {
    const { secret } = req.body;
    
    if (secret !== 'INITIALIZE_AROWIN_2026') {
      return res.status(401).json({ error: "Invalid setup secret" });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return res.status(500).json({ error: "Supabase Admin client not initialized" });
    }

    const adminEmail = 'admin@arowin.internal';
    const adminPassword = 'Password123!'; 
    const adminOperatorId = 'ARW-ADMIN-01';

    // 1. Create user in Auth
    const { data: userData, error: userError } = await admin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { role: 'admin', name: 'System Administrator' }
    });

    if (userError && !userError.message.includes('already registered')) {
      console.error("Admin Auth Creation Error:", userError);
      return res.status(400).json({ error: userError.message });
    }

    const userId = userData?.user?.id || (await admin.from('profiles').select('id').eq('email', adminEmail).single()).data?.id;

    if (!userId) {
      return res.status(400).json({ error: "Could not determine admin user ID" });
    }

    // 2. Create/Update profile
    const { error: profileError } = await admin.from('profiles').upsert({
      id: userId,
      operator_id: adminOperatorId,
      name: 'System Administrator',
      email: adminEmail,
      role: 'admin',
      status: 'active',
      created_at: new Date().toISOString()
    });

    if (profileError) {
      console.error("Admin Profile Creation Error:", profileError);
      return res.status(400).json({ error: profileError.message });
    }

    return res.json({ 
      success: true, 
      message: "Admin account initialized successfully.",
      credentials: {
        email: adminEmail,
        password: adminPassword,
        operatorId: adminOperatorId
      }
    });
  } catch (error: any) {
    console.error("Admin Setup Exception:", error);
    return res.status(500).json({ error: error.message });
  }
});

export default app;
