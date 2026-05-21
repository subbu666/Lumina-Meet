import dotenv from "dotenv";
dotenv.config(); // ← Must be FIRST before anything reads process.env

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { apiRateLimiter } from "./middlewares/rateLimiter.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import authRoutes from "./routes/authRoutes.js";
import meetingRoutes from "./routes/meetingRoutes.js";

const app = express();
const API_PREFIX = "/api";

// Allowed origins — read after dotenv has populated process.env
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

console.log("[CORS] Allowed origins:", allowedOrigins); // ← startup diagnostic

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL] : []),
        ],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: "deny" },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true,
  }),
);

// CORS
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Postman, mobile apps, curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
    ],
    exposedHeaders: [
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "X-Token-Expires-At",
      "X-Token-Expires-In",
    ],
  }),
);

// ==========================================
// REQUEST PARSING
// ==========================================

app.use(
  express.json({
    limit: "10kb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10kb",
  }),
);

// ==========================================
// LOGGING
// ==========================================

if (process.env.NODE_ENV !== "test") {
  const logFormat =
    process.env.NODE_ENV === "production"
      ? ":remote-addr - :method :url :status :response-time ms - :res[content-length]"
      : "dev";

  app.use(
    morgan(logFormat, {
      skip: (req) => req.path === "/health",
    }),
  );
}

// ==========================================
// RATE LIMITING (Global)
// ==========================================

app.use(API_PREFIX, apiRateLimiter);

// ==========================================
// ROUTES
// ==========================================

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "VideoMeet API is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to VideoMeet API",
    documentation: "/api/docs",
    health: "/health",
    version: "1.0.0",
  });
});

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/meeting`, meetingRoutes);

// ==========================================
// ERROR HANDLING
// ==========================================

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
