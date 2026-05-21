/**
 * Error Handler Middleware
 * Centralized error handling with consistent response format
 * Catches all errors and returns structured JSON responses
 */

// Custom API Error class
export class APIError extends Error {
  constructor(statusCode, message, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // Distinguishes operational errors from programming errors

    Error.captureStackTrace(this, this.constructor);
  }
}

// Common error types
export const Errors = {
  // Authentication errors
  UNAUTHORIZED: (message = 'Unauthorized') =>
    new APIError(401, message, 'UNAUTHORIZED'),
  FORBIDDEN: (message = 'Forbidden') =>
    new APIError(403, message, 'FORBIDDEN'),
  TOKEN_EXPIRED: (message = 'Token has expired') =>
    new APIError(401, message, 'TOKEN_EXPIRED'),

  // Validation errors
  VALIDATION: (message, details) =>
    new APIError(400, message, 'VALIDATION_ERROR', details),
  BAD_REQUEST: (message = 'Bad request') =>
    new APIError(400, message, 'BAD_REQUEST'),

  // Resource errors
  NOT_FOUND: (resource = 'Resource') =>
    new APIError(404, `${resource} not found`, 'NOT_FOUND'),
  CONFLICT: (message = 'Resource already exists') =>
    new APIError(409, message, 'CONFLICT'),

  // Server errors
  INTERNAL: (message = 'Internal server error') =>
    new APIError(500, message, 'INTERNAL_ERROR'),
  SERVICE_UNAVAILABLE: (message = 'Service temporarily unavailable') =>
    new APIError(503, message, 'SERVICE_UNAVAILABLE'),

  // Rate limiting
  RATE_LIMIT: (message = 'Too many requests') =>
    new APIError(429, message, 'RATE_LIMIT_EXCEEDED'),

  // Email errors
  EMAIL_FAILED: (message = 'Failed to send email') =>
    new APIError(500, message, 'EMAIL_SEND_FAILED'),
};

/**
 * Central Error Handler
 * Must have 4 parameters to be recognized as error middleware
 */
export const errorHandler = (err, req, res, next) => {
  // Default error values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  let errorCode = err.code || 'INTERNAL_ERROR';
  let details = err.details || null;

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = Object.keys(err.errors).reduce((acc, key) => {
      acc[key] = err.errors[key].message;
      return acc;
    }, {});
  }

  // Handle Mongoose duplicate key errors
  if (err.code === 11000) {
    statusCode = 409;
    errorCode = 'DUPLICATE_ERROR';
    const field = Object.keys(err.keyValue)[0];
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    details = { [field]: err.keyValue[field] };
  }

  // Handle Mongoose cast errors (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    errorCode = 'INVALID_ID';
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired';
  }

  // Handle MongoDB connection errors
  if (err.name === 'MongoServerError' || err.name === 'MongooseServerSelectionError') {
    statusCode = 503;
    errorCode = 'DATABASE_ERROR';
    message = 'Database connection error. Please try again later.';
  }

  // Handle Redis errors
  if (err.message && err.message.includes('Redis')) {
    statusCode = 503;
    errorCode = 'CACHE_ERROR';
    message = 'Cache service temporarily unavailable';
  }

  // Handle network errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    statusCode = 503;
    errorCode = 'SERVICE_UNAVAILABLE';
    message = 'External service temporarily unavailable';
  }

  // Handle SMTP errors
  if (err.message && err.message.includes('SMTP')) {
    statusCode = 500;
    errorCode = 'EMAIL_SERVICE_ERROR';
    message = 'Email service temporarily unavailable';
  }

  // Sanitize message in production (don't leak internal errors)
  if (process.env.NODE_ENV === 'production' && statusCode === 500 && !err.isOperational) {
    message = 'Internal server error';
  }

  // Build response
  const response = {
    success: false,
    message,
    ...(errorCode && { code: errorCode }),
    ...(details && { details }),
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method,
    }),
  };

  // Log error
  if (statusCode >= 500) {
    console.error(`[ERROR] ${statusCode} - ${message}`, {
      path: req.originalUrl,
      method: req.method,
      code: errorCode,
      stack: err.stack,
    });
  } else if (process.env.NODE_ENV === 'development') {
    console.warn(`[WARN] ${statusCode} - ${message} (${req.method} ${req.originalUrl})`);
  }

  // Send response
  res.status(statusCode).json(response);
};

/**
 * Async Handler Wrapper
 * Wraps async route handlers to catch errors automatically
 * Eliminates need for try-catch in every route handler
 * 
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found Handler
 * Catches requests to non-existent routes
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    code: 'ROUTE_NOT_FOUND',
  });
};

/**
 * Request Validation Error Handler
 * For express-validator errors
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = req.validationErrors || req.errors;
  if (errors && errors.length > 0) {
    const details = errors.reduce((acc, err) => {
      const field = err.param || err.path || 'general';
      if (!acc[field]) acc[field] = [];
      acc[field].push(err.msg);
      return acc;
    }, {});

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details,
    });
  }
  next();
};

/**
 * Timeout Middleware
 * Aborts requests that take too long
 */
export const requestTimeout = (timeoutMs = 30000) => {
  return (req, res, next) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({
          success: false,
          message: 'Request timeout. Please try again.',
          code: 'REQUEST_TIMEOUT',
        });
      }
    }, timeoutMs);

    // Clear timeout when response is sent
    res.on('finish', () => clearTimeout(timeout));
    res.on('close', () => clearTimeout(timeout));

    next();
  };
};

/**
 * Uncaught Exception Handler
 * Catches synchronous errors that aren't caught by Express
 */
export const setupUncaughtHandlers = () => {
  process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
    console.error(err.name, err.message);
    console.error(err.stack);

    // Graceful shutdown
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION! 💥');
    console.error('Promise:', promise);
    console.error('Reason:', reason);
  });

  // Graceful shutdown on SIGTERM
  process.on('SIGTERM', () => {
    console.log('👋 SIGTERM RECEIVED. Shutting down gracefully...');
    process.exit(0);
  });
};

export default {
  APIError,
  Errors,
  errorHandler,
  asyncHandler,
  notFoundHandler,
  handleValidationErrors,
  requestTimeout,
  setupUncaughtHandlers,
};