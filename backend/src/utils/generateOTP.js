import crypto from 'crypto';

/**
 * OTP Generation Utilities
 * Cryptographically secure OTP generation
 */

/**
 * Generate a numeric OTP of specified length
 * Uses crypto.randomInt for uniform distribution (no bias)
 * @param {number} length - OTP length (default: 6)
 * @returns {string} - Numeric OTP string
 */
export const generateNumericOTP = (length = 6) => {
  const digits = '0123456789';
  let otp = '';

  for (let i = 0; i < length; i++) {
    // crypto.randomInt gives uniform distribution
    const randomIndex = crypto.randomInt(0, digits.length);
    otp += digits[randomIndex];
  }

  return otp;
};

/**
 * Generate an alphanumeric OTP
 * @param {number} length - OTP length (default: 8)
 * @returns {string} - Alphanumeric OTP string
 */
export const generateAlphanumericOTP = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let otp = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    otp += chars[randomIndex];
  }

  return otp;
};

/**
 * Generate a secure token for password reset
 * @returns {string} - Hex encoded random token
 */
export const generateSecureToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Generate a token ID for refresh token rotation
 * @returns {string} - UUID v4-like random string
 */
export const generateTokenId = () => {
  return crypto.randomUUID();
};

/**
 * Hash a token for secure storage
 * Uses SHA-256 to create a deterministic hash
 * @param {string} token - Raw token to hash
 * @returns {string} - SHA-256 hash of token
 */
export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generate meeting ID
 * Format: vm-XXXX-XXXX-XXXX (readable, URL-safe)
 * @returns {string} - Unique meeting ID
 */
export const generateMeetingId = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const segments = 3;
  const segmentLength = 4;
  let id = 'vm';

  for (let s = 0; s < segments; s++) {
    id += '-';
    for (let i = 0; i < segmentLength; i++) {
      const randomIndex = crypto.randomInt(0, chars.length);
      id += chars[randomIndex];
    }
  }

  return id;
};

/**
 * Generate password reset OTP
 * 6-digit numeric code with expiry
 * @returns {Object} - { otp, hashedOTP, expiresAt }
 */
export const generatePasswordResetOTP = () => {
  const otp = generateNumericOTP(6);
  const hashedOTP = hashToken(otp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  return { otp, hashedOTP, expiresAt };
};

/**
 * Verify OTP expiry
 * @param {Date} expiresAt - OTP expiry timestamp
 * @returns {boolean} - True if OTP is still valid
 */
export const isOTPValid = (expiresAt) => {
  return new Date() < new Date(expiresAt);
};