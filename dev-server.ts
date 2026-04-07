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
  console.log(`[API DEBUG] ${req.method} ${req.url}`);
  next();
});

apiRouter.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

// All other /api routes are now handled by Supabase Edge Functions
// The frontend apiFetch utility handles the routing.
apiRouter.all("*", (req, res) => {
  console.log(`[API 404] ${req.method} ${req.url} - This route should be handled by Supabase Edge Functions`);
  res.status(404).json({ 
    error: "API route not found locally", 
    message: "This request should have been routed to Supabase Edge Functions. Please check src/lib/api.ts mapping.",
    method: req.method, 
    path: req.url 
  });
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
