import Redis from 'ioredis';

/**
 * Redis Client with In-Memory Fallback
 * 
 * Features:
 * - Redis connection with automatic retry
 * - In-memory Map fallback when Redis is unavailable
 * - Compatible API between Redis and fallback
 * - TTL support in fallback using timeouts
 */

let redisClient = null;
let useFallback = false;

// In-memory fallback store
const memoryStore = new Map();
const expiryTimers = new Map();

// In-memory fallback implementation with Redis-like API
const memoryFallback = {
  async get(key) {
    const value = memoryStore.get(key);
    if (value === undefined) return null;
    return value;
  },

  async set(key, value, ...args) {
    memoryStore.set(key, value);

    // Handle EX (seconds) and PX (milliseconds) expiry
    let expiryMs = null;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === 'EX' && args[i + 1]) {
        expiryMs = parseInt(args[i + 1]) * 1000;
      }
      if (arg === 'PX' && args[i + 1]) {
        expiryMs = parseInt(args[i + 1]);
      }
    }

    if (expiryMs) {
      // Clear existing timer if present
      if (expiryTimers.has(key)) {
        clearTimeout(expiryTimers.get(key));
      }
      const timer = setTimeout(() => {
        memoryStore.delete(key);
        expiryTimers.delete(key);
      }, expiryMs);
      expiryTimers.set(key, timer);
    }

    return 'OK';
  },

  async del(key) {
    if (expiryTimers.has(key)) {
      clearTimeout(expiryTimers.get(key));
      expiryTimers.delete(key);
    }
    const deleted = memoryStore.has(key) ? 1 : 0;
    memoryStore.delete(key);
    return deleted;
  },

  async exists(key) {
    return memoryStore.has(key) ? 1 : 0;
  },

  async expire(key, seconds) {
    if (!memoryStore.has(key)) return 0;
    if (expiryTimers.has(key)) {
      clearTimeout(expiryTimers.get(key));
    }
    const timer = setTimeout(() => {
      memoryStore.delete(key);
      expiryTimers.delete(key);
    }, seconds * 1000);
    expiryTimers.set(key, timer);
    return 1;
  },

  async ttl(key) {
    // Simplified TTL - returns -2 if key doesn't exist, -1 if no expiry
    if (!memoryStore.has(key)) return -2;
    return -1; // Fallback doesn't track exact remaining TTL
  },

  async incr(key) {
    const current = memoryStore.get(key);
    const newVal = current ? parseInt(current) + 1 : 1;
    memoryStore.set(key, newVal.toString());
    return newVal;
  },

  async decr(key) {
    const current = memoryStore.get(key);
    const newVal = current ? parseInt(current) - 1 : -1;
    memoryStore.set(key, newVal.toString());
    return newVal;
  },

  // Health check
  async ping() {
    return 'PONG';
  },

  // Stats for monitoring
  getStats() {
    return {
      keys: memoryStore.size,
      mode: 'in-memory-fallback',
    };
  },
};

/**
 * Initialize Redis Connection
 * Falls back to in-memory if Redis is unavailable
 */
const initRedis = async () => {
  const redisUrl = process.env.REDIS_URL;

  // If no Redis URL provided, use fallback immediately
  if (!redisUrl) {
    console.log('⚠️ No REDIS_URL found. Using in-memory fallback.');
    useFallback = true;
    return memoryFallback;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      lazyConnect: true, // Don't connect immediately, we'll call connect()
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError(err) {
        const targetErrors = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'];
        return targetErrors.some(e => err.message.includes(e));
      },
    });

    // Event handlers
    redisClient.on('connect', () => {
      console.log('✅ Redis Connected');
      useFallback = false;
    });

    redisClient.on('error', (err) => {
      if (!useFallback && err.code === 'ECONNREFUSED') {
        console.warn('⚠️ Redis Connection Failed. Switching to in-memory fallback.');
        useFallback = true;
      }
    });

    redisClient.on('close', () => {
      console.warn('⚠️ Redis Connection Closed.');
      useFallback = true;
    });

    // Attempt connection
    await redisClient.connect();
    return redisClient;

  } catch (error) {
    console.warn('⚠️ Redis initialization failed:', error.message);
    console.log('📦 Using in-memory fallback for caching.');
    useFallback = true;
    return memoryFallback;
  }
};

/**
 * Get active Redis client or fallback
 * Always use this function to get the client - don't use redisClient directly
 */
const getRedis = () => {
  if (useFallback || !redisClient) {
    return memoryFallback;
  }
  return redisClient;
};

/**
 * Check if using fallback mode
 */
const isFallbackMode = () => useFallback;

/**
 * Graceful shutdown
 */
const closeRedis = async () => {
  if (redisClient && !useFallback) {
    await redisClient.quit();
    console.log('🔌 Redis Connection Closed');
  }
  // Clear all in-memory timers
  expiryTimers.forEach(timer => clearTimeout(timer));
  memoryStore.clear();
  expiryTimers.clear();
};

// Handle graceful shutdown
process.on('SIGINT', closeRedis);
process.on('SIGTERM', closeRedis);

export { initRedis, getRedis, isFallbackMode, closeRedis };