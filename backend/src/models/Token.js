import mongoose from 'mongoose';

/**
 * Refresh Token Model
 * Stores refresh tokens with rotation support and expiry tracking
 */
const tokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    // Unique token identifier for rotation
    tokenId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // The actual refresh token hash (never store raw tokens)
    tokenHash: {
      type: String,
      required: true,
    },
    // Token expiry
    expiresAt: {
      type: Date,
      required: true,
      // Note: Index is created separately below with TTL options
    },
    // Token status for revocation
    isRevoked: {
      type: Boolean,
      default: false,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    // IP and user agent for security tracking
    issuedByIp: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    // Last used timestamp
    lastUsedAt: {
      type: Date,
      default: null,
    },
    // Replaced by (for token rotation tracking)
    replacedByToken: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to auto-delete expired tokens
// MongoDB will automatically delete documents when expiresAt is reached
// Note: This runs every 60 seconds by default
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for user token lookups
tokenSchema.index({ userId: 1, isRevoked: 1 });
tokenSchema.index({ tokenId: 1, isRevoked: 1 });

// Instance method to revoke token
tokenSchema.methods.revoke = async function () {
  this.isRevoked = true;
  this.revokedAt = new Date();
  await this.save();
  return this;
};

// Instance method to mark as used
tokenSchema.methods.markUsed = async function () {
  this.lastUsedAt = new Date();
  await this.save();
  return this;
};

// Instance method to check if token is expired
tokenSchema.methods.isExpired = function () {
  return new Date() > this.expiresAt;
};

// Instance method to check if token is valid (not expired and not revoked)
tokenSchema.methods.isValid = function () {
  return !this.isRevoked && !this.isExpired();
};

// Static method to find valid token by tokenId
tokenSchema.statics.findValidToken = function (tokenId) {
  return this.findOne({
    tokenId,
    isRevoked: false,
    expiresAt: { $gt: new Date() },
  });
};

// Static method to find all active tokens for a user
tokenSchema.statics.findActiveTokensForUser = function (userId) {
  return this.find({
    userId,
    isRevoked: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
};

// Static method to revoke all user tokens (logout from all devices)
tokenSchema.statics.revokeAllUserTokens = async function (userId) {
  const result = await this.updateMany(
    { userId, isRevoked: false },
    { isRevoked: true, revokedAt: new Date() }
  );
  return result.modifiedCount;
};

// Static method to clean up expired/revoked tokens older than X days
// Call this periodically or use a cron job
tokenSchema.statics.cleanupOldTokens = async function (days = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const result = await this.deleteMany({
    $or: [
      { expiresAt: { $lt: new Date() } },
      { isRevoked: true, revokedAt: { $lt: cutoffDate } },
    ],
  });
  return result.deletedCount;
};

const Token = mongoose.model('Token', tokenSchema);

export default Token;