/**
 * JWT Configuration
 * Centralized token settings for access and refresh tokens
 */

const jwtConfig = {
  // Access Token - Short lived, used for API requests
  access: {
    secret: process.env.JWT_ACCESS_SECRET || 'default-access-secret-change-immediately',
    expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
  },

  // Refresh Token - Long lived, used to get new access tokens
  refresh: {
    secret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-immediately',
    expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  // Cookie settings for refresh token
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  },

  // Token issuer and audience
  issuer: 'video-meet-api',
  audience: 'video-meet-client',
};

/**
 * JWT Payload Structure
 * 
 * Access Token Payload:
 * {
 *   userId: ObjectId,
 *   email: string,
 *   username: string,
 *   type: 'access',
 *   iat: number,
 *   exp: number,
 *   iss: 'video-meet-api',
 *   aud: 'video-meet-client'
 * }
 * 
 * Refresh Token Payload:
 * {
 *   userId: ObjectId,
 *   tokenId: string (unique identifier for token rotation),
 *   type: 'refresh',
 *   iat: number,
 *   exp: number,
 *   iss: 'video-meet-api',
 *   aud: 'video-meet-client'
 * }
 */

export default jwtConfig;