import dotenv from "dotenv";
dotenv.config(); // Also here for any server.js-level env reads

import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app.js";
import connectDB from "./config/db.js";
import { initRedis, isFallbackMode } from "./config/redis.js";
import { setupUncaughtHandlers } from "./middlewares/errorHandler.js";
import { cleanupExpiredTokens } from "./utils/tokenUtils.js";
import { initSignaling } from "./socket/signalingServer.js";

setupUncaughtHandlers();

const PORT = parseInt(process.env.PORT);
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";

const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const startServer = async () => {
  const startTime = Date.now();
  console.log("🚀 Starting VideoMeet API...\n");

  // Step 1: MongoDB
  try {
    console.log("📡 Connecting to MongoDB Atlas...");
    await connectDB();
    console.log("✅ Database connected\n");
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error.message);
    process.exit(1);
  }

  // Step 2: Redis
  try {
    console.log("📦 Initializing cache layer...");
    await initRedis();
    const mode = isFallbackMode() ? "In-Memory Fallback" : "Redis";
    console.log(`✅ Cache layer ready (${mode})\n`);
  } catch (error) {
    console.warn("⚠️ Cache initialization failed:", error.message);
    console.log("📦 Continuing with in-memory fallback\n");
  }

  // Step 3: Token cleanup
  try {
    console.log("🧹 Running startup maintenance...");
    const cleanedTokens = await cleanupExpiredTokens();
    console.log(`✅ Cleaned ${cleanedTokens} expired tokens\n`);
  } catch (error) {
    console.warn("⚠️ Token cleanup failed:", error.message);
  }

  // Step 4: HTTP server + Socket.IO
  const httpServer = createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins.length ? allowedOrigins : false,
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  initSignaling(io);

  // Step 5: Start listening
  httpServer.listen(PORT, HOST, () => {
    const startupTime = Date.now() - startTime;
    console.log("=".repeat(50));
    console.log("🎥 VideoMeet API Server  (HTTP + WebSocket)");
    console.log("=".repeat(50));
    console.log(`📡 Environment  : ${NODE_ENV}`);
    console.log(`🌐 HTTP URL     : http://${HOST}:${PORT}`);
    console.log(`🔌 Socket.IO    : ws://${HOST}:${PORT}`);
    console.log(
      `🔓 CORS origins : ${allowedOrigins.join(", ") || "(none — check CLIENT_URL in .env)"}`,
    );
    console.log(`⏱️  Startup time : ${startupTime}ms`);
    console.log("=".repeat(50));
    console.log("\n📚 Endpoints:");
    console.log(`  • Health     : GET  http://localhost:${PORT}/health`);
    console.log(`  • Auth       :      http://localhost:${PORT}/api/auth`);
    console.log(`  • Meetings   :      http://localhost:${PORT}/api/meeting`);
    console.log(`  • Signaling  : ws://localhost:${PORT}  (Socket.IO)`);
    console.log("\n✨ Ready!\n");
  });

  // Graceful shutdown
  const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received — shutting down...`);
    io.close(() => console.log("🔌 Socket.IO closed"));
    httpServer.close(async () => {
      console.log("🔌 HTTP server closed");
      try {
        const { closeRedis } = await import("./config/redis.js");
        await closeRedis();
      } catch {}
      console.log("👋 Goodbye!");
      process.exit(0);
    });
    setTimeout(() => {
      console.error("⚠️ Force shutdown");
      process.exit(1);
    }, 30000);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
};

startServer().catch((error) => {
  console.error("💥 Fatal error during startup:", error);
  process.exit(1);
});
