import app from "./api/index";

const PORT = 3000;

async function startDevServer() {
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

startDevServer();
