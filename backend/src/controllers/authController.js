import { validationResult, body } from "express-validator";
import User from "../models/User.js";
import { getRedis } from "../config/redis.js";
import {
  generateNumericOTP,
  generatePasswordResetOTP,
  hashToken,
} from "../utils/generateOTP.js";
import { sendOTPEmail, sendPasswordResetEmail } from "../utils/sendEmail.js";
import {
  generateTokenPair,
  revokeRefreshToken,
  revokeAllUserTokens,
} from "../utils/tokenUtils.js";
import { APIError, asyncHandler } from "../middlewares/errorHandler.js";

/**
 * Auth Controller
 * Handles all authentication flows:
 * - Signup with OTP verification
 * - Login
 * - Token refresh
 * - Forgot/Reset password
 * - Logout
 */

// Validation rules
export const signupValidation = [
  body("username")
    .trim()
    .notEmpty()
    .withMessage("Username is required")
    .isLength({ min: 3, max: 30 })
    .withMessage("Username must be 3-30 characters")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Username can only contain letters, numbers, and underscores"),
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, and one number",
    ),
];

export const loginValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
];

export const verifyOTPValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address"),
  body("otp")
    .trim()
    .notEmpty()
    .withMessage("OTP is required")
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be 6 digits")
    .isNumeric()
    .withMessage("OTP must contain only numbers"),
];

export const forgotPasswordValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),
];

/**
 * Phase 2: Verify Password Reset OTP (standalone)
 * Validates OTP without resetting password yet
 * POST /api/auth/verify-reset-otp
 */
export const verifyResetOTP = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: errors.array().reduce((acc, err) => {
        if (!acc[err.path]) acc[err.path] = [];
        acc[err.path].push(err.msg);
        return acc;
      }, {}),
    });
  }

  const { email, otp } = req.body;
  const redis = getRedis();
  const resetKey = `password:reset:${email.toLowerCase()}`;

  const storedData = await redis.get(resetKey);

  if (!storedData) {
    throw new APIError(
      400,
      "Password reset code has expired. Please request a new one.",
      "RESET_EXPIRED",
    );
  }

  let resetData;
  try {
    resetData = JSON.parse(storedData);
  } catch {
    await redis.del(resetKey);
    throw new APIError(
      400,
      "Invalid reset data. Please try again.",
      "INVALID_DATA",
    );
  }

  if (resetData.attempts >= 3) {
    await redis.del(resetKey);
    throw new APIError(
      429,
      "Maximum attempts exceeded. Please request a new code.",
      "MAX_ATTEMPTS",
    );
  }

  if (resetData.otp !== otp) {
    resetData.attempts += 1;
    await redis.set(resetKey, JSON.stringify(resetData), "KEEPTTL");
    const remaining = 3 - resetData.attempts;
    throw new APIError(
      400,
      `Invalid reset code. ${remaining} attempts remaining.`,
      "INVALID_OTP",
      { remainingAttempts: remaining },
    );
  }

  // OTP valid — do NOT delete from Redis yet, resetPassword still needs it
  res.status(200).json({
    success: true,
    message: "OTP verified successfully.",
    data: { email, otp },
  });
});

export const resetPasswordValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address"),
  body("otp")
    .trim()
    .notEmpty()
    .withMessage("OTP is required")
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be 6 digits"),
  body("newPassword")
    .notEmpty()
    .withMessage("New password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, and one number",
    ),
];

export const refreshTokenValidation = [
  body("refreshToken").notEmpty().withMessage("Refresh token is required"),
];

/**
 * ==========================================
 * SIGNUP FLOW
 * ==========================================
 */

/**
 * Step 1: Initiate Signup
 * Creates a pending signup record and sends OTP
 * POST /api/auth/signup
 */
export const signup = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorDetails = {};
    errors.array().forEach((err) => {
      if (!errorDetails[err.path]) errorDetails[err.path] = [];
      errorDetails[err.path].push(err.msg);
    });
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: errorDetails,
    });
  }

  const { username, email, password } = req.body;
  const redis = getRedis();

  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [
      { email: email.toLowerCase() },
      { username: { $regex: new RegExp(`^${username}$`, "i") } },
    ],
  });

  if (existingUser) {
    if (existingUser.email.toLowerCase() === email.toLowerCase()) {
      throw new APIError(
        409,
        "An account with this email already exists",
        "EMAIL_EXISTS",
      );
    }
    throw new APIError(409, "Username is already taken", "USERNAME_EXISTS");
  }

  // Generate OTP
  const otp = generateNumericOTP(6);
  const otpExpiryMinutes = 5;
  const otpKey = `signup:otp:${email.toLowerCase()}`;

  // Store signup data with OTP in Redis
  const signupData = {
    username,
    email: email.toLowerCase(),
    password, // Will be hashed when user is created
    otp,
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  // Store in Redis with 5 minute expiry
  await redis.set(
    otpKey,
    JSON.stringify(signupData),
    "EX",
    otpExpiryMinutes * 60,
  );

  // Send OTP email
  const emailResult = await sendOTPEmail(email, otp, username);

  if (!emailResult.success) {
    // Clean up Redis on email failure
    await redis.del(otpKey);
    throw new APIError(
      500,
      "Failed to send verification email. Please try again.",
      "EMAIL_SEND_FAILED",
    );
  }

  console.log(
    `📧 Signup OTP sent to ${email}: ${otp} (expires in ${otpExpiryMinutes} min)`,
  );

  res.status(200).json({
    success: true,
    message: `Verification code sent to ${email}. Please check your inbox.`,
    data: {
      email,
      expiresIn: otpExpiryMinutes * 60, // seconds
      expiresAt: new Date(Date.now() + otpExpiryMinutes * 60000).toISOString(),
    },
  });
});

/**
 * Step 2: Verify OTP and Create User
 * Validates OTP and creates the user account
 * POST /api/auth/verify-otp
 */
export const verifyOTP = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: errors.array().reduce((acc, err) => {
        if (!acc[err.path]) acc[err.path] = [];
        acc[err.path].push(err.msg);
        return acc;
      }, {}),
    });
  }

  const { email, otp } = req.body;
  const redis = getRedis();
  const otpKey = `signup:otp:${email.toLowerCase()}`;

  // Get signup data from Redis
  const storedData = await redis.get(otpKey);

  if (!storedData) {
    throw new APIError(
      400,
      "OTP has expired or no signup request found. Please signup again.",
      "OTP_EXPIRED",
    );
  }

  let signupData;
  try {
    signupData = JSON.parse(storedData);
  } catch {
    await redis.del(otpKey);
    throw new APIError(
      400,
      "Invalid signup data. Please try again.",
      "INVALID_DATA",
    );
  }

  // Check max attempts (3 attempts)
  if (signupData.attempts >= 3) {
    await redis.del(otpKey);
    throw new APIError(
      429,
      "Maximum attempts exceeded. Please signup again.",
      "MAX_ATTEMPTS",
    );
  }

  // Verify OTP
  if (signupData.otp !== otp) {
    signupData.attempts += 1;
    const remainingAttempts = 3 - signupData.attempts;
    await redis.set(otpKey, JSON.stringify(signupData), "KEEPTTL");

    throw new APIError(
      400,
      `Invalid OTP. ${remainingAttempts} attempts remaining.`,
      "INVALID_OTP",
      {
        remainingAttempts,
      },
    );
  }

  // OTP is valid - create user
  const user = await User.create({
    username: signupData.username,
    email: signupData.email,
    password: signupData.password,
    isVerified: true,
  });

  // Clean up Redis
  await redis.del(otpKey);

  // Generate tokens
  const metadata = {
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  };
  const { accessToken, refreshToken } = await generateTokenPair(user, metadata);

  // Update login tracking
  user.lastLogin = new Date();
  user.loginCount += 1;
  await user.save();

  res.status(201).json({
    success: true,
    message: "Account created successfully! Welcome to VideoMeet.",
    data: {
      user: user.toSafeObject(),
      tokens: {
        accessToken,
        refreshToken,
      },
    },
  });
});

/**
 * Resend OTP
 * Generates and sends a new OTP
 * POST /api/auth/resend-otp
 */
export const resendOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new APIError(400, "Email is required", "VALIDATION_ERROR");
  }

  const redis = getRedis();
  const otpKey = `signup:otp:${email.toLowerCase()}`;

  // Check if there's a pending signup
  const storedData = await redis.get(otpKey);

  if (!storedData) {
    throw new APIError(
      400,
      "No pending signup found for this email. Please signup again.",
      "NO_PENDING_SIGNUP",
    );
  }

  let signupData;
  try {
    signupData = JSON.parse(storedData);
  } catch {
    throw new APIError(
      400,
      "Invalid signup data. Please try again.",
      "INVALID_DATA",
    );
  }

  // Check resend count (max 3 resends)
  if (signupData.resendCount >= 3) {
    await redis.del(otpKey);
    throw new APIError(
      429,
      "Maximum resend limit reached. Please signup again.",
      "MAX_RESENDS",
    );
  }

  // Generate new OTP
  const newOTP = generateNumericOTP(6);
  signupData.otp = newOTP;
  signupData.resendCount = (signupData.resendCount || 0) + 1;
  signupData.attempts = 0; // Reset attempts

  const otpExpiryMinutes = 5;
  await redis.set(
    otpKey,
    JSON.stringify(signupData),
    "EX",
    otpExpiryMinutes * 60,
  );

  // Send new OTP email
  const emailResult = await sendOTPEmail(email, newOTP, signupData.username);

  if (!emailResult.success) {
    throw new APIError(
      500,
      "Failed to resend verification code. Please try again.",
      "EMAIL_SEND_FAILED",
    );
  }

  console.log(`📧 Resent OTP to ${email}: ${newOTP}`);

  res.status(200).json({
    success: true,
    message: "New verification code sent. Please check your inbox.",
    data: {
      email,
      expiresIn: otpExpiryMinutes * 60,
      expiresAt: new Date(Date.now() + otpExpiryMinutes * 60000).toISOString(),
    },
  });
});

/**
 * ==========================================
 * LOGIN FLOW
 * ==========================================
 */

/**
 * Login
 * Authenticates user and returns tokens
 * POST /api/auth/login
 */
export const login = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: errors.array().reduce((acc, err) => {
        if (!acc[err.path]) acc[err.path] = [];
        acc[err.path].push(err.msg);
        return acc;
      }, {}),
    });
  }

  const { email, password } = req.body;

  // Find user with password
  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+password",
  );

  if (!user) {
    throw new APIError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }

  // Check if account is active
  if (user.status === "suspended") {
    throw new APIError(
      403,
      "Your account has been suspended. Please contact support.",
      "ACCOUNT_SUSPENDED",
    );
  }

  if (user.status === "deleted") {
    throw new APIError(401, "This account has been deleted", "ACCOUNT_DELETED");
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    throw new APIError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }

  // Check if email is verified
  if (!user.isVerified) {
    throw new APIError(
      403,
      "Please verify your email before logging in.",
      "EMAIL_NOT_VERIFIED",
    );
  }

  // Generate tokens
  const metadata = {
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  };
  const { accessToken, refreshToken } = await generateTokenPair(user, metadata);

  // Update login tracking
  user.lastLogin = new Date();
  user.loginCount += 1;
  await user.save();

  res.status(200).json({
    success: true,
    message: "Login successful!",
    data: {
      user: user.toSafeObject(),
      tokens: {
        accessToken,
        refreshToken,
      },
    },
  });
});

/**
 * ==========================================
 * TOKEN REFRESH
 * ==========================================
 */

/**
 * Refresh Access Token
 * Uses refresh token to generate new access token
 * POST /api/auth/refresh
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: errors.array().reduce((acc, err) => {
        if (!acc[err.path]) acc[err.path] = [];
        acc[err.path].push(err.msg);
        return acc;
      }, {}),
    });
  }

  const { refreshToken: token } = req.body;

  // Import here to avoid circular dependency
  const { verifyRefreshToken, generateAccessToken } =
    await import("../utils/tokenUtils.js");

  let decoded;
  let tokenRecord;

  try {
    const result = await verifyRefreshToken(token);
    decoded = result.decoded;
    tokenRecord = result.tokenRecord;
  } catch (error) {
    if (error.name === "TokenRevokedError") {
      throw new APIError(
        401,
        "Session has been revoked. Please log in again.",
        "TOKEN_REVOKED",
      );
    }
    throw new APIError(
      401,
      "Invalid or expired refresh token",
      "INVALID_REFRESH_TOKEN",
    );
  }

  // Find user
  const user = await User.findById(decoded.userId);

  if (!user || user.status !== "active") {
    throw new APIError(
      401,
      "User not found or account is inactive",
      "USER_NOT_FOUND",
    );
  }

  // Mark old token as used
  await tokenRecord.markUsed();

  // Generate new access token
  const accessToken = generateAccessToken(user);

  res.status(200).json({
    success: true,
    message: "Token refreshed successfully",
    data: {
      accessToken,
    },
  });
});

/**
 * ==========================================
 * FORGOT PASSWORD FLOW (3-Phase)
 * ==========================================
 */

/**
 * Phase 1: Request Password Reset
 * Sends OTP to user's email
 * POST /api/auth/forgot-password
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: errors.array().reduce((acc, err) => {
        if (!acc[err.path]) acc[err.path] = [];
        acc[err.path].push(err.msg);
        return acc;
      }, {}),
    });
  }

  const { email } = req.body;
  const redis = getRedis();

  // Find user
  const user = await User.findOne({ email: email.toLowerCase() });

  // Always return success to prevent email enumeration
  // But only actually send email if user exists
  if (!user) {
    return res.status(200).json({
      success: true,
      message:
        "If an account exists with this email, a password reset code has been sent.",
    });
  }

  // Generate OTP
  const otp = generateNumericOTP(6);
  const otpExpiryMinutes = 10;
  const resetKey = `password:reset:${email.toLowerCase()}`;

  // Store in Redis
  const resetData = {
    email: email.toLowerCase(),
    otp,
    userId: user._id.toString(),
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  await redis.set(
    resetKey,
    JSON.stringify(resetData),
    "EX",
    otpExpiryMinutes * 60,
  );

  // Send password reset email
  const emailResult = await sendPasswordResetEmail(email, otp, user.username);

  if (!emailResult.success) {
    await redis.del(resetKey);
    throw new APIError(
      500,
      "Failed to send password reset email. Please try again.",
      "EMAIL_SEND_FAILED",
    );
  }

  console.log(`📧 Password reset OTP sent to ${email}: ${otp}`);

  res.status(200).json({
    success: true,
    message:
      "If an account exists with this email, a password reset code has been sent.",
    data: {
      email,
      expiresIn: otpExpiryMinutes * 60,
      expiresAt: new Date(Date.now() + otpExpiryMinutes * 60000).toISOString(),
    },
  });
});

/**
 * Phase 2: Verify Password Reset OTP
 * Validates the OTP (optional separate endpoint or part of reset)
 * This is handled within the reset-password flow
 */

/**
 * Phase 3: Reset Password
 * Verifies OTP and sets new password
 * POST /api/auth/reset-password
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: errors.array().reduce((acc, err) => {
        if (!acc[err.path]) acc[err.path] = [];
        acc[err.path].push(err.msg);
        return acc;
      }, {}),
    });
  }

  const { email, otp, newPassword } = req.body;
  const redis = getRedis();
  const resetKey = `password:reset:${email.toLowerCase()}`;

  // Get reset data from Redis
  const storedData = await redis.get(resetKey);

  if (!storedData) {
    throw new APIError(
      400,
      "Password reset code has expired. Please request a new one.",
      "RESET_EXPIRED",
    );
  }

  let resetData;
  try {
    resetData = JSON.parse(storedData);
  } catch {
    await redis.del(resetKey);
    throw new APIError(
      400,
      "Invalid reset data. Please try again.",
      "INVALID_DATA",
    );
  }

  // Check attempts
  if (resetData.attempts >= 3) {
    await redis.del(resetKey);
    throw new APIError(
      429,
      "Maximum attempts exceeded. Please request a new code.",
      "MAX_ATTEMPTS",
    );
  }

  // Verify OTP
  if (resetData.otp !== otp) {
    resetData.attempts += 1;
    await redis.set(resetKey, JSON.stringify(resetData), "KEEPTTL");
    const remaining = 3 - resetData.attempts;

    throw new APIError(
      400,
      `Invalid reset code. ${remaining} attempts remaining.`,
      "INVALID_OTP",
      {
        remainingAttempts: remaining,
      },
    );
  }

  // Find user
  const user = await User.findById(resetData.userId);

  if (!user) {
    await redis.del(resetKey);
    throw new APIError(404, "User not found", "USER_NOT_FOUND");
  }

  // Update password
  user.password = newPassword;
  user.passwordChangedAt = new Date();
  await user.save();

  // Clean up Redis
  await redis.del(resetKey);

  // Revoke all existing refresh tokens for security
  await revokeAllUserTokens(user._id);

  res.status(200).json({
    success: true,
    message:
      "Password has been reset successfully. Please log in with your new password.",
  });
});

/**
 * ==========================================
 * LOGOUT
 * ==========================================
 */

/**
 * Logout
 * Revokes refresh token and clears session
 * POST /api/auth/logout
 */
export const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  // If refresh token provided, revoke it
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

/**
 * Logout from all devices
 * Revokes all refresh tokens for the user
 * POST /api/auth/logout-all
 */
export const logoutAll = asyncHandler(async (req, res) => {
  const userId = req.userId;

  await revokeAllUserTokens(userId);

  res.status(200).json({
    success: true,
    message: "Logged out from all devices successfully",
  });
});

/**
 * ==========================================
 * AUTH STATUS / PROFILE
 * ==========================================
 */

/**
 * Get current user profile
 * GET /api/auth/me
 */
export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);

  if (!user) {
    throw new APIError(404, "User not found", "USER_NOT_FOUND");
  }

  res.status(200).json({
    success: true,
    data: {
      user: user.toSafeObject(),
    },
  });
});

/**
 * Update user profile
 * PATCH /api/auth/profile
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const { firstName, lastName, avatar } = req.body;
  const userId = req.userId;

  const updates = {};
  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  if (avatar !== undefined) updates.avatar = avatar;

  const user = await User.findByIdAndUpdate(userId, updates, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    throw new APIError(404, "User not found", "USER_NOT_FOUND");
  }

  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    data: {
      user: user.toSafeObject(),
    },
  });
});

export default {
  signup,
  verifyOTP,
  resendOTP,
  login,
  refreshToken,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  logout,
  logoutAll,
  getMe,
  updateProfile,
};
