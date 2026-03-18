import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";
import path from "path";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Server is running without Firebase"
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
  const mirrors = [
    'https://api1.binance.com/api/v3/ticker/price',
    'https://api2.binance.com/api/v3/ticker/price',
    'https://api3.binance.com/api/v3/ticker/price',
    'https://api.binance.com/api/v3/ticker/price'
  ];

  for (const url of mirrors) {
    try {
      const response = await axios.get(url, {
        timeout: 4000,
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
  const baseUrl = `${protocol}://${host}`;

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

    // Note: Payment info is no longer stored in Firestore.
    // In a real app without Firebase, you would store this in your own database.
    console.warn("Firebase removed: Payment info NOT stored in database.");

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

  if (signature !== expectedSignature) {
    console.error("IPN Signature Mismatch!");
  }

  const { payment_status, payment_id } = notificationsPayload;

  console.log(`IPN Received for Payment ${payment_id}: ${payment_status}`);

  // Note: Firestore logic removed. 
  // In a real app, you would update your database here.
  console.warn("Firebase removed: IPN received but no database update performed.");

  res.status(200).send("OK");
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);

      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    } catch (err) {
      console.error("Failed to start Vite dev server:", err);
    }
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    
    // Only listen if not in a serverless environment (like Vercel)
    if (!process.env.VERCEL) {
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    }
  }
}

startServer();

export default app;
