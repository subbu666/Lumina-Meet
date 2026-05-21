import axios, { AxiosError } from "axios";
import { useUiStore } from "@/store/uiStore";

const baseURL = import.meta.env.VITE_API_BASE_URL;

export const apiClient = axios.create({
  baseURL,
  timeout: 15000,
});

// Request: attach token (future JWT)
apiClient.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response: global error & rate-limit handling
apiClient.interceptors.response.use(
  (r) => r,
  (error: AxiosError<{ message?: string; retryAfter?: number }>) => {
    if (error.response?.status === 429) {
      const retry = error.response.data?.retryAfter ?? 15;
      useUiStore.getState().showRateLimit(retry);
    }
    return Promise.reject(error);
  },
);

export type ApiError = { message: string; status?: number };
export function extractError(err: unknown): ApiError {
  const e = err as AxiosError<{ message?: string }>;
  return {
    message: e?.response?.data?.message || e?.message || "Something went wrong",
    status: e?.response?.status,
  };
}
