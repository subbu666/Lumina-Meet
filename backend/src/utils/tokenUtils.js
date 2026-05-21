import jwt from 'jsonwebtoken';
import jwtConfig from '../config/jwt.js';
import { hashToken, generateTokenId } from './generateOTP.js';
import Token from '../models/Token.js';

/**
 * JWT Token Utilities
 * Handles access token and refresh token generation, verification, and rotation
 */

/**
 * Generate Access Token
 * Short-lived token for API authentication
 * @param {Object} user - User document
 * @returns {string} - Signed JWT access token
 */
export const generateAccessToken = (user) => {
  const payload = {
    userId: user._id.toString(),
    email: user.email,
    username: user.username,
    type: 'access',
  };

  const options = {
    expiresIn: jwtConfig.access.expiresIn,
    issuer: jwtConfig.issuer,
    audience: jwtConfig.audience,
  };

  return jwt.sign(payload, jwtConfig.access.secret, options);
};

/**
 * Generate Refresh Token
 * Long-lived token for getting new access tokens
 * Stores hash in database for security
 * @param {Object} user - User document
 * @param {Object} metadata - Additional metadata (ip, userAgent)
 * @returns {Promise<{refreshToken: string, tokenId: string}>}
 */
export const generateRefreshToken = async (user, metadata = {}) => {
  const tokenId = generateTokenId();
  const { ip = null, userAgent = null } = metadata;

  // Create JWT payload
  const payload = {
    userId: user._id.toString(),
    tokenId,
    type: 'refresh',
  };

  const options = {
    expiresIn: jwtConfig.refresh.expiresIn,
    issuer: jwtConfig.issuer,
    audience: jwtConfig.audience,
  };

  // Sign the refresh token
  const refreshToken = jwt.sign(payload, jwtConfig.refresh.secret, options);

  // Calculate expiry date
  const expiresInMs = msToMs(jwtConfig.refresh.expiresIn);
  const expiresAt = new Date(Date.now() + expiresInMs);

  // Store hash in database
  const tokenHash = hashToken(refreshToken);
  await Token.create({
    userId: user._id,
    tokenId,
    tokenHash,
    expiresAt,
    issuedByIp: ip,
    userAgent,
  });

  return { refreshToken, tokenId };
};

/**
 * Verify Access Token
 * @param {string} token - JWT access token
 * @returns {Object} - Decoded payload
 * @throws {Error} - If token is invalid or expired
 */
export const verifyAccessToken = (token) => {
  return jwt.verify(token, jwtConfig.access.secret, {
    issuer: jwtConfig.issuer,
    audience: jwtConfig.audience,
  });
};

/**
 * Verify Refresh Token
 * Also checks database for revocation status
 * @param {string} token - JWT refresh token
 * @returns {Promise<Object>} - Decoded payload with DB token record
 */
export const verifyRefreshToken = async (token) => {
  // Verify JWT signature and expiry
  const decoded = jwt.verify(token, jwtConfig.refresh.secret, {
    issuer: jwtConfig.issuer,
    audience: jwtConfig.audience,
  });

  // Check if token exists and is valid in database
  const tokenHash = hashToken(token);
  const tokenRecord = await Token.findOne({
    tokenId: decoded.tokenId,
    tokenHash,
    isRevoked: false,
    expiresAt: { $gt: new Date() },
  });

  if (!tokenRecord) {
    const error = new Error('Refresh token has been revoked or expired');
    error.name = 'TokenRevokedError';
    throw error;
  }

  return { decoded, tokenRecord };
};

/**
 * Rotate Refresh Token
 * Security best practice: Issue new refresh token, revoke old one
 * @param {string} oldRefreshToken - Current refresh token
 * @param {Object} metadata - Request metadata
 * @returns {Promise<{refreshToken: string, tokenId: string}>}
 */
export const rotateRefreshToken = async (oldRefreshToken, metadata = {}) => {
  // Verify old token
  const { decoded, tokenRecord } = await verifyRefreshToken(oldRefreshToken);

  // Find user
  const User = (await import('../models/User.js')).default;
  const user = await User.findById(decoded.userId);

  if (!user || user.status !== 'active') {
    throw new Error('User not found or account is inactive');
  }

  // Generate new refresh token
  const { refreshToken, tokenId } = await generateRefreshToken(user, metadata);

  // Revoke old token and link to new one
  tokenRecord.isRevoked = true;
  tokenRecord.revokedAt = new Date();
  tokenRecord.replacedByToken = tokenId;
  await tokenRecord.save();

  return { refreshToken, tokenId };
};

/**
 * Revoke Refresh Token
 * @param {string} refreshToken - Token to revoke
 */
export const revokeRefreshToken = async (refreshToken) => {
  try {
    const decoded = jwt.decode(refreshToken);
    if (decoded && decoded.tokenId) {
      await Token.findOneAndUpdate(
        { tokenId: decoded.tokenId },
        { isRevoked: true, revokedAt: new Date() }
      );
    }
  } catch (error) {
    console.error('Error revoking refresh token:', error.message);
  }
};

/**
 * Revoke All User Refresh Tokens
 * @param {string} userId - User ID
 */
export const revokeAllUserTokens = async (userId) => {
  await Token.revokeAllUserTokens(userId);
};

/**
 * Generate Token Pair
 * Convenience method to generate both access and refresh tokens
 * @param {Object} user - User document
 * @param {Object} metadata - Request metadata
 * @returns {Promise<{accessToken: string, refreshToken: string, tokenId: string}>}
 */
export const generateTokenPair = async (user, metadata = {}) => {
  const accessToken = generateAccessToken(user);
  const { refreshToken, tokenId } = await generateRefreshToken(user, metadata);

  return { accessToken, refreshToken, tokenId };
};

/**
 * Decode token without verification (for debugging/logging)
 * @param {string} token - JWT token
 * @returns {Object|null} - Decoded payload or null
 */
export const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
};

/**
 * Get token expiry time
 * @param {string} token - JWT token
 * @returns {Date|null} - Expiry date
 */
export const getTokenExpiry = (token) => {
  const decoded = decodeToken(token);
  if (decoded && decoded.exp) {
    return new Date(decoded.exp * 1000);
  }
  return null;
};

/**
 * Helper: Convert time string to milliseconds
 * @param {string} str - Time string like '15m', '7d', '1h'
 * @returns {number} - Milliseconds
 */
const msToMs = (str) => {
  const match = str.match(/^(\d+)([smhdw])$/);
  if (!match) return 900000; // Default 15 minutes

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
};

/**
 * Cleanup expired tokens
 * Run this periodically (e.g., daily cron job)
 */
export const cleanupExpiredTokens = async () => {
  try {
    const deletedCount = await Token.cleanupOldTokens(7); // Keep 7 days of history
    console.log(`🧹 Cleaned up ${deletedCount} expired/revoked tokens`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up tokens:', error.message);
    return 0;
  }
};

export default {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  generateTokenPair,
  decodeToken,
  getTokenExpiry,
  cleanupExpiredTokens,
};