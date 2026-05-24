import mongoose from "mongoose";
import bcrypt from "bcryptjs";

/**
 * User Model
 * Stores user accounts with bcrypt hashed passwords
 */
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username cannot exceed 30 characters"],
      match: [
        /^[a-zA-Z0-9_ ]+$/,
        "Username can only contain letters, numbers, underscores, and spaces",
      ],
      index: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please provide a valid email address",
      ],
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // Don't include password in queries by default
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    avatar: {
      type: String,
      default: null,
    },
    // Profile information
    firstName: {
      type: String,
      trim: true,
      maxlength: [50, "First name cannot exceed 50 characters"],
      default: null,
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: [50, "Last name cannot exceed 50 characters"],
      default: null,
    },
    // Account status
    status: {
      type: String,
      enum: ["active", "suspended", "deleted"],
      default: "active",
    },
    // Login tracking
    lastLogin: {
      type: Date,
      default: null,
    },
    loginCount: {
      type: Number,
      default: 0,
    },
    // Security
    passwordChangedAt: {
      type: Date,
      default: null,
    },
    passwordResetOTP: {
      type: String,
      default: null,
    },
    passwordResetOTPExpiry: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes for performance
userSchema.index({ email: 1, isVerified: 1 });
userSchema.index({ username: "text", email: "text" });

// Virtual for full name
userSchema.virtual("fullName").get(function () {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.username;
});

// Virtual to populate meetings hosted by this user
userSchema.virtual("meetings", {
  ref: "Meeting",
  localField: "_id",
  foreignField: "host",
});

// Pre-save middleware to hash password
userSchema.pre("save", async function (next) {
  // Only hash if password is modified
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12); // 12 rounds for security
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to check if password was changed after JWT issued
userSchema.methods.isPasswordChangedAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10,
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Instance method to sanitize user object (remove sensitive data)
userSchema.methods.toSafeObject = function () {
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    isVerified: this.isVerified,
    firstName: this.firstName,
    lastName: this.lastName,
    fullName: this.fullName,
    avatar: this.avatar,
    status: this.status,
    lastLogin: this.lastLogin,
    loginCount: this.loginCount,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// Static method to find by email (case-insensitive)
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Static method to find by username (case-insensitive)
userSchema.statics.findByUsername = function (username) {
  return this.findOne({
    username: { $regex: new RegExp(`^${username}$`, "i") },
  });
};

// Static method to check if email exists
userSchema.statics.emailExists = async function (email) {
  const count = await this.countDocuments({ email: email.toLowerCase() });
  return count > 0;
};

// Static method to check if username exists
userSchema.statics.usernameExists = async function (username) {
  const count = await this.countDocuments({
    username: { $regex: new RegExp(`^${username}$`, "i") },
  });
  return count > 0;
};

const User = mongoose.model("User", userSchema);

export default User;
