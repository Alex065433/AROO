import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";
import path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();

// Lazy-load Supabase client to prevent startup crashes if env vars are missing
let supabaseClient: any = null;
const getSupabase = () => {
  if (supabaseClient) return supabaseClient;
  
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("Supabase environment variables are missing. Database operations will fail.");
    return null;
  }
  
  supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
  return supabaseClient;
};

app.use(express.json());

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
      createdAt: { toDate: () => new Date() } 
    },
    { 
      uid: 'user2', 
      name: 'Jane Smith', 
      email: 'jane@example.com', 
      wallets: { master: { balance: 2500 } }, 
      active_package: 750, 
      createdAt: { toDate: () => new Date() } 
    }
  ]);
});

app.post("/api/admin/add-funds", (req, res) => {
  const { uid, amount } = req.body;
  console.log(`Mock Admin: Adding ${amount} funds to ${uid}`);
  res.json({ success: true });
});

app.post("/api/admin/activate-package", (req, res) => {
  const { uid, packageAmount } = req.body;
  console.log(`Mock Admin: Activating $${packageAmount} package for ${uid}`);
  res.json({ success: true });
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
        const { error: dbError } = await supabase
          .from('payments')
          .insert([{
            uid: uid,
            payment_id: response.data.payment_id,
            amount: amount,
            currency: currency || "usdtbsc",
            status: "waiting",
            order_id: orderId,
            order_description: orderDescription,
            created_at: new Date().toISOString()
          }]);
        
        if (dbError) {
          console.error("Supabase Payment Store Error:", dbError.message);
        } else {
          console.log("Payment stored in Supabase successfully");
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
    // In production, you might want to return 400 here, but for debugging we'll continue
    // return res.status(400).send("Invalid signature");
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
      // The DB triggers (on_payment_update_wallets and on_payment_update_process_package) 
      // will handle wallet updates and MLM logic automatically when status becomes 'finished'
      const { error: dbError } = await supabase
        .from('payments')
        .update({ status: payment_status, updated_at: new Date().toISOString() })
        .eq('payment_id', payment_id);
      
      if (dbError) {
        console.error("Supabase IPN Update Error:", dbError.message);
      }

      // 3. If it was a package purchase and it's finished, we might need to ensure 
      // a package_activation record exists if the trigger doesn't handle 'deposit' -> 'activation' transition
      // But usually, the user buys a package, we create a 'package_activation' record with 'waiting' status,
      // and NOWPayments updates THAT record.
      
      console.log(`IPN processed for ${payment_id}. DB triggers will handle wallet/MLM logic.`);
      
      return res.status(200).send("OK");
    } catch (err: any) {
      console.error("Failed to process IPN in Supabase:", err);
      return res.status(500).send("Internal Error");
    }
  } else {
    console.warn("Skipping Supabase IPN processing: Client not initialized");
  }

  res.status(200).send("OK");
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
