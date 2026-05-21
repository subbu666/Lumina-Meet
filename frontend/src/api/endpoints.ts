export const API_ENDPOINTS = {
  SIGNUP: "/api/auth/signup",
  LOGIN: "/api/auth/login",
  VERIFY_OTP: "/api/auth/verify-otp",
  VERIFY_RESET_OTP: "/api/auth/verify-reset-otp",
  RESEND_OTP: "/api/auth/resend-otp",
  FORGOT_PASSWORD: "/api/auth/forgot-password",
  RESET_PASSWORD: "/api/auth/reset-password",
  ME: "/api/auth/me",
  GENERATE_MEETING: "/api/meeting/generate",
  SCHEDULE_MEETING: "/api/meeting/schedule",
  INVITE: "/api/meeting/invite",
  SEND_INVITE: "/api/meeting/invite",
  /** Generates a new instant meeting then emails the given list in one request */
  GENERATE_AND_INVITE: "/api/meeting/generate-and-invite",
  MEETING_HISTORY: "/api/meeting/history",
} as const;
