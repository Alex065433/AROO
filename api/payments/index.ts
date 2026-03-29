import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

dotenv.config();

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY || "re_854E6gtW_NZCqaxH6gT6jwYUeSmTHettv");

// Lazy-load Supabase client to prevent startup crashes if env vars are missing
let supabaseClient: any = null;
const getSupabase = () => {
  if (supabaseClient) return supabaseClient;
  
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("Supabase environment variables are missing. Database operations will fail.");
    return null;
  }
  
  supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
  return supabaseClient;
};

app.use(express.json());

// Global request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  if (req.method === 'POST') {
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Server is running",
    environment: process.env.VERCEL ? "Vercel" : "Local"
  });
});

// --- NOWPayments Integration ---
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || "SVVSPG9-ARKMZP4-N7YJ6P8-5JDE42V";
const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET || "O9EP3CkIQkfeifulPQMwLVxsgN2JzW67";

// Mock Admin Routes
app.get("/api/admin/stats", (req, res) => {
  res.json({
    totalUsers: 1250,
    activeNodes: 842,
    totalVolume: 452310,
    pendingWithdrawals: 12
  });
});

app.get("/api/admin/users", (req, res) => {
  res.json([
    { 
      uid: 'user1', 
      name: 'John Doe', 
      email: 'john@example.com', 
      wallets: { master: { balance: 1500 } }, 
      active_package: 350, 
      created_at: new Date().toISOString()
    },
    { 
      uid: 'user2', 
      name: 'Jane Smith', 
      email: 'jane@example.com', 
      wallets: { master: { balance: 2500 } }, 
      active_package: 750, 
      created_at: new Date().toISOString()
    }
  ]);
});

app.post("/api/admin/add-funds", async (req, res) => {
  const { uid, amount, description } = req.body;
  const authHeader = req.headers.authorization;
  console.log('Admin: Received Authorization header:', authHeader ? `Present (length: ${authHeader.length})` : 'Missing');
  
  if (!uid || amount == null) {
    console.error('Admin: Missing parameters for add-funds:', { uid, amount });
    return res.status(400).json({ error: "Missing required parameters: uid and amount" });
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('Admin: Unauthorized attempt to add-funds (missing token)');
    return res.status(401).json({ error: "Unauthorized: Missing authentication token" });
  }

  const token = authHeader.split(' ')[1];
  const supabase = getSupabase();
  
  if (!supabase) {
    return res.status(500).json({ error: "Supabase client not initialized" });
  }

  try {
    // Verify user is admin
    let isAdmin = false;
    let adminEmail = 'unknown';

    if (token === 'CORE_SECURE_999') {
      isAdmin = true;
      adminEmail = 'admin@arowin.internal';
    } else {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        console.error('Admin: Failed to verify token:', authError);
        return res.status(401).json({ error: "Unauthorized: Invalid token" });
      }

      // Check if user is admin in profiles table
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError || profile?.role !== 'admin') {
        console.error('Admin: Unauthorized attempt by non-admin user:', user.email);
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      isAdmin = true;
      adminEmail = user.email || 'unknown';
    }

    if (!isAdmin) {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    console.log(`Admin (${adminEmail}): Adding ${amount} funds to ${uid}`);
    
    // Ensure amount is a number
    let numericAmount: number;
    try {
      numericAmount = parseFloat(amount.toString());
    } catch (e) {
      console.error('Admin: Failed to parse amount:', amount);
      return res.status(400).json({ error: "Invalid amount format", received: amount });
    }

    if (isNaN(numericAmount)) {
      console.error('Admin: Invalid amount format for add-funds:', { amount });
      return res.status(400).json({ error: "Invalid amount format", received: amount });
    }
    
    // Use the new admin_add_funds RPC for strict type safety and correct logic
    console.log(`Calling admin_add_funds for ${uid} with amount ${numericAmount}`);
    
    const { data, error } = await supabase.rpc('admin_add_funds', {
      p_uid: uid,
      p_amount: numericAmount
    });

    if (error) {
      console.error('Supabase RPC Error (admin_add_funds):', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return res.status(500).json({ 
        error: error.message || "Database error", 
        details: error,
        success: false 
      });
    }

    console.log('RPC Response:', data);
    
    if (data && data.success === false) {
      console.error('RPC Business Logic Error:', data.error);
      return res.status(400).json({ 
        error: data.error || "Fund addition failed", 
        success: false 
      });
    }

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in add-funds API:', error);
    res.status(500).json({ 
      error: error.message || "Failed to add funds", 
      details: error?.message || String(error) 
    });
  }
});

app.post("/api/admin/query", async (req, res) => {
  const { table, operation, data, match } = req.body;
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Unauthorized: Missing authentication token" });
  }

  const token = authHeader.split(' ')[1];
  
  // Verify token (hardcoded admin secret for now)
  if (token !== 'CORE_SECURE_999') {
    // Try to verify with Supabase Auth
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: "Supabase client not initialized" });
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
    
    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
      
    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden: Not an admin" });
    }
  }

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: "Supabase client not initialized" });

  try {
    let query = supabase.from(table);
    let result;

    if (operation === 'insert') {
      result = await query.insert(data);
    } else if (operation === 'update') {
      query = query.update(data);
      if (match) {
        for (const [key, value] of Object.entries(match)) {
          query = query.eq(key, value);
        }
      }
      result = await query;
    } else if (operation === 'delete') {
      query = query.delete();
      if (match) {
        for (const [key, value] of Object.entries(match)) {
          query = query.eq(key, value);
        }
      }
      result = await query;
    } else {
      return res.status(400).json({ error: "Invalid operation" });
    }

    if (result.error) throw result.error;
    res.json({ success: true, data: result.data });
  } catch (error: any) {
    console.error(`Admin Query Error (${operation} on ${table}):`, error);
    res.status(500).json({ error: error.message || "Query failed", details: error });
  }
});

app.post("/api/admin/activate-package", async (req, res) => {
  const { uid, packageAmount, isFree } = req.body;
  
  if (!uid || packageAmount === undefined || packageAmount === null) {
    console.error('Admin: Missing required fields for activate-package:', { uid, packageAmount, body: req.body });
    return res.status(400).json({ 
      error: "UID and Package Amount are required",
      details: { uid: !!uid, packageAmount: packageAmount !== undefined && packageAmount !== null }
    });
  }

  const supabase = getSupabase();
  
  if (!supabase) {
    return res.status(500).json({ error: "Supabase client not initialized" });
  }

  try {
    console.log(`Admin: Activating $${packageAmount} package for ${uid}`);
    
    // Ensure amount is a number
    const numericAmount = parseFloat(packageAmount.toString());
    if (isNaN(numericAmount)) {
      console.error('Admin: Invalid package amount format for activate-package:', { packageAmount });
      return res.status(400).json({ error: "Invalid package amount format", received: packageAmount });
    }
    
    // 1. Use RPC to handle explicit UUID casting for the uid column
    // This will trigger the process_package_activation and update_wallets_on_payment functions
    console.log(`Calling admin_add_payment_rpc for ${uid} with amount ${numericAmount}`);
    
    const { data, error } = await supabase.rpc('admin_add_payment_rpc', {
      p_uid: uid,
      p_amount: numericAmount,
      p_type: 'package_activation',
      p_method: isFree ? 'FREE' : 'WALLET',
      p_description: `Package Activation: $${numericAmount}${isFree ? ' (FREE)' : ''}`,
      p_status: 'finished',
      p_payment_id: null,
      p_currency: 'usdtbsc',
      p_order_id: null
    });

    if (error) {
      console.error('Supabase RPC Error (admin_add_payment_rpc):', error);
      return res.status(500).json({ 
        error: error.message || "Database error", 
        details: error,
        success: false 
      });
    }

    console.log('RPC Response:', data);
    
    if (data && data.success === false) {
      console.error('RPC Business Logic Error:', data.error);
      return res.status(400).json({ 
        error: data.error || "Activation failed", 
        success: false 
      });
    }

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in activate-package API:', error);
    res.status(500).json({ 
      error: error.message || "Failed to activate package", 
      details: error?.message || String(error) 
    });
  }
});

// Welcome Email Route
app.post("/api/email/welcome", async (req, res) => {
  const { email, name, operatorId } = req.body;

  if (!email || !operatorId) {
    return res.status(400).json({ error: "Email and Operator ID are required" });
  }

  try {
    console.log(`Sending welcome email to ${email} for operator ${operatorId}`);
    const { data, error } = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: [email],
      subject: "Welcome to Arowin Network - Your Node is Active!",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h1 style="color: #f97316; text-transform: uppercase;">Welcome to the Network</h1>
          <p>Greetings <strong>${name || 'Operator'}</strong>,</p>
          <p>Your enrollment in the Arowin Trading Financial Network has been successfully processed. Your protocol node is now synchronizing with our decentralized growth framework.</p>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f97316;">
            <p style="margin: 0; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Your Protocol ID</p>
            <p style="margin: 5px 0 0 0; font-size: 24px; font-family: monospace; font-weight: bold; color: #0f172a;">${operatorId}</p>
          </div>

          <p>Please keep this ID secure. You will need it to access your dashboard and manage your trading nodes.</p>
          
          <p style="font-size: 14px; color: #64748b; margin-top: 40px;">
            Best Regards,<br>
            <strong>Arowin System Core</strong>
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend Error:", error);
      return res.status(500).json({ error });
    }

    res.json({ success: true, data });
  } catch (err: any) {
    console.error("Email Sending Failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy for Binance Rates to avoid CORS
app.get("/api/rates/binance", async (req, res) => {
  try {
    const mirrors = [
      'https://api1.binance.com/api/v3/ticker/price',
      'https://api2.binance.com/api/v3/ticker/price',
      'https://api3.binance.com/api/v3/ticker/price',
      'https://api.binance.com/api/v3/ticker/price'
    ];

    for (const url of mirrors) {
      try {
        const response = await axios.get(url, {
          timeout: 5000,
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        if (response.data && Array.isArray(response.data)) {
          return res.json(response.data);
        }
      } catch (error: any) {
        console.warn(`Binance mirror ${url} failed: ${error.message}`);
      }
    }

    // Fallback data if all mirrors fail
    console.warn("All Binance mirrors failed, using fallback market data");
    res.json([
      { symbol: "BTCUSDT", price: "68245.50" },
      { symbol: "ETHUSDT", price: "3842.15" },
      { symbol: "BNBUSDT", price: "592.30" },
      { symbol: "SOLUSDT", price: "148.75" },
      { symbol: "ADAUSDT", price: "0.482" },
      { symbol: "XRPUSDT", price: "0.624" },
      { symbol: "DOTUSDT", price: "8.15" }
    ]);
  } catch (err: any) {
    console.error("Critical error in Binance route:", err);
    res.status(500).json({ error: "Failed to fetch market rates", details: err.message });
  }
});

// Create Payment
app.post("/api/payments/create", async (req, res) => {
  const { amount, currency, orderId, orderDescription, uid } = req.body;
  console.log(`Creating payment for UID: ${uid}, Amount: ${amount}`);

  if (!NOWPAYMENTS_API_KEY || NOWPAYMENTS_API_KEY === "SVVSPG9-ARKMZP4-N7YJ6P8-5JDE42V") {
    console.warn("Using default/missing NOWPayments API Key. Payment might fail.");
  }

  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  const baseUrl = process.env.APP_URL || `${protocol}://${host}`;

  try {
    const payload = {
      price_amount: amount,
      price_currency: "usd",
      pay_currency: currency || "usdtbsc",
      ipn_callback_url: `${baseUrl}/api/payments/ipn`,
      order_id: orderId,
      order_description: orderDescription,
    };
    
    console.log("NOWPayments Payload:", JSON.stringify(payload));
    console.log("IPN Callback URL set to:", payload.ipn_callback_url);

    const response = await axios.post(
      "https://api.nowpayments.io/v1/payment",
      payload,
      {
        headers: {
          "x-api-key": NOWPAYMENTS_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 10000 // 10s timeout
      }
    );

    console.log("NOWPayments Response Success:", response.data.payment_id);

    // Store payment info in Supabase
    const supabase = getSupabase();
    if (supabase) {
      try {
        // Ensure amount is a number
        const numericAmount = parseFloat(amount.toString());
        
        // Check if payment_id already exists to avoid unique constraint violation
        const { data: existingPayment } = await supabase
          .from('payments')
          .select('id')
          .eq('payment_id', response.data.payment_id)
          .single();

        if (existingPayment) {
          console.warn(`Payment ${response.data.payment_id} already exists. Skipping storage.`);
        } else {
          // Use RPC to handle explicit UUID casting for the uid column
          const { error: dbError } = await supabase.rpc('admin_add_payment_rpc', {
            p_uid: uid,
            p_amount: numericAmount,
            p_type: 'deposit',
            p_method: 'CRYPTO',
            p_description: orderDescription || 'Crypto Deposit',
            p_status: 'waiting',
            p_payment_id: response.data.payment_id,
            p_currency: currency || "usdtbsc",
            p_order_id: orderId || ''
          });
          
          if (dbError) {
            console.error("Supabase Payment Store Error:", dbError.message);
          } else {
            console.log("Payment stored in Supabase successfully");
          }
        }
      } catch (err) {
        console.error("Failed to store payment in Supabase:", err);
      }
    } else {
      console.warn("Skipping Supabase payment storage: Client not initialized");
    }

    res.json(response.data);
  } catch (error: any) {
    const errorData = error.response?.data || error.message;
    console.error("NOWPayments Create Error:", JSON.stringify(errorData));
    res.status(500).json({ 
      error: errorData,
      message: "Failed to initialize payment protocol with provider"
    });
  }
});

// Get Payment Status
app.get("/api/payments/status/:paymentId", async (req, res) => {
  const { paymentId } = req.params;
  
  try {
    const response = await axios.get(
      `https://api.nowpayments.io/v1/payment/${paymentId}`,
      {
        headers: {
          "x-api-key": NOWPAYMENTS_API_KEY,
        },
      }
    );

    // Also update Supabase if status is finished
    const paymentStatus = response.data.payment_status;
    if (paymentStatus === 'finished' || paymentStatus === 'partially_paid') {
      const supabase = getSupabase();
      if (supabase) {
        await supabase
          .from('payments')
          .update({ status: paymentStatus, updated_at: new Date().toISOString() })
          .eq('payment_id', paymentId);
      }
    }

    res.json(response.data);
  } catch (error: any) {
    const errorData = error.response?.data || error.message;
    console.error("NOWPayments Status Error:", JSON.stringify(errorData));
    res.status(500).json({ error: errorData });
  }
});

// Handle IPN
app.post("/api/payments/ipn", async (req, res) => {
  const signature = req.get("x-nowpayments-sig");
  const notificationsPayload = req.body;

  // Sort payload keys alphabetically for signature verification
  const sortedPayload = Object.keys(notificationsPayload)
    .sort()
    .reduce((obj: any, key) => {
      obj[key] = notificationsPayload[key];
      return obj;
    }, {});

  const hmac = crypto.createHmac("sha512", NOWPAYMENTS_IPN_SECRET);
  hmac.update(JSON.stringify(sortedPayload));
  const expectedSignature = hmac.digest("hex");

  console.log(`IPN Signature Check - Received: ${signature?.substring(0, 10)}..., Expected: ${expectedSignature.substring(0, 10)}...`);

  if (signature !== expectedSignature) {
    console.error("IPN Signature Mismatch! Verification failed.");
    return res.status(400).send("Invalid signature");
  }

  const { payment_status, payment_id, order_id, price_amount } = notificationsPayload;

  console.log(`IPN Received for Payment ${payment_id}: ${payment_status}`);

  // Update payment status in Supabase
  const supabase = getSupabase();
  if (supabase) {
    try {
      // 1. Get the payment to find the user ID and check current status
      const { data: paymentData, error: fetchError } = await supabase
        .from('payments')
        .select('uid, amount, order_id, status')
        .eq('payment_id', payment_id)
        .single();
      
      if (fetchError || !paymentData) {
        console.error("Supabase IPN Fetch Error:", fetchError?.message || "Payment not found");
        return res.status(404).send("Payment not found");
      }

      // Prevent double crediting if status was already finished or partially_paid
      if (paymentData.status === 'finished' || paymentData.status === 'partially_paid') {
         console.log(`Payment ${payment_id} already processed as ${paymentData.status}.`);
         return res.status(200).send("OK");
      }

      // 2. Update payment status in Supabase
      const { error: dbError } = await supabase
        .from('payments')
        .update({ status: payment_status, updated_at: new Date().toISOString() })
        .eq('payment_id', payment_id);
      
      if (dbError) {
        console.error("Supabase IPN Update Error:", dbError.message);
      }

      // 3. Wallet update is handled by the database trigger 'on_payment_update_wallets'
      // No manual update needed here to prevent race conditions and double-crediting.
      
      console.log(`IPN processed for ${payment_id}. Status: ${payment_status}. Database trigger will handle wallet updates.`);
      
      return res.status(200).send("OK");
    } catch (err: any) {
      console.error("Failed to process IPN in Supabase:", JSON.stringify(err, null, 2));
      return res.status(500).send("Internal Error");
    }
  } else {
    console.warn("Skipping Supabase IPN processing: Client not initialized");
  }

  res.status(200).send("OK");
});

// Catch-all for unknown /api routes to prevent falling back to Vite's SPA handler
app.all("/api/*", (req, res) => {
  console.warn(`Admin: Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: "API route not found", 
    method: req.method, 
    path: req.path 
  });
});

// Global Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("Server Error:", err);
  res.status(500).json({ 
    error: "Internal Server Error", 
    message: err.message,
    path: req.path
  });
});

export default app;
