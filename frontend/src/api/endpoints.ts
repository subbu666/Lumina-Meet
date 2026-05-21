export const API_ENDPOINTS = {
  SIGNUP: "/api/auth/signup",
  LOGIN: "/api/auth/login",
  VERIFY_OTP: "/api/auth/verify-otp",
  VERIFY_RESET_OTP: "/api/auth/verify-reset-otp", // ← new
  RESEND_OTP: "/api/auth/resend-otp",
  FORGOT_PASSWORD: "/api/auth/forgot-password",
  RESET_PASSWORD: "/api/auth/reset-password",
  ME: "/api/auth/me",
  GENERATE_MEETING: "/api/meeting/generate",
  SCHEDULE_MEETING: "/api/meeting/schedule",
  INVITE: "/api/meeting/invite",
  SEND_INVITE: "/api/meeting/invite",
  MEETING_HISTORY: "/api/meeting/history",
} as const;
