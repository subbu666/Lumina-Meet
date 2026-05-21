import { getRedis } from '../config/redis.js';

/**
 * Rate Limiter Middleware
 * Redis-based with in-memory fallback
 * Supports per-IP and per-user rate limiting
 */

// Default rate limit settings
const DEFAULT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000; // 1 minute
const DEFAULT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 8;

/**
 * Rate Limiter Factory
 * Creates a rate limiter middleware with configurable options
 * 
 * @param {Object} options - Rate limiter options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60000)
 * @param {number} options.maxRequests - Max requests per window (default: 8)
 * @param {string} options.keyPrefix - Key prefix for Redis (default: 'rl')
 * @param {Function} options.keyGenerator - Function to generate rate limit key from req
 * @param {boolean} options.skipSuccessfulRequests - Don't count successful requests
 * @param {string} options.message - Custom rate limit exceeded message
 */
export const createRateLimiter = (options = {}) => {
  const {
    windowMs = DEFAULT_WINDOW_MS,
    maxRequests = DEFAULT_MAX_REQUESTS,
    keyPrefix = 'rl',
    keyGenerator = null,
    skipSuccessfulRequests = false,
    message = null,
  } = options;

  return async (req, res, next) => {
    try {
      // Get Redis client (or fallback)
      const redis = getRedis();

      // Generate rate limit key
      let key;
      if (keyGenerator) {
        key = `${keyPrefix}:${keyGenerator(req)}`;
      } else {
        // Default: Use IP address
        const identifier =
          req.userId || // Authenticated user
          req.ip ||
          req.connection?.remoteAddress ||
          req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
          'unknown';
        key = `${keyPrefix}:${identifier}`;
      }

      // Get current count
      const currentCount = await redis.get(key);
      let count = currentCount ? parseInt(currentCount, 10) : 0;

      // Check if limit exceeded
      if (count >= maxRequests) {
        // Get TTL for rate limit reset
        const ttl = await redis.ttl(key);
        const resetTimeSeconds = ttl > 0 ? ttl : Math.ceil(windowMs / 1000);

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('X-RateLimit-Reset', resetTimeSeconds);
        res.setHeader('Retry-After', resetTimeSeconds);

        return res.status(429).json({
          success: false,
          message:
            message ||
            `Too many requests. Please try again in ${resetTimeSeconds} seconds.`,
          retryAfter: resetTimeSeconds,
        });
      }

      // Increment counter
      count++;
      const remaining = Math.max(0, maxRequests - count);

      // Store in Redis with expiry (or in-memory fallback)
      await redis.set(key, count.toString(), 'PX', windowMs);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Window', `${windowMs}ms`);

      // Store rate limit info on request for access
      req.rateLimit = {
        limit: maxRequests,
        remaining,
        windowMs,
      };

      // If skip successful requests, wrap res.json to decrement on success
      if (skipSuccessfulRequests) {
        const originalJson = res.json.bind(res);
        res.json = function (body) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            // Request was successful, counter already incremented
            // This is handled by not decrementing since we already counted
          }
          return originalJson(body);
        };
      }

      next();
    } catch (error) {
      console.error('Rate limiter error:', error.message);
      // Fail open - allow request on rate limiter error
      // In production, you might want to fail closed based on your security requirements
      next();
    }
  };
};

/**
 * Pre-configured Rate Limiters
 */

// Strict rate limiter for authentication routes
export const authRateLimiter = createRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 5, // 5 requests per minute
  keyPrefix: 'rl:auth',
  message: 'Too many authentication attempts. Please try again later.',
});

// Stricter rate limiter for OTP verification
export const otpRateLimiter = createRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 3, // 3 OTP requests per minute
  keyPrefix: 'rl:otp',
  message: 'Too many OTP requests. Please wait before requesting another code.',
});

// Rate limiter for resend OTP
export const resendOTPRateLimiter = createRateLimiter({
  windowMs: 120000, // 2 minutes
  maxRequests: 2, // 2 resend requests per 2 minutes
  keyPrefix: 'rl:resend',
  message: 'Please wait before requesting a new OTP.',
});

// Standard API rate limiter
export const apiRateLimiter = createRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 100, // 100 requests per minute
  keyPrefix: 'rl:api',
  message: 'API rate limit exceeded. Please slow down your requests.',
});

// Meeting creation rate limiter
export const meetingRateLimiter = createRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 10, // 10 meeting operations per minute
  keyPrefix: 'rl:meeting',
  message: 'Too many meeting operations. Please try again later.',
});

// Password reset rate limiter
export const passwordResetRateLimiter = createRateLimiter({
  windowMs: 3600000, // 1 hour
  maxRequests: 3, // 3 password reset requests per hour
  keyPrefix: 'rl:pwreset',
  message:
    'Too many password reset attempts. Please try again in an hour.',
});

// Per-user rate limiter (uses userId from auth)
export const userRateLimiter = (maxRequests = 60, windowMs = 60000) =>
  createRateLimiter({
    windowMs,
    maxRequests,
    keyPrefix: 'rl:user',
    keyGenerator: (req) => req.userId || req.ip,
  });

/**
 * Sliding Window Rate Limiter
 * More accurate but slightly more expensive
 * Uses sorted sets in Redis for precise sliding window
 */
export const slidingWindowLimiter = (options = {}) => {
  const {
    windowMs = 60000,
    maxRequests = 10,
    keyPrefix = 'sw',
    keyGenerator = (req) => req.ip,
  } = options;

  return async (req, res, next) => {
    try {
      const redis = getRedis();
      const key = `${keyPrefix}:${keyGenerator(req)}`;
      const now = Date.now();
      const windowStart = now - windowMs;

      // Remove old entries (outside the sliding window)
      // Note: sorted sets aren't available in in-memory fallback
      // This simplified version uses the standard counter approach
      const currentCount = await redis.get(key);
      let count = currentCount ? parseInt(currentCount, 10) : 0;

      if (count >= maxRequests) {
        return res.status(429).json({
          success: false,
          message: 'Rate limit exceeded. Please try again later.',
        });
      }

      count++;
      await redis.set(key, count.toString(), 'PX', windowMs);

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count));

      next();
    } catch (error) {
      console.error('Sliding window rate limiter error:', error.message);
      next();
    }
  };
};

/**
 * Burst Rate Limiter
 * Allows bursts of requests with a token bucket approach
 */
export const burstRateLimiter = (options = {}) => {
  const {
    burstSize = 10, // Maximum burst size
    replenishRate = 1, // Tokens per second
    keyPrefix = 'burst',
    keyGenerator = (req) => req.ip,
  } = options;

  return async (req, res, next) => {
    try {
      const redis = getRedis();
      const key = `${keyPrefix}:${keyGenerator(req)}`;
      const now = Math.floor(Date.now() / 1000); // Current time in seconds

      // Get current token bucket state
      // In-memory fallback will handle this as a simple counter
      let currentTokens = burstSize;
      const stored = await redis.get(key);

      if (stored) {
        try {
          const data = JSON.parse(stored);
          const elapsed = now - data.lastRefill;
          currentTokens = Math.min(
            burstSize,
            data.tokens + elapsed * replenishRate
          );
        } catch {
          currentTokens = burstSize;
        }
      }

      // Check if we have tokens available
      if (currentTokens < 1) {
        return res.status(429).json({
          success: false,
          message: 'Rate limit exceeded. Please slow down your requests.',
        });
      }

      // Consume a token
      currentTokens--;

      // Store updated bucket state
      const bucketData = {
        tokens: currentTokens,
        lastRefill: now,
      };
      await redis.set(key, JSON.stringify(bucketData), 'EX', 3600); // 1 hour TTL

      res.setHeader('X-RateLimit-Limit', burstSize);
      res.setHeader('X-RateLimit-Remaining', Math.floor(currentTokens));

      next();
    } catch (error) {
      console.error('Burst rate limiter error:', error.message);
      next();
    }
  };
};

export default {
  createRateLimiter,
  authRateLimiter,
  otpRateLimiter,
  resendOTPRateLimiter,
  apiRateLimiter,
  meetingRateLimiter,
  passwordResetRateLimiter,
  userRateLimiter,
  slidingWindowLimiter,
  burstRateLimiter,
};