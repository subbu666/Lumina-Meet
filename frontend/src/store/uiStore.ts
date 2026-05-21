import { create } from "zustand";

type UiState = {
  rateLimit: { open: boolean; retryAfter: number };
  showRateLimit: (retryAfter: number) => void;
  hideRateLimit: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  rateLimit: { open: false, retryAfter: 0 },
  showRateLimit: (retryAfter) => set({ rateLimit: { open: true, retryAfter } }),
  hideRateLimit: () => set({ rateLimit: { open: false, retryAfter: 0 } }),
}));
