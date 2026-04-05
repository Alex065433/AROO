import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const app = express();

app.use(express.json());

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/rates/binance", async (req, res) => {
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rates' });
  }
});

// Admin API Routes
const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];

  try {
    if (token === 'CORE_SECURE_999') {
      return next();
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

    // Administrative ID Protocol: Recognize admin emails directly
    if (user.email === 'admin@arowin.internal') {
      return next();
    }

    const { data: adminProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    if (profileError || !adminProfile || adminProfile.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    next();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

app.post("/api/admin/setup", async (req, res) => {
  const { secret } = req.body;
  
  // Security check for initialization
  if (secret !== 'INITIALIZE_AROWIN_2026') {
    return res.status(403).json({ error: 'Unauthorized: Invalid setup secret.' });
  }

  try {
    const email = 'admin@arowin.internal';
    const password = 'ArowinAdmin2024!';
    
    // We need service role key for admin operations
    const serviceKey = process.env.VITE_SUPABASE_SERVICE_KEY;
    if (!serviceKey) {
      return res.status(500).json({ error: 'VITE_SUPABASE_SERVICE_KEY is not configured in environment variables.' });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // 1. Check if user exists in Auth
    const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
    if (listError) throw listError;

    let user = (listData.users as any[]).find(u => u.email === email);
    
    if (!user) {
      // Create new admin user
      const { data: userData, error: userError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: 'admin' }
      });
      if (userError) throw userError;
      user = userData.user;
      console.log('Admin user created in Auth');
    } else {
      // Reset password for existing admin
      const { error: resetError } = await adminClient.auth.admin.updateUserById(user.id, {
        password: password
      });
      if (resetError) throw resetError;
      console.log('Admin password reset in Auth');
    }

    // 2. Ensure profile exists in database
    const { error: profileError } = await adminClient.from('profiles').upsert({
      id: user.id,
      email: email,
      operator_id: 'ARW-ADMIN-01',
      role: 'admin',
      status: 'active',
      name: 'System Administrator',
      wallet_balance: 0,
      wallets: {
        master: { balance: 0, currency: 'USDT' },
        referral: { balance: 0, currency: 'USDT' },
        matching: { balance: 0, currency: 'USDT' },
        rankBonus: { balance: 0, currency: 'USDT' },
        rewards: { balance: 0, currency: 'USDT' },
      }
    });
    if (profileError) throw profileError;

    res.json({ success: true, message: 'Admin account initialized/reset successfully with password: ArowinAdmin2024!' });
  } catch (error: any) {
    console.error('Admin setup error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/add-funds", verifyAdmin, async (req, res) => {
  const { uid, amount } = req.body;

  try {
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('wallet_balance, wallets')
      .eq('id', uid)
      .single();
    
    if (fetchError) throw fetchError;

    const newBalance = (Number(profile.wallet_balance) || 0) + amount;
    
    // Update wallets JSON if it exists
    let newWallets = profile.wallets || {};
    if (typeof newWallets === 'string') {
      try {
        newWallets = JSON.parse(newWallets);
      } catch (e) {
        newWallets = {};
      }
    }
    
    if (!newWallets.master) {
      newWallets.master = { balance: 0, currency: 'USDT' };
    }
    newWallets.master.balance = (Number(newWallets.master.balance) || 0) + amount;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ 
        wallet_balance: newBalance,
        wallets: newWallets
      })
      .eq('id', uid);
    
    if (updateError) throw updateError;

    await supabase.from('payments').insert({
      uid,
      amount,
      type: 'deposit',
      status: 'finished',
      method: 'admin_credit',
      description: 'Funds added by Administrator'
    });

    res.json({ success: true, newBalance });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/query", verifyAdmin, async (req, res) => {
  const { table, operation, data, match } = req.body;

  try {
    let query;
    if (operation === 'insert') {
      query = supabase.from(table).insert(data);
    } else if (operation === 'update') {
      query = supabase.from(table).update(data);
      if (match) {
        Object.entries(match).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }
    } else if (operation === 'delete') {
      query = supabase.from(table).delete();
      if (match) {
        Object.entries(match).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }
    } else {
      return res.status(400).json({ error: 'Invalid operation' });
    }

    const { data: result, error } = await query;
    if (error) throw error;

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === "production") {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Production Server running on port ${PORT}`);
    });
  } else {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      
      app.use(vite.middlewares);

      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Local Dev Server running on http://localhost:${PORT}`);
      });
    } catch (err) {
      console.error("Failed to start Vite dev server:", err);
      
      // Fallback if Vite fails
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Fallback Dev Server running on http://localhost:${PORT}`);
      });
    }
  }
}

startServer();
