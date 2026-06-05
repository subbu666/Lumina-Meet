import { create } from "zustand";

export type User = {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
};

type AuthState = {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setSession: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  hydrate: () => void;
};

function isValidUser(u: unknown): u is User {
  return (
    typeof u === "object" &&
    u !== null &&
    typeof (u as User).username === "string" &&
    typeof (u as User).email === "string"
  );
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,

  setSession: (user, accessToken, refreshToken) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("auth_access_token", accessToken);
      localStorage.setItem("auth_refresh_token", refreshToken);
      localStorage.setItem("auth_user", JSON.stringify(user));
    }
    set({ user, accessToken, refreshToken });
  },

  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_access_token");
      localStorage.removeItem("auth_refresh_token");
      localStorage.removeItem("auth_user");
      // also clear old key names in case they lingered
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
    }
    set({ user: null, accessToken: null, refreshToken: null });
  },

  hydrate: () => {
    if (typeof window === "undefined") return;
    const accessToken = localStorage.getItem("auth_access_token");
    const refreshToken = localStorage.getItem("auth_refresh_token");
    const userStr = localStorage.getItem("auth_user");

    if (accessToken && userStr) {
      try {
        const parsed = JSON.parse(userStr);
        if (!isValidUser(parsed)) {
          // shape mismatch - wipe and force re-login
          localStorage.removeItem("auth_access_token");
          localStorage.removeItem("auth_refresh_token");
          localStorage.removeItem("auth_user");
          return;
        }
        set({ accessToken, refreshToken, user: parsed });
      } catch {
        localStorage.removeItem("auth_access_token");
        localStorage.removeItem("auth_refresh_token");
        localStorage.removeItem("auth_user");
      }
    }
  },
}));
