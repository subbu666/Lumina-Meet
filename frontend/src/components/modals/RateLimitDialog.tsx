import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useUiStore } from "@/store/uiStore";
import { NeonButton } from "@/components/ui-custom/NeonButton";

export function RateLimitDialog() {
  const { rateLimit, hideRateLimit } = useUiStore();
  const [remaining, setRemaining] = useState(rateLimit.retryAfter);

  useEffect(() => {
    if (!rateLimit.open) return;
    setRemaining(rateLimit.retryAfter);
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { clearInterval(id); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [rateLimit.open, rateLimit.retryAfter]);

  return (
    <AnimatePresence>
      {rateLimit.open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#05070e]/85 backdrop-blur-xl px-4"
        >
          <motion.div
            initial={{ scale: 0.92, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 20 }}
            className="relative w-full max-w-md rounded-3xl glass-strong p-8 text-center overflow-hidden animate-pulse-danger"
            style={{ borderColor: "oklch(0.72 0.22 35 / 0.4)" }}
          >
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,oklch(0.72_0.22_35/0.3),transparent_60%)]" />
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[oklch(0.65_0.25_25)] to-[oklch(0.72_0.22_35)]">
              <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                <AlertTriangle className="h-8 w-8 text-white" />
              </motion.div>
            </div>
            <h3 className="mt-5 text-xl font-semibold text-foreground">Slow down a moment</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              You've sent too many requests in a short window. We're giving the servers a breather.
            </p>
            {remaining > 0 && (
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[oklch(0.72_0.22_35/0.4)] bg-[oklch(0.72_0.22_35/0.1)] px-4 py-1.5 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.72_0.22_35)] animate-pulse" />
                Retry in <span className="font-mono font-semibold text-foreground">{remaining}s</span>
              </div>
            )}
            <div className="mt-6">
              <NeonButton
                variant={remaining > 0 ? "outline" : "primary"}
                fullWidth
                disabled={remaining > 0}
                onClick={hideRateLimit}
              >
                {remaining > 0 ? "Please wait…" : "Got it"}
              </NeonButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
