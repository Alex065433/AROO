import app from "./api/payments/index";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

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
