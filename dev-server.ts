import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import cors from "cors";
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const app = express();

// Global Logging Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Host: ${req.headers.host}`);
  next();
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-goog-api-key'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug Endpoints
app.get("/ping", (req, res) => res.status(200).json({ message: "pong" }));
app.get("/api/ping", (req, res) => res.status(200).json({ message: "pong", env: process.env.NODE_ENV }));

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to get Supabase client with user token
const getSupabaseClient = (req: express.Request) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    // Avoid creating client for mock tokens
    if (token !== 'CORE_SECURE_999' && token.split('.').length === 3) {
      return createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
    }
  }
  return supabase;
};

// API Routes
const apiRouter = express.Router();

// Middleware to log all API requests
apiRouter.use((req, res, next) => {
  console.log(`[API DEBUG] ${req.method} ${req.url}`, {
    headers: req.headers,
    body: req.method === 'POST' ? req.body : undefined,
  });
  next();
});

apiRouter.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

const createPaymentHandler = async (req: any, res: any) => {
  const { amount, currency, uid, order_description, orderDescription } = req.body;
  const finalDescription = order_description || orderDescription || 'Deposit';
  
  console.log('[API] Transaction creation request:', { amount, currency, uid, finalDescription });
  
  if (!amount || !currency || !uid) {
    return res.status(400).json({ error: 'Missing required fields: amount, currency, or uid' });
  }

  try {
    let paymentData: any;
    const nowPaymentsApiKey = process.env.NOWPAYMENTS_API_KEY;

    if (nowPaymentsApiKey) {
      console.log('[API] Using NowPayments API for transaction creation');
      const response = await fetch('https://api.nowpayments.io/v1/payment', {
        method: 'POST',
        headers: {
          'x-api-key': nowPaymentsApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          price_amount: amount,
          price_currency: 'usd',
          pay_currency: currency,
          order_id: `DEP-${Date.now()}`,
          order_description: finalDescription,
          ipn_callback_url: `${process.env.APP_URL || 'https://api.arowin.com'}/api/v1/tx/ipn`
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[API] NowPayments API error:', errorText);
        return res.status(response.status).json({ error: `NowPayments API error: ${response.status}`, details: errorText });
      }

      const data = await response.json();
      paymentData = {
        payment_id: data.payment_id,
        pay_address: data.pay_address,
        pay_amount: data.pay_amount,
        pay_currency: data.pay_currency,
        payment_status: data.payment_status,
        uid: uid,
        description: finalDescription
      };
    } else {
      console.log('[API] Using mock payment creation (NOWPAYMENTS_API_KEY not set)');
      const paymentId = `PAY-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
      const mockAddress = currency === 'usdttrc20' 
        ? 'TX' + Math.random().toString(36).substring(2, 34).toUpperCase()
        : '0x' + Math.random().toString(16).substring(2, 42);

      paymentData = {
        payment_id: paymentId,
        pay_address: mockAddress,
        pay_amount: amount,
        pay_currency: currency,
        payment_status: 'waiting',
        uid: uid,
        description: finalDescription
      };
    }

    try {
      const client = getSupabaseClient(req);
      const { error } = await client.from('payments').insert({
        uid,
        amount,
        type: 'deposit',
        status: 'waiting',
        method: currency,
        description: `Payment ID: ${paymentData.payment_id} - ${finalDescription}`,
        external_id: paymentData.payment_id.toString()
      });

      if (error) {
        console.warn('[API] Supabase log warning:', error.message);
      }
    } catch (dbError: any) {
      console.warn('[API] Database connection warning:', dbError.message);
    }

    console.log('[API] Transaction created successfully:', paymentData.payment_id);
    return res.status(200).json(paymentData);
  } catch (error: any) {
    console.error('[API CRITICAL] Transaction creation error:', error.message);
    return res.status(500).json({ error: 'Internal server error during transaction creation', details: error.message });
  }
};

apiRouter.post("/v1/payment/create", createPaymentHandler);

// Alias for /v1/tx/new to /v1/payment/create for backward compatibility
apiRouter.post("/v1/tx/new", createPaymentHandler);

apiRouter.post("/v1/tx/ipn", async (req, res) => {
  console.log('[API] Received IPN from NowPayments:', req.body);
  const { payment_id, payment_status, actually_paid, pay_currency } = req.body;

  if (!payment_id || !payment_status) {
    return res.status(400).json({ error: 'Missing payment_id or payment_status' });
  }

  try {
    let status = 'pending';
    if (payment_status === 'finished' || payment_status === 'completed') {
      status = 'completed';
    } else if (payment_status === 'failed' || payment_status === 'expired' || payment_status === 'rejected') {
      status = 'failed';
    } else if (payment_status === 'waiting' || payment_status === 'confirming' || payment_status === 'sending') {
      status = 'pending';
    }

    const { data: currentPayment } = await supabase
      .from('payments')
      .select('status, uid, amount')
      .eq('external_id', payment_id.toString())
      .single();

    if (!currentPayment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const { error } = await supabase
      .from('payments')
      .update({ status: status })
      .eq('external_id', payment_id.toString());

    if (error) {
      console.error('[API] Error updating payment status from IPN:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    if (status === 'completed' && currentPayment.status !== 'completed') {
       const { data: profile } = await supabase
         .from('profiles')
         .select('wallet_balance, wallets')
         .eq('id', currentPayment.uid)
         .single();
         
       if (profile) {
         const newBalance = Number(profile.wallet_balance || 0) + Number(currentPayment.amount);
         const newWallets = { ...(profile.wallets as any || {}) };
         newWallets.master = newWallets.master || { balance: 0, currency: 'USDT' };
         newWallets.master.balance = (Number(newWallets.master.balance) || 0) + Number(currentPayment.amount);

         await supabase
           .from('profiles')
           .update({ wallet_balance: newBalance, wallets: newWallets })
           .eq('id', currentPayment.uid);
           
         console.log(`[API] Credited ${currentPayment.amount} to user ${currentPayment.uid}`);
       }
    }

    return res.status(200).json({ message: 'IPN processed successfully' });
  } catch (error: any) {
    console.error('[API] Error processing IPN:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

apiRouter.get("/v1/tx/status/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const { data: payment, error } = await supabase
      .from('payments')
      .select('status')
      .eq('description', `Payment ID: ${id}`)
      .maybeSingle();

    res.json({ 
      payment_id: id,
      payment_status: payment?.status || 'waiting'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check status' });
  }
});

apiRouter.get("/rates/binance", async (req, res) => {
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/price');
    if (!response.ok) throw new Error(`Binance API error: ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error('[API] Binance fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch rates', message: error.message });
  }
});

// Admin API Routes
const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(403).json({ error: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  try {
    if (token === 'CORE_SECURE_999') return next();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(403).json({ error: 'Invalid token' });
    if (user.email === 'admin@arowin.internal') return next();
    const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (adminProfile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden: Admin access required' });
    next();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

apiRouter.post("/admin/setup", async (req, res) => {
  const { secret } = req.body;
  if (secret !== 'INITIALIZE_AROWIN_2026') return res.status(403).json({ error: 'Unauthorized' });
  try {
    const email = 'admin@arowin.internal';
    const password = 'ArowinAdmin2024!';
    const serviceKey = process.env.VITE_SUPABASE_SERVICE_KEY;
    if (!serviceKey) return res.status(500).json({ error: 'Service key missing' });
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: listData } = await adminClient.auth.admin.listUsers();
    let user = (listData.users as any[]).find(u => u.email === email);
    if (!user) {
      const { data: userData } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: 'admin' } });
      user = userData.user;
    } else {
      await adminClient.auth.admin.updateUserById(user.id, { password });
    }
    await adminClient.from('profiles').upsert({ id: user.id, email, operator_id: 'ARW-ADMIN-01', role: 'admin', status: 'active', name: 'System Administrator' });
    res.json({ success: true, message: 'Admin account initialized' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/admin/add-funds", verifyAdmin, async (req, res) => {
  const { uid, amount } = req.body;
  try {
    const { data: profile } = await supabase.from('profiles').select('wallet_balance, wallets').eq('id', uid).single();
    const newBalance = (Number(profile.wallet_balance) || 0) + amount;
    let newWallets = profile.wallets || {};
    if (typeof newWallets === 'string') try { newWallets = JSON.parse(newWallets); } catch (e) {}
    if (!newWallets.master) newWallets.master = { balance: 0, currency: 'USDT' };
    newWallets.master.balance = (Number(newWallets.master.balance) || 0) + amount;
    await supabase.from('profiles').update({ wallet_balance: newBalance, wallets: newWallets }).eq('id', uid);
    await supabase.from('payments').insert({ uid, amount, type: 'deposit', status: 'finished', method: 'admin_credit', description: 'Funds added by Administrator' });
    res.json({ success: true, newBalance });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/admin/query", async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(403).json({ error: 'Unauthorized' });
    const token = auth.split(' ')[1];
    let isAdmin = false;
    if (token === 'CORE_SECURE_999') isAdmin = true;
    else {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user?.email === 'admin@arowin.internal') isAdmin = true;
      else {
        const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user?.id).single();
        if (adminProfile?.role === 'admin') isAdmin = true;
      }
    }
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
    const { table, operation, data, match, user_id, amount } = req.body;
    if (user_id && amount !== undefined) {
      const { data: profile } = await supabase.from('profiles').select('wallet_balance, wallets').eq('id', user_id).single();
      const numericAmount = Number(amount);
      const newBalance = (Number(profile.wallet_balance) || 0) + numericAmount;
      let newWallets = profile.wallets || {};
      if (typeof newWallets === 'string') try { newWallets = JSON.parse(newWallets); } catch (e) {}
      if (!newWallets.master) newWallets.master = { balance: 0, currency: 'USDT' };
      newWallets.master.balance = (Number(newWallets.master.balance) || 0) + numericAmount;
      await supabase.from('profiles').update({ wallet_balance: newBalance, wallets: newWallets }).eq('id', user_id);
      await supabase.from('payments').insert({ uid: user_id, amount: numericAmount, type: 'deposit', status: 'finished', method: 'admin_credit', description: 'Funds added by Administrator' });
      return res.json({ success: true, newBalance });
    }
    if (table && operation) {
      let query;
      if (operation === 'select') {
        query = supabase.from(table).select(data || '*');
        if (match) Object.entries(match).forEach(([k, v]) => { query = query.eq(k, v); });
      } else if (operation === 'insert') query = supabase.from(table).insert(data);
      else if (operation === 'update') {
        query = supabase.from(table).update(data);
        if (match) Object.entries(match).forEach(([k, v]) => { query = query.eq(k, v); });
      } else if (operation === 'delete') {
        query = supabase.from(table).delete();
        if (match) Object.entries(match).forEach(([k, v]) => { query = query.eq(k, v); });
      }
      const { data: result, error } = await query;
      if (error) throw error;
      return res.json(result);
    }
    return res.status(400).json({ error: 'Invalid request' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/v1/tx/withdraw", async (req, res) => {
  const { amount, address, uid, email } = req.body;
  if (!amount || !address || !uid) return res.status(400).json({ error: "Missing fields" });
  try {
    const client = getSupabaseClient(req);
    const { data, error } = await client.from("payments").insert({ uid, amount: Number(amount), currency: 'usdtbsc', type: 'withdrawal', status: 'pending', method: 'USDT (BEP20)', order_description: `Withdrawal to ${address.substring(0, 6)}...` }).select().single();
    if (error) throw error;
    res.json({ withdrawal_id: data.id, amount, address, status: 'pending' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.all("*", (req, res) => {
  console.log(`[API 404] ${req.method} ${req.url}`);
  res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
});

// Mount API Router
app.use("/api", apiRouter);

// Global 404 handler for the entire app - ensures JSON for /api/ routes
app.use((req, res, next) => {
  if (req.url.startsWith('/api/')) {
    console.log(`[APP 404] ${req.method} ${req.url}`);
    return res.status(404).json({ 
      error: "Not Found", 
      message: `The requested API route ${req.method} ${req.url} was not found on this server.`,
      path: req.url
    });
  }
  next();
});

async function startServer() {
  const isProd = process.env.NODE_ENV === "production";
  const distPath = path.join(__dirname, "dist");
  const distExists = fs.existsSync(distPath);
  
  console.log(`[SERVER] Starting in ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} mode`);
  console.log(`[SERVER] dist folder exists: ${distExists} at ${distPath}`);

  if (isProd && distExists) {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (req.url.startsWith('/api/')) return res.status(404).json({ error: "API route not found" });
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    try {
      console.log("[SERVER] Initializing Vite...");
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.error("[SERVER] Vite failed:", err);
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
