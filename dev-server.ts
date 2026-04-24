import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

import axios from "axios";

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

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      adminInitialized: !!getSupabaseAdmin(),
      environment: process.env.NODE_ENV || 'development'
    });
  });

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

  app.post("/api/admin-query", async (req, res) => {
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
  });

  app.post("/api/register-node", async (req, res) => {
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
