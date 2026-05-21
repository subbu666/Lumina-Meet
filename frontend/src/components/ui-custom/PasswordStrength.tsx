import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useRef, useEffect } from "react";

export function computeStrength(pwd: string): {
  score: number;
  label: string;
  color: string;
  glow: string;
} {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  const tiers = [
    { label: "Too weak", color: "oklch(0.65 0.25 25)", glow: "oklch(0.65 0.25 25 / 0.5)" },
    { label: "Weak", color: "oklch(0.72 0.22 35)", glow: "oklch(0.72 0.22 35 / 0.5)" },
    { label: "Fair", color: "oklch(0.82 0.18 85)", glow: "oklch(0.82 0.18 85 / 0.5)" },
    { label: "Good", color: "oklch(0.75 0.18 160)", glow: "oklch(0.75 0.18 160 / 0.5)" },
    { label: "Strong", color: "oklch(0.82 0.16 210)", glow: "oklch(0.82 0.16 210 / 0.5)" },
    { label: "Excellent", color: "oklch(0.82 0.18 280)", glow: "oklch(0.82 0.18 280 / 0.5)" },
  ];
  return { score, ...tiers[score] };
}

// Animated particle burst on strength increase
function ParticleBurst({ color, trigger }: { color: string; trigger: number }) {
  const particles = Array.from({ length: 6 });
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={trigger}
        className="pointer-events-none absolute inset-0"
        style={{ zIndex: 10 }}
      >
        {particles.map((_, i) => {
          const angle = (i / particles.length) * 360;
          const rad = (angle * Math.PI) / 180;
          const dist = 18 + Math.random() * 10;
          return (
            <motion.span
              key={i}
              className="absolute rounded-full"
              style={{
                width: 3,
                height: 3,
                background: color,
                top: "50%",
                left: "50%",
                boxShadow: `0 0 4px ${color}`,
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{
                x: Math.cos(rad) * dist,
                y: Math.sin(rad) * dist,
                opacity: 0,
                scale: 0,
              }}
              transition={{ duration: 0.5, ease: "easeOut", delay: i * 0.03 }}
            />
          );
        })}
      </motion.div>
    </AnimatePresence>
  );
}

// Individual requirement check item
function Requirement({ met, label, color }: { met: boolean; label: string; color: string }) {
  return (
    <motion.div
      className="flex items-center gap-1.5"
      animate={{ opacity: met ? 1 : 0.4 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: 14,
          height: 14,
          border: `1.5px solid ${met ? color : "rgba(255,255,255,0.15)"}`,
          background: met ? color : "transparent",
          boxShadow: met ? `0 0 6px ${color}` : "none",
          flexShrink: 0,
        }}
        animate={{ scale: met ? [1, 1.25, 1] : 1 }}
        transition={{ duration: 0.3 }}
      >
        <AnimatePresence>
          {met && (
            <motion.svg
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 0.2 }}
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="none"
            >
              <path
                d="M1.5 4L3 5.5L6.5 2"
                stroke="#0B0F19"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.svg>
          )}
        </AnimatePresence>
      </motion.div>
      <span className="text-[11px]" style={{ color: met ? color : "rgba(255,255,255,0.4)" }}>
        {label}
      </span>
    </motion.div>
  );
}

export function PasswordStrength({ password }: { password: string }) {
  const prev = useRef(0);
  const { score, label, color, glow } = useMemo(() => computeStrength(password), [password]);

  const increased = score > prev.current;
  useEffect(() => {
    prev.current = score;
  }, [score]);

  const requirements = [
    { met: password.length >= 8, label: "8+ characters" },
    { met: /[A-Z]/.test(password) && /[a-z]/.test(password), label: "Upper & lowercase" },
    { met: /\d/.test(password), label: "Number" },
    { met: /[^A-Za-z0-9]/.test(password), label: "Special character" },
    { met: password.length >= 12, label: "12+ characters" },
  ];

  if (!password) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.25 }}
      className="mt-3 space-y-3"
    >
      {/* Segmented bar */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {Array.from({ length: 5 }).map((_, i) => {
            const filled = i < score;
            return (
              <div
                key={i}
                className="relative flex-1 overflow-visible"
                style={{ height: 5, borderRadius: 99 }}
              >
                {/* Track */}
                <div
                  className="absolute inset-0 rounded-full"
                  style={{ background: "rgba(255,255,255,0.07)" }}
                />

                {/* Fill */}
                <motion.div
                  className="absolute inset-0 rounded-full"
                  animate={{
                    scaleX: filled ? 1 : 0,
                    opacity: filled ? 1 : 0,
                  }}
                  style={{
                    background: color,
                    boxShadow: filled ? `0 0 8px ${glow}` : "none",
                    transformOrigin: "left",
                  }}
                  transition={{
                    duration: 0.35,
                    delay: filled ? i * 0.06 : 0,
                    ease: [0.34, 1.56, 0.64, 1],
                  }}
                />

                {/* Particle burst on last filled segment */}
                {filled && i === score - 1 && increased && (
                  <ParticleBurst color={color} trigger={score} />
                )}
              </div>
            );
          })}
        </div>

        {/* Label */}
        <AnimatePresence mode="wait">
          <motion.span
            key={label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="min-w-[60px] text-right text-[11px] font-semibold tracking-wide"
            style={{ color }}
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Requirements checklist */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-0.5">
        {requirements.map((r) => (
          <Requirement key={r.label} met={r.met} label={r.label} color={color} />
        ))}
      </div>
    </motion.div>
  );
}
