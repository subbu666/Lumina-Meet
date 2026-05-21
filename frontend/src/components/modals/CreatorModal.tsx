import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { Linkedin, Globe, X, Sparkles, Code2, Cpu, Zap, Shield } from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

/* ─── Neon particle ─── */
function NeonParticle({ index }: { index: number }) {
  const angle = (index / 20) * Math.PI * 2;
  const radius = 90 + Math.random() * 55;
  const size = 1.5 + Math.random() * 2;
  const duration = 3.5 + Math.random() * 4;
  const delay = Math.random() * 3;
  // Alternate between indigo, cyan, and purple
  const colors = [
    "rgba(99,102,241,",
    "rgba(34,211,238,",
    "rgba(167,139,250,",
  ];
  const color = colors[index % 3];

  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: size,
        height: size,
        background: `${color}${0.4 + Math.random() * 0.5})`,
        left: "50%",
        top: "50%",
        boxShadow: `0 0 ${size * 4}px ${color}0.7)`,
      }}
      animate={{
        x: [
          Math.cos(angle) * radius * 0.25,
          Math.cos(angle + 0.6) * radius,
          Math.cos(angle + 1.2) * radius * 0.5,
          Math.cos(angle) * radius * 0.25,
        ],
        y: [
          Math.sin(angle) * radius * 0.25,
          Math.sin(angle + 0.6) * radius,
          Math.sin(angle + 1.2) * radius * 0.5,
          Math.sin(angle) * radius * 0.25,
        ],
        opacity: [0, 0.9, 0.4, 0],
        scale: [0, 1, 0.6, 0],
      }}
      transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/* ─── Orbiting ring dot ─── */
function OrbitDot({
  index,
  total,
  radius,
}: {
  index: number;
  total: number;
  radius: number;
}) {
  const angle = (index / total) * 360;
  const size = index % 4 === 0 ? 4 : 2;
  const isBright = index % 4 === 0;
  // Cycle: indigo, cyan, purple
  const dotColors = ["rgba(99,102,241,0.9)", "rgba(34,211,238,0.85)", "rgba(167,139,250,0.8)"];
  const dimColors = ["rgba(99,102,241,0.4)", "rgba(34,211,238,0.4)", "rgba(167,139,250,0.4)"];
  const col = dotColors[index % 3];
  const dim = dimColors[index % 3];

  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        background: isBright ? col : dim,
        top: "50%",
        left: "50%",
        marginTop: -size / 2,
        marginLeft: -size / 2,
        boxShadow: isBright ? `0 0 8px ${col}` : "none",
      }}
      animate={{
        x: [
          Math.cos((angle * Math.PI) / 180) * radius,
          Math.cos(((angle + 360) * Math.PI) / 180) * radius,
        ],
        y: [
          Math.sin((angle * Math.PI) / 180) * radius,
          Math.sin(((angle + 360) * Math.PI) / 180) * radius,
        ],
      }}
      transition={{
        duration: 10 + (index % 4),
        repeat: Infinity,
        ease: "linear",
      }}
    />
  );
}

/* ─── Animated scan line (neon gradient) ─── */
function ScanLine() {
  return (
    <motion.div
      className="absolute inset-x-0 pointer-events-none"
      style={{
        height: 1.5,
        background:
          "linear-gradient(90deg, transparent, rgba(99,102,241,0.5), rgba(34,211,238,0.9), rgba(167,139,250,0.5), transparent)",
        zIndex: 20,
        filter: "blur(0.5px)",
      }}
      animate={{ top: ["-2%", "102%"] }}
      transition={{ duration: 3, repeat: Infinity, repeatDelay: 5, ease: "easeInOut" }}
    />
  );
}

/* ─── Corner accent (neon) ─── */
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
      transition={{ delay: 0.5, duration: 0.4 }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d="M0 14 L0 0 L14 0"
          stroke="rgba(99,102,241,0.6)"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </motion.div>
  );
}

/* ─── Stat badge ─── */
function StatBadge({
  value,
  label,
  delay,
  color,
}: {
  value: string;
  label: string;
  delay: number;
  color: string;
}) {
  return (
    <motion.div
      className="flex flex-col items-center gap-0.5"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
    >
      <span
        style={{
          fontSize: 16,
          fontWeight: 700,
          color,
          letterSpacing: "0.03em",
          fontFamily: "'Space Grotesk', sans-serif",
          textShadow: `0 0 12px ${color}66`,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          color: "rgba(255,255,255,0.28)",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
    </motion.div>
  );
}

/* ─── Tilt card hook ─── */
function useTilt() {
  const cardRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 120, damping: 18 });
  const springY = useSpring(y, { stiffness: 120, damping: 18 });
  const rotateX = useTransform(springY, [-0.5, 0.5], [7, -7]);
  const rotateY = useTransform(springX, [-0.5, 0.5], [-7, 7]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      x.set((e.clientX - rect.left) / rect.width - 0.5);
      y.set((e.clientY - rect.top) / rect.height - 0.5);
    },
    [x, y],
  );

  const onMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return { cardRef, rotateX, rotateY, onMouseMove, onMouseLeave };
}

/* ─── Main modal ─── */
export function CreatorModal({ open, onClose }: Props) {
  const { cardRef, rotateX, rotateY, onMouseMove, onMouseLeave } = useTilt();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [glowPulse, setGlowPulse] = useState(false);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => setGlowPulse(true), 900);
      return () => clearTimeout(t);
    } else {
      setGlowPulse(false);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const techBadges = [
    { icon: Code2, label: "Full Stack" },
    { icon: Cpu, label: "AI / LLMs" },
    { icon: Zap, label: "WebRTC" },
    { icon: Shield, label: "Vibe Coder" },
    { icon: Sparkles, label: "Vibe Coding" },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* ── Backdrop ── */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 65% at 50% 50%, rgba(99,102,241,0.08) 0%, rgba(0,0,0,0.85) 100%)",
              backdropFilter: "blur(18px)",
            }}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* ── 3-D tilt card ── */}
          <motion.div
            ref={cardRef}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            style={{
              rotateX,
              rotateY,
              perspective: 1000,
              transformStyle: "preserve-3d",
              position: "relative",
              zIndex: 10,
              width: "100%",
              maxWidth: 490,
            }}
            initial={{ opacity: 0, scale: 0.86, y: 44 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.86, y: 44 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Card shell */}
            <div
              className="relative overflow-hidden rounded-3xl"
              style={{
                background:
                  "linear-gradient(155deg, rgba(15,17,41,0.98) 0%, rgba(11,15,25,0.99) 60%, rgba(8,10,22,1) 100%)",
                border: "1px solid rgba(99,102,241,0.22)",
                boxShadow: `
                  0 0 0 1px rgba(99,102,241,0.06),
                  0 30px 70px rgba(0,0,0,0.75),
                  0 0 100px rgba(99,102,241,0.08),
                  0 0 60px rgba(34,211,238,0.05),
                  inset 0 1px 0 rgba(99,102,241,0.14)
                `,
              }}
            >
              {/* Corner accents */}
              <CornerAccent position="tl" />
              <CornerAccent position="tr" />
              <CornerAccent position="bl" />
              <CornerAccent position="br" />

              {/* Scan line */}
              <ScanLine />

              {/* Top neon radial bloom */}
              <div
                className="absolute inset-x-0 top-0 h-56 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(99,102,241,0.18) 0%, rgba(34,211,238,0.06) 55%, transparent 80%)",
                }}
              />

              {/* Subtle bottom cyan glow */}
              <div
                className="absolute inset-x-0 bottom-0 h-32 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse 60% 80% at 50% 100%, rgba(34,211,238,0.08) 0%, transparent 70%)",
                }}
              />

              {/* Noise grain */}
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.028]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                  backgroundSize: "128px 128px",
                }}
              />

              {/* Diagonal accent lines */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ opacity: 0.035 }}
              >
                <line x1="0" y1="0" x2="100%" y2="100%" stroke="#6366f1" strokeWidth="1" />
                <line x1="100%" y1="0" x2="0" y2="100%" stroke="#22d3ee" strokeWidth="1" />
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
                  borderColor: "rgba(99,102,241,0.5)",
                  background: "rgba(99,102,241,0.1)",
                  scale: 1.1,
                }}
                whileTap={{ scale: 0.9 }}
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                transition={{ delay: 0.5 }}
              >
                <X className="h-3.5 w-3.5 text-white/40" />
              </motion.button>

              {/* ── Main content ── */}
              <div className="relative z-10 flex flex-col items-center px-8 pb-10 pt-10 text-center">

                {/* Avatar + orbit system */}
                <motion.div
                  className="relative flex items-center justify-center"
                  style={{ width: 190, height: 190 }}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.18, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                >
                  {/* Neon particles */}
                  {Array.from({ length: 20 }).map((_, i) => (
                    <NeonParticle key={i} index={i} />
                  ))}

                  {/* Outer orbit ring (dashed, rotating) */}
                  <motion.div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: 174,
                      height: 174,
                      border: "1px dashed rgba(99,102,241,0.18)",
                    }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
                  />

                  {/* Middle orbit ring (counter-rotating, cyan) */}
                  <motion.div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: 148,
                      height: 148,
                      border: "1px dashed rgba(34,211,238,0.12)",
                    }}
                    animate={{ rotate: -360 }}
                    transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                  />

                  {/* Orbit dots */}
                  {Array.from({ length: 14 }).map((_, i) => (
                    <OrbitDot key={i} index={i} total={14} radius={87} />
                  ))}

                  {/* Pulsing inner glow ring */}
                  <motion.div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: 132,
                      height: 132,
                      background: "transparent",
                      border: "1px solid rgba(99,102,241,0.28)",
                    }}
                    animate={
                      glowPulse
                        ? {
                            boxShadow: [
                              "0 0 16px rgba(99,102,241,0.2), inset 0 0 16px rgba(99,102,241,0.08)",
                              "0 0 40px rgba(99,102,241,0.5), inset 0 0 30px rgba(34,211,238,0.15)",
                              "0 0 16px rgba(99,102,241,0.2), inset 0 0 16px rgba(99,102,241,0.08)",
                            ],
                          }
                        : {}
                    }
                    transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                  />

                  {/* Avatar image */}
                  <div
                    className="relative z-10 overflow-hidden rounded-full"
                    style={{
                      width: 110,
                      height: 110,
                      border: "2px solid rgba(99,102,241,0.5)",
                      boxShadow:
                        "0 0 30px rgba(99,102,241,0.25), 0 0 60px rgba(34,211,238,0.1)",
                    }}
                  >
                    {/* Shimmer sweep */}
                    <motion.div
                      className="absolute inset-0 z-20 pointer-events-none"
                      style={{
                        background:
                          "linear-gradient(135deg, transparent 0%, rgba(99,102,241,0.2) 50%, transparent 100%)",
                      }}
                      animate={{ x: ["-100%", "200%"] }}
                      transition={{
                        duration: 2.5,
                        delay: 1.2,
                        repeat: Infinity,
                        repeatDelay: 5.5,
                        ease: "easeInOut",
                      }}
                    />
                    <img
                      src="https://i.postimg.cc/fbznTS46/Whats-App-Image-2025-06-29-at-08-28-57-f2c6ea81.jpg"
                      alt="Saladi Subrahmanyam"
                      className="h-full w-full object-cover"
                      onLoad={() => setImageLoaded(true)}
                    />
                    {!imageLoaded && (
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{
                          background: "linear-gradient(135deg, #1a1c3a, #0f1129)",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 28,
                            fontWeight: 700,
                            background:
                              "linear-gradient(135deg, #6366f1, #22d3ee)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                          }}
                        >
                          SS
                        </span>
                      </div>
                    )}
                  </div>

                  {/* "Vibe Coder" floating pill */}
                  <motion.div
                    className="absolute z-20 rounded-full px-3 py-1"
                    style={{
                      bottom: 12,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "rgba(11,15,25,0.95)",
                      border: "1px solid rgba(99,102,241,0.4)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.5), 0 0 12px rgba(99,102,241,0.15)",
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.9 }}
                    whileHover={{
                      scale: 1.06,
                      borderColor: "rgba(34,211,238,0.6)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.5), 0 0 20px rgba(34,211,238,0.2)",
                    }}
                  >
                    <span
                      className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest"
                      style={{
                        background: "linear-gradient(90deg, #6366f1, #22d3ee)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      <Sparkles className="h-2.5 w-2.5 shrink-0" style={{ color: "#22d3ee" }} />
                      Vibe Coder
                    </span>
                  </motion.div>
                </motion.div>

                {/* Name */}
                <motion.h2
                  className="mt-2 text-2xl sm:text-[28px] font-semibold tracking-tight text-white"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.38, duration: 0.5 }}
                >
                  Saladi Subrahmanyam
                </motion.h2>

                {/* Title + animated underline */}
                <motion.div
                  className="relative mt-1.5 flex flex-col items-center"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.46 }}
                >
                  <p
                    className="text-[11px] uppercase tracking-[0.3em] font-medium"
                    style={{ color: "rgba(255,255,255,0.32)" }}
                  >
                    Creator of Nebula
                  </p>
                  <motion.div
                    className="mt-1.5 h-px rounded-full"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, #6366f1, #22d3ee, #a78bfa, transparent)",
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: 140 }}
                    transition={{ delay: 0.85, duration: 0.7, ease: "easeOut" }}
                  />
                </motion.div>

                {/* Stats row */}
                <motion.div
                  className="mt-5 flex items-center gap-6"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.52 }}
                >
                  <StatBadge value="1+" label="Years" delay={0.58} color="#6366f1" />
                  <div
                    style={{
                      width: 1,
                      height: 28,
                      background:
                        "linear-gradient(180deg, transparent, rgba(99,102,241,0.4), transparent)",
                    }}
                  />
                  <StatBadge value="AI" label="Augmented" delay={0.63} color="#22d3ee" />
                  <div
                    style={{
                      width: 1,
                      height: 28,
                      background:
                        "linear-gradient(180deg, transparent, rgba(34,211,238,0.4), transparent)",
                    }}
                  />
                  <StatBadge value="∞" label="Ideas" delay={0.68} color="#a78bfa" />
                </motion.div>

                {/* Description */}
                <motion.p
                  className="mt-5 max-w-sm text-sm leading-relaxed"
                  style={{ color: "rgba(255,255,255,0.44)" }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.58 }}
                >
                  AI-Augmented Full Stack Developer building intelligent web applications with
                  advanced LLMs, WebRTC, and modern cloud services. Turning ideas into
                  production-ready, cinematic experiences.
                </motion.p>

                {/* Tech badges */}
                <motion.div
                  className="mt-5 flex flex-wrap items-center justify-center gap-2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.64 }}
                >
                  {techBadges.map((b, i) => (
                    <motion.span
                      key={b.label}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium"
                      style={{
                        background: "rgba(99,102,241,0.07)",
                        border: "1px solid rgba(99,102,241,0.2)",
                        color: "rgba(255,255,255,0.5)",
                      }}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.7 + i * 0.07 }}
                      whileHover={{
                        background: "rgba(99,102,241,0.15)",
                        borderColor: "rgba(34,211,238,0.5)",
                        color: "#22d3ee",
                        scale: 1.07,
                        boxShadow: "0 0 14px rgba(34,211,238,0.15)",
                      }}
                    >
                      <b.icon
                        className="h-3 w-3 shrink-0"
                        style={{ color: "rgba(99,102,241,0.8)" }}
                      />
                      {b.label}
                    </motion.span>
                  ))}
                </motion.div>

                {/* Divider */}
                <motion.div
                  className="mt-7 w-full h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(99,102,241,0.18), rgba(34,211,238,0.18), transparent)",
                  }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.88, duration: 0.6 }}
                />

                {/* CTA buttons */}
                <motion.div
                  className="mt-6 flex items-center gap-3"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 }}
                >
                  <motion.a
                    href="https://www.linkedin.com/in/saladi-subrahmanyam"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "rgba(255,255,255,0.6)",
                    }}
                    whileHover={{
                      background: "rgba(10,102,194,0.15)",
                      borderColor: "rgba(10,102,194,0.5)",
                      color: "#60a5fa",
                      scale: 1.04,
                      boxShadow: "0 0 20px rgba(10,102,194,0.2)",
                    }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Linkedin className="h-4 w-4" />
                    LinkedIn
                  </motion.a>

                  {/* Primary neon CTA */}
                  <motion.a
                    href="https://saladi-subrahmanyam-portfolio.netlify.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(34,211,238,0.12) 100%)",
                      border: "1px solid rgba(99,102,241,0.45)",
                      color: "#a5b4fc",
                      boxShadow:
                        "0 0 22px rgba(99,102,241,0.12), inset 0 1px 0 rgba(99,102,241,0.18)",
                    }}
                    whileHover={{
                      background:
                        "linear-gradient(135deg, rgba(99,102,241,0.32) 0%, rgba(34,211,238,0.22) 100%)",
                      borderColor: "rgba(34,211,238,0.65)",
                      color: "#22d3ee",
                      scale: 1.04,
                      boxShadow:
                        "0 0 32px rgba(99,102,241,0.3), inset 0 1px 0 rgba(34,211,238,0.2)",
                    }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Globe className="h-4 w-4" />
                    Portfolio
                  </motion.a>
                </motion.div>
              </div>

              {/* Bottom neon shimmer line */}
              <motion.div
                className="absolute bottom-0 left-0 right-0 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(99,102,241,0.2), rgba(34,211,238,0.6), rgba(167,139,250,0.2), transparent)",
                }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>

            {/* Outer halo */}
            <motion.div
              className="absolute -inset-6 rounded-[3rem] pointer-events-none -z-10"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 50%, rgba(99,102,241,0.1) 0%, rgba(34,211,238,0.04) 40%, transparent 70%)",
              }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}