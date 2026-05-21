import { verifyAccessToken, decodeToken } from '../utils/tokenUtils.js';
import User from '../models/User.js';

/**
 * Authentication Middleware
 * Verifies JWT access token and attaches user to request
 */

/**
 * Extract token from Authorization header
 * Expected format: "Bearer <token>"
 * @param {Object} req - Express request object
 * @returns {string|null} - Extracted token or null
 */
const extractToken = (req) => {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check query parameter (for WebSocket connections)
  if (req.query && req.query.token) {
    return req.query.token;
  }

  // Check cookies
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }

  return null;
};

/**
 * Authentication Middleware
 * Verifies access token and attaches user to req.user
 * Use this on protected routes
 */
export const authenticate = async (req, res, next) => {
  try {
    // Extract token from request
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No authentication token provided.',
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Access token has expired. Please refresh your token.',
          code: 'TOKEN_EXPIRED',
        });
      }
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid access token.',
        });
      }
      throw error;
    }

    // Verify token type
    if (decoded.type !== 'access') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type. Expected access token.',
      });
    }

    // Fetch user from database
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Token may be invalid.',
      });
    }

    // Check user status
    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Please contact support.',
      });
    }

    if (user.status === 'deleted') {
      return res.status(401).json({
        success: false,
        message: 'This account has been deleted.',
      });
    }

    // Check if password was changed after token was issued
    if (user.isPasswordChangedAfter(decoded.iat)) {
      return res.status(401).json({
        success: false,
        message: 'Password recently changed. Please log in again.',
        code: 'PASSWORD_CHANGED',
      });
    }

    // Attach user and token info to request
    req.user = user;
    req.userId = user._id.toString();
    req.token = {
      raw: token,
      decoded,
      issuedAt: new Date(decoded.iat * 1000),
      expiresAt: new Date(decoded.exp * 1000),
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error. Please try again.',
    });
  }
};

/**
 * Optional Authentication
 * Attaches user to request if token is valid, but doesn't require it
 * Use this for routes that work for both authenticated and anonymous users
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (token) {
      try {
        const decoded = verifyAccessToken(token);

        if (decoded.type === 'access') {
          const user = await User.findById(decoded.userId);
          if (user && user.status === 'active') {
            req.user = user;
            req.userId = user._id.toString();
            req.isAuthenticated = true;
          }
        }
      } catch {
        // Silently fail - user is not authenticated
        req.isAuthenticated = false;
      }
    } else {
      req.isAuthenticated = false;
    }

    next();
  } catch (error) {
    req.isAuthenticated = false;
    next();
  }
};

/**
 * Verified User Only
 * Ensures user has verified their email
 * Must be used after authenticate middleware
 */
export const requireVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }

  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message: 'Email verification required. Please verify your email first.',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }

  next();
};

/**
 * Attach Auth Info
 * Attaches authentication info to response headers
 * Useful for client-side token refresh logic
 */
export const attachAuthInfo = (req, res, next) => {
  if (req.token && req.token.expiresAt) {
    // Add token expiry timestamp to headers
    res.setHeader('X-Token-Expires-At', req.token.expiresAt.toISOString());

    // Calculate time until expiry in seconds
    const expiresInSeconds = Math.floor(
      (req.token.expiresAt - new Date()) / 1000
    );
    res.setHeader('X-Token-Expires-In', expiresInSeconds);
  }

  next();
};

/**
 * WebSocket Auth Middleware
 * For Socket.IO connections
 * @param {string} token - JWT token from query params
 * @returns {Promise<Object>} - User object or error
 */
export const authenticateSocket = async (token) => {
  if (!token) {
    throw new Error('Authentication token required');
  }

  try {
    const decoded = verifyAccessToken(token);

    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    const user = await User.findById(decoded.userId);

    if (!user || user.status !== 'active') {
      throw new Error('User not found or inactive');
    }

    return {
      userId: user._id.toString(),
      username: user.username,
      email: user.email,
      fullName: user.fullName,
    };
  } catch (error) {
    throw new Error(`Socket authentication failed: ${error.message}`);
  }
};

export default {
  authenticate,
  optionalAuth,
  requireVerified,
  attachAuthInfo,
  authenticateSocket,
};