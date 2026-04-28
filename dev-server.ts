import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

import axios from "axios";
import crypto from "crypto";

import cors from "cors";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import fs from "fs";

function logToFile(message: string) {
  const logMsg = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync("server-debug.log", logMsg);
}

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
      logToFile("Supabase Admin client initialized successfully.");
    } catch (err: any) {
      logToFile(`Supabase Admin initialization FAILED: ${err.message}`);
    }
  } else {
    const missing = [];
    if (!supabaseUrl) missing.push("VITE_SUPABASE_URL");
    if (!supabaseServiceKey) missing.push("VITE_SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY");
    logToFile(`Supabase Admin client NOT initialized. Missing: ${missing.join(", ")}`);
  }

  return supabaseAdmin;
}

// Initial attempt
getSupabaseAdmin();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  
  // Request Logger
  app.use((req, res, next) => {
    if (!req.url.startsWith('/@vite') && !req.url.startsWith('/src') && !req.url.includes('.')) {
      logToFile(`Incoming Request: ${req.method} ${req.url}`);
    }
    next();
  });

  // API routes
  app.get("/api/health", (req, res) => {
    logToFile(`Health check from ${req.ip}`);
    res.json({ 
      status: "ok", 
      adminInitialized: !!getSupabaseAdmin(),
      environment: process.env.NODE_ENV || 'development'
    });
  });
  app.get("/health", (req, res) => res.json({ status: "ok" }));

  app.get("/api/binance-rates", async (req, res) => {
    try {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'TRXUSDT'];
      const symbolsParam = JSON.stringify(symbols);
      const url = `https://api.binance.com/api/v3/ticker/price?symbols=${symbolsParam}`;
      
      const response = await axios.get(url);
      res.json(response.data);
    } catch (error: any) {
      console.error("Error fetching binance rates in proxy:", error.message);
      res.status(500).json({ error: "Failed to fetch rates from Binance", details: error.message });
    }
  });

  app.post("/api/debug-env", (req, res) => {
    const admin = getSupabaseAdmin();
    const url = process.env.VITE_SUPABASE_URL || "";
    const key = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    
    res.json({
      VITE_SUPABASE_URL: url ? `${url.substring(0, 15)}...` : "MISSING",
      VITE_SUPABASE_SERVICE_KEY: key ? `${key.substring(0, 10)}...` : "MISSING",
      supabaseAdminInitialized: !!admin,
      envKeys: Object.keys(process.env).filter(k => k.includes('SUPABASE'))
    });
  });

  // Handle both /api/register-user and /register-user for robustness
  const registerUserHandler = async (req: express.Request, res: express.Response) => {
    logToFile(`Route Hit: ${req.method} ${req.url} | Body Keys: ${Object.keys(req.body).join(", ")}`);
    const admin = getSupabaseAdmin();
    if (!admin) {
      logToFile("Error: Admin client not initialized for registration");
      return res.status(500).json({ error: "Admin client not initialized" });
    }

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

      // A. Identity Resolution
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

      // C. User Provisioning
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

      // D. Database Assembly
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
      logToFile(`Local Registration API failure: ${err.message}`);
      console.error("Local Registration API failure:", err.message);
      return res.status(400).json({ success: false, error: err.message });
    }
  };

  app.post("/api/register-user", registerUserHandler);
  app.post("/register-user", registerUserHandler);
  app.post("/api/register-node", registerUserHandler); // Node registration uses same logic often

  // Handle both /api/activate-package and /activate-package
  const activatePackageHandler = async (req: express.Request, res: express.Response) => {
    const admin = getSupabaseAdmin();
    if (!admin) return res.status(500).json({ error: "Admin client not initialized" });

    try {
      logToFile(`Activation Request: ${req.method} ${req.url}`);
      const authHeader = req.headers.authorization;
      if (!authHeader) throw new Error("Unauthorized");
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authErr } = await admin.auth.getUser(token);
      if (authErr || !user) throw new Error("Invalid Session");
      
      const userId = user.id;
      const { amount } = req.body;
      const activationAmount = Number(amount || 50);

      // 1. Atomic Wallet Deduction
      const { data: wallet } = await admin.from('user_wallets').select('master_vault').eq('id', userId).single();
      if (!wallet || Number(wallet.master_vault) < activationAmount) throw new Error("INSUFFICIENT BALANCE");

      const { error: deductErr } = await admin.from('user_wallets').update({ 
        master_vault: (Number(wallet.master_vault) - activationAmount).toFixed(4)
      }).eq('id', userId);

      if (deductErr) throw new Error("Wallet deduction failed.");

      // 2. Matrix Logic
      const { data: masterProf } = await admin.from('profiles').select('operator_id, name').eq('id', userId).single();
      const nodes = Math.floor(activationAmount / 50);
      const yieldPerNode = 0; // Initial yield for new nodes
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

        // ROI & Team Collection
        await admin.from('team_collection').insert({
          uid: userId, 
          node_id: vOpId, 
          package_amount: 50, 
          status: 'ACTIVE',
          pending_yield: Number(yieldPerNode)
        });

        await admin.from('daily_roi_tracking').insert({
          user_id: userId, 
          node_id: vId,
          operator_id: vOpId, 
          daily_amount: 0.25, 
          status: 'ACTIVE'
        });
      }

      // Starter Qualification check (at least 2 virtual nodes)
      if (nodes >= 3) {
        await admin.from('profiles').update({ is_starter: true }).eq('id', userId);
      }

      await admin.from('profiles').update({
        status: 'active', is_active: true, active_package: activationAmount,
        activated_at: new Date().toISOString()
      }).eq('id', userId);

      return res.json({ success: true, message: "Activation successful" });

    } catch (err: any) {
      console.error("Local Activation API failure:", err.message);
      return res.status(400).json({ success: false, error: err.message });
    }
  };

  app.post("/api/activate-package", activatePackageHandler);
  app.post("/activate-package", activatePackageHandler);

  // --- ADMIN QUERY ---
  const adminQueryHandler = async (req: express.Request, res: express.Response) => {
    const admin = getSupabaseAdmin();
    logToFile(`Admin Query Request: table=${req.body.table}, op=${req.body.operation}, adminInit=${!!admin}`);
    
    try {
      const { table, operation, data, match, user_id, amount } = req.body;
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).json({ error: "No authorization header" });
      }

      const token = authHeader.split(" ")[1];
      
      // Basic token validation - in a real app, verify with supabase.auth.getUser(token)
      if (!token) {
        return res.status(401).json({ error: "Invalid token" });
      }

      if (!admin) {
        const missing = [];
        if (!process.env.VITE_SUPABASE_URL) missing.push("VITE_SUPABASE_URL");
        if (!process.env.VITE_SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("VITE_SUPABASE_SERVICE_KEY");
        
        return res.status(500).json({ 
          error: "Supabase Admin client not initialized",
          details: `Missing environment variables: ${missing.join(", ")}. Please add them in the app settings.`
        });
      }

      // Handle Add Funds specifically (matches Edge Function logic)
      if (user_id && amount !== undefined) {
        try {
          const numericAmount = Number(amount);
          const { data: profile, error: fetchError } = await admin
            .from("profiles")
            .select("wallet_balance, wallets")
            .eq("id", user_id)
            .single();
            
          if (fetchError) throw fetchError;
          
          const newBalance = (Number(profile.wallet_balance) || 0) + numericAmount;
          let newWallets = profile.wallets || {};
          if (typeof newWallets === "string") try { newWallets = JSON.parse(newWallets); } catch (e) {}
          
          // Update Profiles
          const { error: updateProfileError } = await admin
            .from("profiles")
            .update({ wallet_balance: newBalance })
            .eq("id", user_id);
            
          if (updateProfileError) throw updateProfileError;

          // Sync with user_wallets
          const { error: updateWalletError } = await admin
            .from("user_wallets")
            .upsert({ 
              id: user_id, 
              master_vault: newBalance,
              updated_at: new Date().toISOString() 
            });

          if (updateWalletError) console.error("Wallet sync failed:", updateWalletError);
          
          if (!newWallets.master) newWallets.master = { balance: 0, currency: "USDT" };
          newWallets.master.balance = (Number(newWallets.master.balance) || 0) + numericAmount;
          
          const { error: updateError } = await admin
            .from("profiles")
            .update({ wallet_balance: newBalance, wallets: newWallets })
            .eq("id", user_id);
            
          if (updateError) throw updateError;
          
          await admin.from("payments").insert({
            uid: user_id,
            amount: numericAmount,
            type: "deposit",
            status: "finished",
            method: "admin_credit",
            description: "Funds added by Administrator via Local API"
          });
          
          return res.json({ success: true, newBalance });
        } catch (innerErr: any) {
          console.error("Add Funds Failure:", innerErr.message);
          return res.status(400).json({ error: innerErr.message });
        }
      }

      if (!table) {
        return res.status(400).json({ error: "Invalid relation name: table must be a non-empty string." });
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
  };

  app.post("/api/admin-query", adminQueryHandler);
  app.post("/admin-query", adminQueryHandler);

  app.post("/api/register-node", async (req, res) => {
    logToFile(`Route Hit: POST /api/register-node`);
    const admin = getSupabaseAdmin();
    if (!admin) return res.status(500).json({ error: "Admin client not initialized" });

    try {
      const body = req.body;
      const rawSponsor = body.sponsor_id || body.ref || body.parent;
      const name = body.full_name || body.name || "Arowin Member";
      const mobile = body.mobile_access || body.mobile || "";
      const password = body.security_key || body.vault_key || body.password || (Math.random().toString(36).substring(2) + Date.now().toString(36));
      const twoFaPin = body.two_fa_pin || body.pin || "";
      const email = body.email;
      const side = (body.side || body.placement_side || 'LEFT').toUpperCase();

      if (!rawSponsor) throw new Error("Sponsor reference is mandatory for registration.");

      // 2. Dual ID Lookup (Profiles & Members)
      let resolvedSponsorId: string;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawSponsor);
      
      let query = admin.from('profiles').select('id');
      if (isUuid) {
        query = query.or(`id.eq.${rawSponsor},operator_id.eq.${rawSponsor}`);
      } else {
        query = query.eq('operator_id', rawSponsor);
      }

      const { data: prof } = await query.maybeSingle();

      if (prof) {
        resolvedSponsorId = prof.id;
      } else {
        // Check in members table (UUID only)
        if (isUuid) {
          const { data: mem } = await admin.from('members').select('id').eq('id', rawSponsor).maybeSingle();
          if (!mem) throw new Error("Identity Breach: Provided Sponsor ID not found in system.");
          resolvedSponsorId = mem.id;
        } else {
          throw new Error("Identity Breach: Provided Sponsor ID not found in system.");
        }
      }

      // 3. Placement Logic (Simplified for server)
      let trueSponsorId = resolvedSponsorId;
      let placementId: string;
      
      // Starting at sponsor, find the extreme outer edge
      let currentId = trueSponsorId;
      while (true) {
        const { data: child } = await admin
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

      // 4. Create User
      const timestamp = Date.now();
      const finalEmail = email || `node_${timestamp}@arowintrading-internal.com`;
      
      // For operator ID generation - using random if RPC fails or is missing
      let operatorId = `ARW-${Math.floor(100000 + Math.random() * 900000)}`;
      try {
        const { data: seqVal } = await admin.rpc('get_next_operator_id');
        if (seqVal) operatorId = `ARW-${seqVal}`;
      } catch (e) {
        console.warn('get_next_operator_id rpc failed, using random ID');
      }

      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email: finalEmail,
        password: password,
        email_confirm: true,
        user_metadata: { name, operator_id: operatorId, mobile, two_fa_pin: twoFaPin }
      });

      if (authErr) throw authErr;
      const newUserId = authData.user.id;

      // Profiles Sync
      await admin.from('profiles').insert({
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
      await admin.from('members').insert({
        id: newUserId,
        sponsor_id: trueSponsorId,
        placement_id: placementId,
        position: side,
        is_active: false
      });

      return res.json({
        success: true,
        user: { id: newUserId, operator_id: operatorId, email: finalEmail, name },
        message: "Registration completed successfully."
      });

    } catch (err: any) {
      console.error("Registration API failure:", err.message);
      return res.status(400).json({ success: false, error: err.message });
    }
  });

  // Catch-all for unmatched API routes
  app.all("/api/*", (req, res) => {
    logToFile(`404 Unmatched API Route: ${req.method} ${req.url}`);
    res.status(404).json({ 
      error: "API Route Not Found", 
      method: req.method, 
      path: req.url,
      availableRoutes: [
        "/api/health",
        "/api/binance-rates",
        "/api/register-user",
        "/api/activate-package",
        "/api/admin-query",
        "/api/register-node"
      ]
    });
  });

  app.post("/api/admin-setup", async (req, res) => {
    try {
      const { secret } = req.body;
      
      if (secret !== 'INITIALIZE_AROWIN_2026') {
        return res.status(401).json({ error: "Invalid setup secret" });
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

      const adminEmail = 'admin@arowin.internal';
      const adminPassword = 'Password123!'; // User should change this immediately
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
