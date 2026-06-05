import { apiClient } from "../apiClient";
import { API_ENDPOINTS } from "../endpoints";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
  token?: string;
}

function normalizeUser(raw: Record<string, unknown>): AuthUser {
  return {
    id: (raw._id ?? raw.id) as string,
    username: raw.username as string,
    email: raw.email as string,
    firstName: raw.firstName as string | undefined,
    lastName: raw.lastName as string | undefined,
    avatar: raw.avatar as string | undefined,
  };
}

function normalizeAuthResponse(data: Record<string, unknown>): AuthResponse {
  const raw = data as { user: Record<string, unknown>; tokens: AuthTokens };
  return {
    user: normalizeUser(raw.user),
    tokens: raw.tokens,
  };
}

export const authService = {
  signup: (data: { username: string; email: string; password: string }) =>
    apiClient.post(API_ENDPOINTS.SIGNUP, data).then((r) => r.data.data),

  login: (data: { email: string; password: string }): Promise<AuthResponse> =>
    apiClient.post(API_ENDPOINTS.LOGIN, data).then((r) => normalizeAuthResponse(r.data.data)),

  verifyOtp: (data: { email: string; otp: string }): Promise<AuthResponse> =>
    apiClient.post(API_ENDPOINTS.VERIFY_OTP, data).then((r) => normalizeAuthResponse(r.data.data)),

  verifyResetOtp: (data: { email: string; otp: string }): Promise<{ email: string; otp: string }> =>
    apiClient.post(API_ENDPOINTS.VERIFY_RESET_OTP, data).then((r) => r.data.data),

  resendOtp: (data: { email: string }) =>
    apiClient.post(API_ENDPOINTS.RESEND_OTP, data).then((r) => r.data.data),

  /**
   * FIX: Return the full response body - not just r.data.data.
   * When no account exists the backend sends:
   *   { success: false, code: "USER_NOT_FOUND", message: "..." }
   * with HTTP 200 (anti-enumeration). The `data` field is absent in that case,
   * so we must return r.data so the caller can inspect `code`.
   */
  forgotPassword: (data: { email: string }) =>
    apiClient.post(API_ENDPOINTS.FORGOT_PASSWORD, data).then((r) => r.data),

  resetPassword: (data: { email: string; otp: string; password: string }) =>
    apiClient
      .post(API_ENDPOINTS.RESET_PASSWORD, {
        email: data.email,
        otp: data.otp,
        newPassword: data.password,
      })
      .then((r) => r.data.data),

  getMe: (): Promise<AuthUser> =>
    apiClient.get(API_ENDPOINTS.ME).then((r) => normalizeUser(r.data.data.user)),

  invite: (data: { meetingId: string; emails: string[] }) =>
    apiClient.post(API_ENDPOINTS.INVITE, data).then((r) => r.data.data),
};
