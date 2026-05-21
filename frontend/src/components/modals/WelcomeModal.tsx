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

  const burst = useMemo(
    () =>
      Array.from({ length: 24 }).map((_, i) => ({
        id: i,
        angle: (i / 24) * Math.PI * 2,
        color: ["oklch(0.65 0.22 280)", "oklch(0.82 0.16 210)", "oklch(0.75 0.18 305)"][i % 3],
      })),
    [],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#05070e]/80 backdrop-blur-xl px-4"
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
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-gradient-neon"
              />
              <div className="relative flex h-full w-full items-center justify-center rounded-full bg-gradient-neon glow-primary">
                <Sparkles className="h-9 w-9 text-white" />
              </div>
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
                  style={{ background: b.color, boxShadow: `0 0 8px ${b.color}` }}
                />
              ))}
            </div>
            <h2 className="mt-6 text-2xl font-semibold">
              Welcome back, <span className="text-gradient">{username}</span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Spinning up your workspace…</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
