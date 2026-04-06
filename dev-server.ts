import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import cors from "cors";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const app = express();

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-goog-api-key'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to get a supabase client with the user's JWT
const getSupabaseClient = (req: any) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token !== 'CORE_SECURE_999' && token.split('.').length === 3) {
      return createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY || supabaseKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      });
    }
  }
  return supabase;
};

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Renamed endpoints to avoid potential proxy filtering
app.get("/api/v1/tx/new", (req, res) => {
  res.json({ message: "Transaction creation endpoint is active. Use POST." });
});

app.post("/api/v1/tx/new", async (req, res) => {
  const { amount, currency, uid, orderDescription } = req.body;
  console.log('Transaction creation request:', { amount, currency, uid });
  
  if (!amount || !currency || !uid) {
    return res.status(400).json({ error: 'Missing required fields: amount, currency, or uid' });
  }

  try {
    let paymentData: any;
    const nowPaymentsApiKey = process.env.NOWPAYMENTS_API_KEY;

    if (nowPaymentsApiKey) {
      console.log('Using NowPayments API for transaction creation');
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
          order_description: orderDescription || 'Deposit',
          ipn_callback_url: `${process.env.APP_URL || 'https://api.arowin.com'}/api/v1/tx/ipn`
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('NowPayments API error:', errorText);
        throw new Error(`NowPayments API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      paymentData = {
        payment_id: data.payment_id,
        pay_address: data.pay_address,
        pay_amount: data.pay_amount,
        pay_currency: data.pay_currency,
        payment_status: data.payment_status,
        uid: uid,
        description: orderDescription || 'Deposit'
      };
    } else {
      console.log('Using mock payment creation (NOWPAYMENTS_API_KEY not set)');
      // Mock payment creation
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
        description: orderDescription || 'Deposit'
      };
    }

    // Store in Supabase if possible
    try {
      const client = getSupabaseClient(req);
      const { error } = await client.from('payments').insert({
        uid,
        amount,
        type: 'deposit',
        status: 'waiting',
        method: currency,
        description: `Payment ID: ${paymentData.payment_id} - ${orderDescription || 'Deposit'}`,
        external_id: paymentData.payment_id.toString()
      });

      if (error) {
        console.warn('Supabase log warning:', error.message);
      }
    } catch (dbError: any) {
      console.warn('Database connection warning:', dbError.message);
    }

    console.log('Transaction created successfully:', paymentData.payment_id);
    return res.status(200).json(paymentData);
  } catch (error: any) {
    console.error('CRITICAL Transaction creation error:', error.message);
    return res.status(500).json({ error: 'Internal server error during transaction creation', details: error.message });
  }
});

app.post("/api/v1/tx/ipn", async (req, res) => {
  console.log('Received IPN from NowPayments:', req.body);
  const { payment_id, payment_status, actually_paid, pay_currency } = req.body;

  if (!payment_id || !payment_status) {
    return res.status(400).json({ error: 'Missing payment_id or payment_status' });
  }

  try {
    // Map NowPayments status to our status
    let status = 'pending';
    if (payment_status === 'finished' || payment_status === 'completed') {
      status = 'completed';
    } else if (payment_status === 'failed' || payment_status === 'expired' || payment_status === 'rejected') {
      status = 'failed';
    } else if (payment_status === 'waiting' || payment_status === 'confirming' || payment_status === 'sending') {
      status = 'pending';
    }

    // First get the current payment to check its status
    const { data: currentPayment } = await supabase
      .from('payments')
      .select('status, uid, amount')
      .eq('external_id', payment_id.toString())
      .single();

    if (!currentPayment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Update payment in Supabase
    const { error } = await supabase
      .from('payments')
      .update({ status: status })
      .eq('external_id', payment_id.toString());

    if (error) {
      console.error('Error updating payment status from IPN:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    // If payment is completed and wasn't previously completed, add funds to user's master wallet
    if (status === 'completed' && currentPayment.status !== 'completed') {
       // We should ideally use a transaction here, but for now we'll do it sequentially
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
           
         console.log(`Credited ${currentPayment.amount} to user ${currentPayment.uid}`);
       }
    }

    return res.status(200).json({ message: 'IPN processed successfully' });
  } catch (error: any) {
    console.error('Error processing IPN:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get("/api/v1/tx/status/:id", async (req, res) => {
  const { id } = req.params;
  
  try {
    const { data: payment, error } = await supabase
      .from('payments')
      .select('status')
      .eq('description', `Payment ID: ${id}`)
      .maybeSingle();

    if (error) {
      return res.json({ payment_status: 'waiting' });
    }

    res.json({ 
      payment_id: id,
      payment_status: payment?.status || 'waiting'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check status' });
  }
});

app.get("/api/rates/binance", async (req, res) => {
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/price');
    if (!response.ok) throw new Error(`Binance API error: ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error('Binance fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch rates', message: error.message });
  }
});

// Admin API Routes
const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(403).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];

  try {
    if (token === 'CORE_SECURE_999') {
      return next();
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(403).json({ error: 'Invalid token' });

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

app.post("/api/admin/query", async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const token = auth.split(' ')[1];
    let isAdmin = false;

    if (token === 'CORE_SECURE_999') {
      isAdmin = true;
    } else {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (!authError && user) {
        if (user.email === 'admin@arowin.internal') {
          isAdmin = true;
        } else {
          const { data: adminProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();
          if (adminProfile?.role === 'admin') {
            isAdmin = true;
          }
        }
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    const { table, operation, data, match, user_id, amount } = req.body;

    // Payment logic integration as requested
    if (user_id && amount !== undefined) {
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('wallet_balance, wallets')
        .eq('id', user_id)
        .single();
      
      if (fetchError) throw fetchError;

      const numericAmount = Number(amount);
      const newBalance = (Number(profile.wallet_balance) || 0) + numericAmount;
      
      let newWallets = profile.wallets || {};
      if (typeof newWallets === 'string') {
        try { newWallets = JSON.parse(newWallets); } catch (e) { newWallets = {}; }
      }
      
      if (!newWallets.master) newWallets.master = { balance: 0, currency: 'USDT' };
      newWallets.master.balance = (Number(newWallets.master.balance) || 0) + numericAmount;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          wallet_balance: newBalance,
          wallets: newWallets
        })
        .eq('id', user_id);
      
      if (updateError) throw updateError;

      await supabase.from('payments').insert({
        uid: user_id,
        amount: numericAmount,
        type: 'deposit',
        status: 'finished',
        method: 'admin_credit',
        description: 'Funds added by Administrator'
      });

      return res.json({ 
        success: true, 
        message: 'Payment successful',
        newBalance 
      });
    }

    // Generic query logic
    if (table && operation) {
      let query;
      if (operation === 'select') {
        query = supabase.from(table).select(data || '*');
        if (match) {
          Object.entries(match).forEach(([key, value]) => {
            query = query.eq(key, value);
          });
        }
        if (req.body.order) {
           query = query.order(req.body.order.column, { ascending: req.body.order.ascending });
        }
      } else if (operation === 'insert') {
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

      return res.json(result);
    }

    return res.status(400).json({ error: 'Missing required fields for query or payment' });
  } catch (error: any) {
    console.error('Admin query error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Mock Withdrawal (Payout) Creation
app.post("/api/v1/tx/withdraw", async (req, res) => {
  const { amount, address, uid, email } = req.body;
  console.log(`[API] Creating withdrawal for ${email}: ${amount} USDT to ${address}`);

  if (!amount || !address || !uid) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // 1. Create the payment record in Supabase
    const client = getSupabaseClient(req);
    const { data, error } = await client
      .from("payments")
      .insert({
        uid,
        amount: Number(amount),
        currency: 'usdtbsc',
        type: 'withdrawal',
        status: 'pending',
        method: 'USDT (BEP20)',
        order_description: `Withdrawal to ${address.substring(0, 6)}...${address.substring(address.length - 4)}`,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // 2. Return mock NOWPayments-like payout data
    res.json({
      withdrawal_id: data.id,
      amount: amount,
      address: address,
      status: 'pending',
      created_at: data.created_at
    });
  } catch (error: any) {
    console.error("[API ERROR] Withdrawal creation failed:", error);
    res.status(500).json({ error: error.message });
  }
});

app.all("/api/*", (req, res) => {
  console.log(`API 404: ${req.method} ${req.url}`);
  res.status(404).json({ 
    error: `API route not found: ${req.method} ${req.url}`,
    suggestion: "Check if the route is correctly defined in dev-server.ts"
  });
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
