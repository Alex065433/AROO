import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

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
    res.json({ status: "ok" });
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
      const { table, operation, data, match } = req.body;
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
