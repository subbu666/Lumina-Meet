import { Router } from "express";
import {
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
  signupValidation,
  loginValidation,
  verifyOTPValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  refreshTokenValidation,
} from "../controllers/authController.js";
import { authenticate } from "../middlewares/authMiddleware.js";
import {
  authRateLimiter,
  otpRateLimiter,
  resendOTPRateLimiter,
  passwordResetRateLimiter,
} from "../middlewares/rateLimiter.js";

const router = Router();

// Signup flow
router.post("/signup", authRateLimiter, signupValidation, signup);
router.post("/verify-otp", otpRateLimiter, verifyOTPValidation, verifyOTP);
router.post("/resend-otp", resendOTPRateLimiter, resendOTP);

// Login
router.post("/login", authRateLimiter, loginValidation, login);

// Token refresh
router.post("/refresh", refreshTokenValidation, refreshToken);

// Password reset (3-phase)
router.post(
  "/forgot-password",
  passwordResetRateLimiter,
  forgotPasswordValidation,
  forgotPassword,
);
router.post(
  "/verify-reset-otp",
  otpRateLimiter,
  verifyOTPValidation,
  verifyResetOTP,
);
router.post(
  "/reset-password",
  passwordResetRateLimiter,
  resetPasswordValidation,
  resetPassword,
);

// Logout
router.post("/logout", logout);
router.post("/logout-all", authenticate, logoutAll);

// Profile (protected)
router.get("/me", authenticate, getMe);
router.patch("/profile", authenticate, updateProfile);

export default router;
