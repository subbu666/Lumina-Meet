import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { UserX, ArrowRight, X } from "lucide-react";

interface Props {
  open: boolean;
  email: string;
  onClose: () => void;
}

function CornerAccent({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  const posStyle = {
    tl: { top: 14, left: 14 },
    tr: { top: 14, right: 14 },
    bl: { bottom: 14, left: 14 },
    br: { bottom: 14, right: 14 },
  }[position];
  const rotations = { tl: 0, tr: 90, bl: 270, br: 180 };
  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{ ...posStyle, transform: `rotate(${rotations[position]}deg)` }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.4, duration: 0.35 }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M0 12 L0 0 L12 0"
          stroke="color-mix(in oklch, var(--neon-primary) 55%, transparent)"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </motion.div>
  );
}

function ScanLine() {
  return (
    <motion.div
      className="absolute inset-x-0 pointer-events-none"
      style={{
        height: 1.5,
        background:
          "linear-gradient(90deg, transparent, color-mix(in oklch, var(--neon-danger) 35%, transparent), color-mix(in oklch, var(--neon-primary) 70%, transparent), color-mix(in oklch, var(--neon-danger) 35%, transparent), transparent)",
        zIndex: 20,
        filter: "blur(0.5px)",
      }}
      animate={{ top: ["-2%", "102%"] }}
      transition={{ duration: 3.5, repeat: Infinity, repeatDelay: 6, ease: "easeInOut" }}
    />
  );
}

function RingParticle({ index }: { index: number }) {
  const angle = (index / 12) * Math.PI * 2;
  const r = 58 + (index % 3) * 14;
  const size = 1.5 + (index % 2) * 1.5;
  const duration = 4 + (index % 4);
  const delay = (index / 12) * 2;
  // Use CSS variable references via inline style — these resolve correctly at runtime
  const colorVars = ["var(--neon-danger)", "var(--neon-primary)", "var(--neon-accent)"];
  const color = colorVars[index % 3];
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: size,
        height: size,
        background: color,
        left: "50%",
        top: "50%",
        opacity: 0.7,
      }}
      animate={{
        x: [
          Math.cos(angle) * r * 0.3,
          Math.cos(angle + 0.8) * r,
          Math.cos(angle + 1.5) * r * 0.5,
          Math.cos(angle) * r * 0.3,
        ],
        y: [
          Math.sin(angle) * r * 0.3,
          Math.sin(angle + 0.8) * r,
          Math.sin(angle + 1.5) * r * 0.5,
          Math.sin(angle) * r * 0.3,
        ],
        opacity: [0, 0.85, 0.4, 0],
        scale: [0, 1, 0.6, 0],
      }}
      transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export function NoAccountModal({ open, email, onClose }: Props) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleCreateAccount = () => {
    onClose();
    navigate({ to: "/signup" });
  };

  const handleExit = () => {
    onClose();
    navigate({ to: "/" });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 75% 60% at 50% 50%, color-mix(in oklch, var(--neon-danger) 7%, transparent) 0%, color-mix(in oklch, var(--background) 88%, transparent) 100%)",
              backdropFilter: "blur(20px)",
            }}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Card */}
          <motion.div
            style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 440 }}
            initial={{ opacity: 0, scale: 0.88, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 40 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Outer halo */}
            <motion.div
              className="absolute -inset-8 rounded-[3rem] pointer-events-none -z-10"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 50%, color-mix(in oklch, var(--neon-danger) 9%, transparent) 0%, color-mix(in oklch, var(--neon-primary) 5%, transparent) 45%, transparent 70%)",
              }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />

            <div
              className="relative overflow-hidden rounded-3xl"
              style={{
                background: "var(--card)",
                border: "1px solid color-mix(in oklch, var(--neon-danger) 20%, transparent)",
                boxShadow: `
                  0 0 0 1px color-mix(in oklch, var(--neon-primary) 5%, transparent),
                  0 30px 70px color-mix(in oklch, var(--background) 80%, transparent),
                  0 0 80px color-mix(in oklch, var(--neon-danger) 7%, transparent),
                  inset 0 1px 0 color-mix(in oklch, var(--neon-danger) 10%, transparent)
                `,
              }}
            >
              <CornerAccent position="tl" />
              <CornerAccent position="tr" />
              <CornerAccent position="bl" />
              <CornerAccent position="br" />
              <ScanLine />

              {/* Top bloom */}
              <div
                className="absolute inset-x-0 top-0 h-48 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse 75% 55% at 50% 0%, color-mix(in oklch, var(--neon-danger) 15%, transparent) 0%, color-mix(in oklch, var(--neon-primary) 6%, transparent) 55%, transparent 80%)",
                }}
              />

              {/* Bottom glow */}
              <div
                className="absolute inset-x-0 bottom-0 h-28 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse 55% 70% at 50% 100%, color-mix(in oklch, var(--neon-primary) 7%, transparent) 0%, transparent 70%)",
                }}
              />

              {/* Noise grain */}
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.025]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                  backgroundSize: "128px 128px",
                }}
              />

              {/* Diagonal accent lines */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ opacity: 0.03 }}
              >
                <line
                  x1="0"
                  y1="0"
                  x2="100%"
                  y2="100%"
                  stroke="var(--neon-danger)"
                  strokeWidth="1"
                />
                <line
                  x1="100%"
                  y1="0"
                  x2="0"
                  y2="100%"
                  stroke="var(--neon-primary)"
                  strokeWidth="1"
                />
              </svg>

              {/* Close button */}
              <motion.button
                onClick={onClose}
                className="absolute right-4 top-4 z-30 flex h-8 w-8 items-center justify-center rounded-full"
                style={{
                  background: "var(--glass)",
                  border: "1px solid var(--glass-border)",
                }}
                whileHover={{
                  borderColor: "color-mix(in oklch, var(--neon-danger) 40%, transparent)",
                  background: "color-mix(in oklch, var(--neon-danger) 8%, transparent)",
                  scale: 1.1,
                }}
                whileTap={{ scale: 0.9 }}
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                transition={{ delay: 0.45 }}
              >
                <X className="h-3.5 w-3.5" style={{ color: "var(--muted-foreground)" }} />
              </motion.button>

              {/* Content */}
              <div className="relative z-10 flex flex-col items-center px-8 pb-9 pt-10 text-center">
                {/* Icon orbit system */}
                <motion.div
                  className="relative flex items-center justify-center"
                  style={{ width: 160, height: 160 }}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                >
                  {Array.from({ length: 12 }).map((_, i) => (
                    <RingParticle key={i} index={i} />
                  ))}

                  <motion.div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: 148,
                      height: 148,
                      border: "1px dashed color-mix(in oklch, var(--neon-danger) 18%, transparent)",
                    }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
                  />

                  <motion.div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: 118,
                      height: 118,
                      border:
                        "1px dashed color-mix(in oklch, var(--neon-primary) 14%, transparent)",
                    }}
                    animate={{ rotate: -360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  />

                  <motion.div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: 104,
                      height: 104,
                      border: "1px solid color-mix(in oklch, var(--neon-danger) 30%, transparent)",
                    }}
                    animate={{
                      boxShadow: [
                        "0 0 14px color-mix(in oklch, var(--neon-danger) 15%, transparent), inset 0 0 14px color-mix(in oklch, var(--neon-danger) 7%, transparent)",
                        "0 0 36px color-mix(in oklch, var(--neon-danger) 40%, transparent), inset 0 0 24px color-mix(in oklch, var(--neon-primary) 12%, transparent)",
                        "0 0 14px color-mix(in oklch, var(--neon-danger) 15%, transparent), inset 0 0 14px color-mix(in oklch, var(--neon-danger) 7%, transparent)",
                      ],
                    }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  />

                  {/* Icon circle */}
                  <motion.div
                    className="relative z-10 flex items-center justify-center rounded-full"
                    style={{
                      width: 88,
                      height: 88,
                      background:
                        "linear-gradient(135deg, color-mix(in oklch, var(--neon-danger) 12%, transparent) 0%, color-mix(in oklch, var(--neon-primary) 10%, transparent) 100%)",
                      border:
                        "1.5px solid color-mix(in oklch, var(--neon-danger) 40%, transparent)",
                      boxShadow:
                        "0 0 28px color-mix(in oklch, var(--neon-danger) 18%, transparent), inset 0 1px 0 color-mix(in oklch, var(--neon-danger) 15%, transparent)",
                    }}
                    animate={{
                      borderColor: [
                        "color-mix(in oklch, var(--neon-danger) 40%, transparent)",
                        "color-mix(in oklch, var(--neon-primary) 60%, transparent)",
                        "color-mix(in oklch, var(--neon-danger) 40%, transparent)",
                      ],
                    }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <motion.div
                      animate={{ scale: [1, 1.08, 1] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <UserX
                        className="h-9 w-9"
                        style={{
                          color: "var(--neon-danger)",
                          filter:
                            "drop-shadow(0 0 8px color-mix(in oklch, var(--neon-danger) 50%, transparent))",
                        }}
                      />
                    </motion.div>
                  </motion.div>
                </motion.div>

                {/* Heading */}
                <motion.h2
                  className="mt-1 text-[22px] font-semibold tracking-tight"
                  style={{ color: "var(--foreground)" }}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.32, duration: 0.45 }}
                >
                  No account found
                </motion.h2>

                {/* Animated underline */}
                <motion.div
                  className="mt-2 h-px rounded-full"
                  style={{ background: "var(--gradient-cyber)" }}
                  initial={{ width: 0 }}
                  animate={{ width: 120 }}
                  transition={{ delay: 0.75, duration: 0.6, ease: "easeOut" }}
                />

                {/* Body text */}
                <motion.p
                  className="mt-5 text-sm leading-relaxed max-w-[300px]"
                  style={{ color: "var(--muted-foreground)" }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.42, duration: 0.4 }}
                >
                  We couldn't find an account linked to{" "}
                  <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{email}</span>. To
                  reset a password, you'll need an existing account.
                </motion.p>

                {/* Divider */}
                <motion.div
                  className="mt-6 w-full h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, color-mix(in oklch, var(--neon-danger) 15%, transparent), color-mix(in oklch, var(--neon-primary) 15%, transparent), transparent)",
                  }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.7, duration: 0.5 }}
                />

                {/* Action buttons */}
                <motion.div
                  className="mt-6 flex w-full gap-3"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.55, duration: 0.4 }}
                >
                  <motion.button
                    onClick={handleExit}
                    className="flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-all"
                    style={{
                      background: "var(--glass)",
                      border: "1px solid var(--glass-border)",
                      color: "var(--muted-foreground)",
                    }}
                    whileHover={{ opacity: 0.8, scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Exit
                  </motion.button>

                  <motion.button
                    onClick={handleCreateAccount}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold"
                    style={{
                      background: "color-mix(in oklch, var(--neon-primary) 18%, transparent)",
                      border: "1px solid color-mix(in oklch, var(--neon-primary) 45%, transparent)",
                      color: "var(--neon-secondary)",
                      boxShadow:
                        "0 0 20px color-mix(in oklch, var(--neon-primary) 10%, transparent), inset 0 1px 0 color-mix(in oklch, var(--neon-primary) 15%, transparent)",
                    }}
                    whileHover={{
                      background: "color-mix(in oklch, var(--neon-primary) 30%, transparent)",
                      borderColor: "color-mix(in oklch, var(--neon-accent) 65%, transparent)",
                      scale: 1.03,
                      boxShadow:
                        "0 0 32px color-mix(in oklch, var(--neon-primary) 25%, transparent), inset 0 1px 0 color-mix(in oklch, var(--neon-accent) 20%, transparent)",
                    }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Create account
                    <motion.span
                      animate={{ x: [0, 3, 0] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </motion.span>
                  </motion.button>
                </motion.div>

                {/* Subtle hint */}
                <motion.p
                  className="mt-4 text-[11px]"
                  style={{ color: "var(--muted-foreground)" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  Press{" "}
                  <kbd
                    style={{
                      padding: "1px 5px",
                      borderRadius: 4,
                      background: "var(--glass)",
                      border: "1px solid var(--glass-border)",
                      fontFamily: "monospace",
                      fontSize: 10,
                    }}
                  >
                    Esc
                  </kbd>{" "}
                  to dismiss
                </motion.p>
              </div>

              {/* Bottom shimmer line */}
              <motion.div
                className="absolute bottom-0 left-0 right-0 h-px"
                style={{ background: "var(--gradient-cyber)" }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
