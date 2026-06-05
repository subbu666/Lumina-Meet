import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo } from "react";
import { Sparkles } from "lucide-react";

export function WelcomeModal({
  open,
  username,
  onClose,
}: {
  open: boolean;
  username: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, 2400);
    return () => clearTimeout(t);
  }, [open, onClose]);

  // 24 particles — color pulled from CSS variables at render time
  const burst = useMemo(
    () =>
      Array.from({ length: 24 }).map((_, i) => ({
        id: i,
        angle: (i / 24) * Math.PI * 2,
        // Cycle through the three neon palette vars
        colorVar: (["var(--neon-primary)", "var(--neon-secondary)", "var(--neon-accent)"] as const)[
          i % 3
        ],
      })),
    [],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{
            background: "color-mix(in oklch, var(--background) 80%, transparent)",
            backdropFilter: "blur(20px)",
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", damping: 18 }}
            className="relative glass-strong rounded-3xl p-10 text-center overflow-visible"
          >
            <div className="relative mx-auto h-20 w-20">
              {/* Pulsing ring */}
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-gradient-neon"
              />

              {/* Icon */}
              <div className="relative flex h-full w-full items-center justify-center rounded-full bg-gradient-neon glow-primary">
                <Sparkles className="h-9 w-9 text-white" />
              </div>

              {/* Burst particles */}
              {burst.map((b) => (
                <motion.span
                  key={b.id}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                  animate={{
                    x: Math.cos(b.angle) * 120,
                    y: Math.sin(b.angle) * 120,
                    opacity: 0,
                    scale: 1,
                  }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                  className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
                  style={{
                    background: b.colorVar,
                    boxShadow: `0 0 8px ${b.colorVar}`,
                  }}
                />
              ))}
            </div>

            <h2 className="mt-6 text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
              Welcome back, <span className="text-gradient">{username}</span>
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
              Spinning up your workspace…
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
