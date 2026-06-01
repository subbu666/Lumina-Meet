/**
 * Application Constants
 * Centralized constants for the Lumina Meet API
 */

// API Configuration
export const API_VERSION = "v1";
export const API_PREFIX = "/api";

// Authentication
export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 5;
export const PASSWORD_RESET_OTP_EXPIRY_MINUTES = 10;
export const MAX_OTP_ATTEMPTS = 3;
export const MAX_OTP_RESENDS = 3;

// JWT
export const JWT_ACCESS_EXPIRY = "15m";
export const JWT_REFRESH_EXPIRY = "7d";

// Meeting
export const MEETING_ID_PREFIX = "vm";
export const MEETING_ID_SEGMENTS = 3;
export const MEETING_ID_SEGMENT_LENGTH = 4;
export const DEFAULT_MEETING_DURATION = 60; // minutes
export const MIN_MEETING_DURATION = 5;
export const MAX_MEETING_DURATION = 480; // 8 hours
export const MAX_MEETING_PARTICIPANTS = 100;
export const MEETING_JOIN_WINDOW_MINUTES = 15; // Can join 15 min before scheduled
export const MAX_INVITES_PER_REQUEST = 50;

// ─── Recording Limits ─────────────────────────────────────────────────────────
/**
 * MAX_RECORDING_DURATION_SEC — hard cap enforced on both client and server.
 *
 * 5 minutes chosen for the following reasons:
 *   • Cloudinary free tier: 10 GB storage, 20 GB bandwidth/month.
 *     A 15-min screen+voice recording at 2800 kbps ≈ 315 MB — leaves
 *     comfortable room for multiple recordings without hitting the quota.
 *   • Resume project framing: 15 min is long enough to demonstrate any
 *     real meeting scenario; longer recordings add no showcase value.
 *   • MediaRecorder memory: keeping blobs in-memory for >5 min risks
 *     OOM on low-end devices / mobile browsers.
 *   • UX: users are nudged toward focused, purposeful recordings rather
 *     than leaving the recorder running accidentally.
 *
 * The server re-validates durationSec on /recording/signature so a
 * tampered client cannot bypass the cap.
 */
export const MAX_RECORDING_DURATION_SEC = 5 * 60; // 300 seconds = 5 minutes
export const MAX_RECORDING_DURATION_MIN = 5; // human-readable label used in UI strings

/**
 * WARNING_BEFORE_LIMIT_SEC — how many seconds before the limit the
 * useRecording hook fires the onApproachingLimit callback so the UI
 * can show a soft warning banner before the hard stop fires.
 */
export const RECORDING_WARNING_BEFORE_SEC = 120; // warn at 3:00 minutes exactly (120 seconds remaining)

// ─────────────────────────────────────────────────────────────────────────────

// Rate Limiting
export const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
export const AUTH_RATE_LIMIT_MAX = 5;
export const OTP_RATE_LIMIT_MAX = 3;
export const RESEND_OTP_RATE_LIMIT_MAX = 2;
export const API_RATE_LIMIT_MAX = 100;
export const MEETING_RATE_LIMIT_MAX = 10;
export const PASSWORD_RESET_RATE_LIMIT_MAX = 3;
export const PASSWORD_RESET_RATE_LIMIT_WINDOW_MS = 3600000; // 1 hour

// Password Requirements
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

// User
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

// Pagination
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;

// Security
export const BCRYPT_SALT_ROUNDS = 12;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MINUTES = 30;

// WebRTC/Socket.IO (future)
export const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// CORS
export const CORS_OPTIONS = {
  origin: process.env.CLIENT_URL,
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
};

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

// Error Codes
export const ERROR_CODES = {
  // Auth
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_REVOKED: "TOKEN_REVOKED",
  INVALID_TOKEN: "INVALID_TOKEN",
  EMAIL_EXISTS: "EMAIL_EXISTS",
  USERNAME_EXISTS: "USERNAME_EXISTS",
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  ACCOUNT_DELETED: "ACCOUNT_DELETED",
  OTP_EXPIRED: "OTP_EXPIRED",
  INVALID_OTP: "INVALID_OTP",
  MAX_ATTEMPTS: "MAX_ATTEMPTS",
  MAX_RESENDS: "MAX_RESENDS",

  // Meeting
  MEETING_NOT_FOUND: "MEETING_NOT_FOUND",
  MEETING_CANCELLED: "MEETING_CANCELLED",
  MEETING_ENDED: "MEETING_ENDED",
  MEETING_NOT_STARTED: "MEETING_NOT_STARTED",
  MEETING_FULL: "MEETING_FULL",
  MEETING_ID_COLLISION: "MEETING_ID_COLLISION",
  INVALID_SCHEDULE_TIME: "INVALID_SCHEDULE_TIME",
  SCHEDULE_TOO_FAR: "SCHEDULE_TOO_FAR",
  PASSWORD_REQUIRED: "PASSWORD_REQUIRED",
  INVALID_PASSWORD: "INVALID_PASSWORD",
  NOT_HOST: "NOT_HOST",

  // Recording
  RECORDING_LIMIT_EXCEEDED: "RECORDING_LIMIT_EXCEEDED",

  // General
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  UNAUTHORIZED: "UNAUTHORIZED",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  EMAIL_SEND_FAILED: "EMAIL_SEND_FAILED",
};

export default {
  API_VERSION,
  API_PREFIX,
  OTP_LENGTH,
  OTP_EXPIRY_MINUTES,
  MAX_OTP_ATTEMPTS,
  MAX_OTP_RESENDS,
  JWT_ACCESS_EXPIRY,
  JWT_REFRESH_EXPIRY,
  DEFAULT_MEETING_DURATION,
  MAX_MEETING_PARTICIPANTS,
  MEETING_JOIN_WINDOW_MINUTES,
  MAX_INVITES_PER_REQUEST,
  RATE_LIMIT_WINDOW_MS,
  AUTH_RATE_LIMIT_MAX,
  PASSWORD_MIN_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  BCRYPT_SALT_ROUNDS,
  CORS_OPTIONS,
  HTTP_STATUS,
  ERROR_CODES,
  MAX_RECORDING_DURATION_SEC,
  MAX_RECORDING_DURATION_MIN,
  RECORDING_WARNING_BEFORE_SEC,
};
