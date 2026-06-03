export const API_ENDPOINTS = {
  // ── Auth ───────────────────────────────────────────────────────────────────
  SIGNUP: "/api/auth/signup",
  LOGIN: "/api/auth/login",
  VERIFY_OTP: "/api/auth/verify-otp",
  VERIFY_RESET_OTP: "/api/auth/verify-reset-otp",
  RESEND_OTP: "/api/auth/resend-otp",
  FORGOT_PASSWORD: "/api/auth/forgot-password",
  RESET_PASSWORD: "/api/auth/reset-password",
  ME: "/api/auth/me",

  // ── Meetings ───────────────────────────────────────────────────────────────
  GENERATE_MEETING: "/api/meeting/generate",
  SCHEDULE_MEETING: "/api/meeting/schedule",
  INVITE: "/api/meeting/invite",
  SEND_INVITE: "/api/meeting/invite",
  /** Generates a new instant meeting then emails the given list in one request */
  GENERATE_AND_INVITE: "/api/meeting/generate-and-invite",
  MEETING_HISTORY: "/api/meeting/history",
  RECORD_JOINED_MEETING: "/api/meeting/record-joined",
  /**
   * Permanently hard-deletes a meeting from the database.
   * Usage: apiClient.delete(`${API_ENDPOINTS.DELETE_MEETING}/${meetingId}`)
   * Only the host can delete. Active meetings cannot be deleted (end them first).
   */
  DELETE_MEETING: "/api/meeting",
  /**
   * Rename a meeting title (sends confirmation email).
   * Usage: apiClient.patch(`${API_ENDPOINTS.RENAME_MEETING}/${meetingId}/rename`, { title })
   */
  RENAME_MEETING: "/api/meeting",

  // ── Recordings ─────────────────────────────────────────────────────────────
  /** Get Cloudinary signed upload params — POST { meetingId, mode, durationSec, fileType } */
  RECORDING_SIGNATURE: "/api/meeting/recording/signature",
  /** Save recording metadata after Cloudinary upload — POST { meetingId, publicId, mode, durationSec, fileSizeBytes, mimeType } */
  RECORDING_SAVE: "/api/meeting/recording/save",
  /** All recordings for the current user (dashboard Recordings tab) — GET */
  USER_RECORDINGS: "/api/meeting/recordings",
} as const;
