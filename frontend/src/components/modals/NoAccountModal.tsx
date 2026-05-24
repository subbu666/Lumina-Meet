import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { UserX, ArrowRight, X } from "lucide-react";

interface Props {
  open: boolean;
  email: string;
  onClose: () => void;
}

/* ── Corner accent (reused from CreatorModal pattern) ── */
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
          stroke="rgba(99,102,241,0.55)"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </motion.div>
  );
}

/* ── Animated scan line ── */
function ScanLine() {
  return (
    <motion.div
      className="absolute inset-x-0 pointer-events-none"
      style={{
        height: 1.5,
        background:
          "linear-gradient(90deg, transparent, rgba(239,68,68,0.35), rgba(99,102,241,0.7), rgba(239,68,68,0.35), transparent)",
        zIndex: 20,
        filter: "blur(0.5px)",
      }}
      animate={{ top: ["-2%", "102%"] }}
      transition={{ duration: 3.5, repeat: Infinity, repeatDelay: 6, ease: "easeInOut" }}
    />
  );
}

/* ── Floating ring particle ── */
function RingParticle({ index }: { index: number }) {
  const angle = (index / 12) * Math.PI * 2;
  const r = 58 + (index % 3) * 14;
  const size = 1.5 + (index % 2) * 1.5;
  const duration = 4 + (index % 4);
  const delay = (index / 12) * 2;
  const colors = ["rgba(239,68,68,", "rgba(99,102,241,", "rgba(167,139,250,"];
  const c = colors[index % 3];
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: size,
        height: size,
        background: `${c}0.7)`,
        left: "50%",
        top: "50%",
        boxShadow: `0 0 ${size * 3}px ${c}0.5)`,
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
                "radial-gradient(ellipse 75% 60% at 50% 50%, rgba(239,68,68,0.07) 0%, rgba(0,0,0,0.88) 100%)",
              backdropFilter: "blur(20px)",
            }}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Card */}
          <motion.div
            style={{
              position: "relative",
              zIndex: 10,
              width: "100%",
              maxWidth: 440,
            }}
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
                  "radial-gradient(ellipse at 50% 50%, rgba(239,68,68,0.09) 0%, rgba(99,102,241,0.05) 45%, transparent 70%)",
              }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />

            <div
              className="relative overflow-hidden rounded-3xl"
              style={{
                background:
                  "linear-gradient(155deg, rgba(15,17,41,0.98) 0%, rgba(11,15,25,0.99) 60%, rgba(8,10,22,1) 100%)",
                border: "1px solid rgba(239,68,68,0.2)",
                boxShadow: `
                  0 0 0 1px rgba(99,102,241,0.05),
                  0 30px 70px rgba(0,0,0,0.8),
                  0 0 80px rgba(239,68,68,0.07),
                  inset 0 1px 0 rgba(239,68,68,0.1)
                `,
              }}
            >
              <CornerAccent position="tl" />
              <CornerAccent position="tr" />
              <CornerAccent position="bl" />
              <CornerAccent position="br" />
              <ScanLine />

              {/* Top bloom — danger-to-indigo */}
              <div
                className="absolute inset-x-0 top-0 h-48 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse 75% 55% at 50% 0%, rgba(239,68,68,0.15) 0%, rgba(99,102,241,0.06) 55%, transparent 80%)",
                }}
              />

              {/* Bottom glow */}
              <div
                className="absolute inset-x-0 bottom-0 h-28 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse 55% 70% at 50% 100%, rgba(99,102,241,0.07) 0%, transparent 70%)",
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
                <line x1="0" y1="0" x2="100%" y2="100%" stroke="#ef4444" strokeWidth="1" />
                <line x1="100%" y1="0" x2="0" y2="100%" stroke="#6366f1" strokeWidth="1" />
              </svg>

              {/* Close button */}
              <motion.button
                onClick={onClose}
                className="absolute right-4 top-4 z-30 flex h-8 w-8 items-center justify-center rounded-full"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
                whileHover={{
                  borderColor: "rgba(239,68,68,0.4)",
                  background: "rgba(239,68,68,0.08)",
                  scale: 1.1,
                }}
                whileTap={{ scale: 0.9 }}
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                transition={{ delay: 0.45 }}
              >
                <X className="h-3.5 w-3.5 text-white/40" />
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

                  {/* Outer dashed ring */}
                  <motion.div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: 148,
                      height: 148,
                      border: "1px dashed rgba(239,68,68,0.18)",
                    }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
                  />

                  {/* Inner dashed ring counter-rotate */}
                  <motion.div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: 118,
                      height: 118,
                      border: "1px dashed rgba(99,102,241,0.14)",
                    }}
                    animate={{ rotate: -360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  />

                  {/* Pulsing border ring */}
                  <motion.div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: 104,
                      height: 104,
                      border: "1px solid rgba(239,68,68,0.3)",
                    }}
                    animate={{
                      boxShadow: [
                        "0 0 14px rgba(239,68,68,0.15), inset 0 0 14px rgba(239,68,68,0.07)",
                        "0 0 36px rgba(239,68,68,0.4), inset 0 0 24px rgba(99,102,241,0.12)",
                        "0 0 14px rgba(239,68,68,0.15), inset 0 0 14px rgba(239,68,68,0.07)",
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
                        "linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(99,102,241,0.1) 100%)",
                      border: "1.5px solid rgba(239,68,68,0.4)",
                      boxShadow:
                        "0 0 28px rgba(239,68,68,0.18), inset 0 1px 0 rgba(239,68,68,0.15)",
                    }}
                    animate={{
                      borderColor: [
                        "rgba(239,68,68,0.4)",
                        "rgba(99,102,241,0.6)",
                        "rgba(239,68,68,0.4)",
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
                          color: "rgba(239,68,68,0.85)",
                          filter: "drop-shadow(0 0 8px rgba(239,68,68,0.5))",
                        }}
                      />
                    </motion.div>
                  </motion.div>
                </motion.div>

                {/* Heading */}
                <motion.h2
                  className="mt-1 text-[22px] font-semibold tracking-tight"
                  style={{ color: "rgba(255,255,255,0.95)" }}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.32, duration: 0.45 }}
                >
                  No account found
                </motion.h2>

                {/* Animated underline */}
                <motion.div
                  className="mt-2 h-px rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, #ef4444, #6366f1, #a78bfa, transparent)",
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: 120 }}
                  transition={{ delay: 0.75, duration: 0.6, ease: "easeOut" }}
                />

                {/* Body text */}
                <motion.p
                  className="mt-5 text-sm leading-relaxed max-w-[300px]"
                  style={{ color: "rgba(255,255,255,0.42)" }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.42, duration: 0.4 }}
                >
                  We couldn't find an account linked to{" "}
                  <span
                    style={{
                      color: "rgba(255,255,255,0.72)",
                      fontWeight: 500,
                    }}
                  >
                    {email}
                  </span>
                  . To reset a password, you'll need an existing account.
                </motion.p>

                {/* Divider */}
                <motion.div
                  className="mt-6 w-full h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(239,68,68,0.15), rgba(99,102,241,0.15), transparent)",
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
                  {/* Exit button */}
                  <motion.button
                    onClick={handleExit}
                    className="flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-all"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.09)",
                      color: "rgba(255,255,255,0.5)",
                    }}
                    whileHover={{
                      background: "rgba(255,255,255,0.07)",
                      borderColor: "rgba(255,255,255,0.16)",
                      color: "rgba(255,255,255,0.75)",
                      scale: 1.02,
                    }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Exit
                  </motion.button>

                  {/* Create Account — primary neon CTA */}
                  <motion.button
                    onClick={handleCreateAccount}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(167,139,250,0.14) 100%)",
                      border: "1px solid rgba(99,102,241,0.45)",
                      color: "#a5b4fc",
                      boxShadow:
                        "0 0 20px rgba(99,102,241,0.1), inset 0 1px 0 rgba(99,102,241,0.15)",
                    }}
                    whileHover={{
                      background:
                        "linear-gradient(135deg, rgba(99,102,241,0.3) 0%, rgba(167,139,250,0.22) 100%)",
                      borderColor: "rgba(167,139,250,0.65)",
                      color: "#c4b5fd",
                      scale: 1.03,
                      boxShadow:
                        "0 0 32px rgba(99,102,241,0.25), inset 0 1px 0 rgba(167,139,250,0.2)",
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
                  style={{ color: "rgba(255,255,255,0.2)" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  Press{" "}
                  <kbd
                    style={{
                      padding: "1px 5px",
                      borderRadius: 4,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)",
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
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(239,68,68,0.25), rgba(99,102,241,0.5), rgba(167,139,250,0.25), transparent)",
                }}
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
