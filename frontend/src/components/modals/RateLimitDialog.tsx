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
        if (r <= 1) {
          clearInterval(id);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [rateLimit.open, rateLimit.retryAfter]);

  return (
    <AnimatePresence>
      {rateLimit.open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          style={{
            background: "color-mix(in oklch, var(--background) 85%, transparent)",
            backdropFilter: "blur(20px)",
          }}
        >
          <motion.div
            initial={{ scale: 0.92, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 20 }}
            className="relative w-full max-w-md rounded-3xl glass-strong p-8 text-center overflow-hidden animate-pulse-danger"
            style={{
              borderColor: "color-mix(in oklch, var(--neon-danger) 40%, transparent)",
            }}
          >
            {/* Radial danger glow */}
            <div
              className="absolute inset-0 -z-10"
              style={{
                background:
                  "radial-gradient(circle at top, color-mix(in oklch, var(--neon-danger) 30%, transparent), transparent 60%)",
              }}
            />

            {/* Icon */}
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: "var(--destructive)" }}
            >
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                <AlertTriangle className="h-8 w-8 text-white" />
              </motion.div>
            </div>

            <h3 className="mt-5 text-xl font-semibold" style={{ color: "var(--foreground)" }}>
              Slow down a moment
            </h3>
            <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
              You've sent too many requests in a short window. We're giving the servers a breather.
            </p>

            {remaining > 0 && (
              <div
                className="mt-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm"
                style={{
                  border: "1px solid color-mix(in oklch, var(--neon-danger) 40%, transparent)",
                  background: "color-mix(in oklch, var(--neon-danger) 10%, transparent)",
                  color: "var(--foreground)",
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full animate-pulse"
                  style={{ background: "var(--neon-danger)" }}
                />
                Retry in <span className="font-mono font-semibold">{remaining}s</span>
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
