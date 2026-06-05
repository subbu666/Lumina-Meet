// ThemeToggle.tsx
import React, { useEffect, useRef, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useThemeStore, type Theme } from "@/store/themeStore";
import { cn } from "@/lib/utils";

/* ─── helpers ─────────────────────────────────────────── */

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

/** Canvas-based particle burst (stars for dark, sun-sparks for light). */
function burstParticles(x: number, y: number, isDark: boolean) {
  const canvas = document.createElement("canvas");
  const SIZE = 200;
  const DPR = window.devicePixelRatio || 1;
  canvas.width = SIZE * DPR;
  canvas.height = SIZE * DPR;
  Object.assign(canvas.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "9999",
    width: `${SIZE}px`,
    height: `${SIZE}px`,
    left: `${x - SIZE / 2}px`,
    top: `${y - SIZE / 2}px`,
  });
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;
  ctx.scale(DPR, DPR);
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const count = isDark ? 18 : 22;

  const particles = Array.from({ length: count }, (_, i) => {
    const angle = ((Math.PI * 2) / count) * i + (Math.random() - 0.5) * 0.4;
    const speed = 1.5 + Math.random() * 2.8;
    const life = 0.6 + Math.random() * 0.4;
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: isDark ? (Math.random() > 0.5 ? 2.5 : 1.2) : 0.8 + Math.random() * 1.8,
      life,
      maxLife: life,
    };
  });

  let start: number | null = null;
  const draw = (ts: number) => {
    if (!start) start = ts;
    const dt = Math.min((ts - start) / 1000, 1);
    ctx.clearRect(0, 0, SIZE, SIZE);

    let alive = false;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06; // gentle gravity
      p.life -= dt * 1.6;
      if (p.life <= 0) continue;
      alive = true;

      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;

      if (isDark) {
        // tri-star shards
        ctx.fillStyle = `hsl(${250 + Math.random() * 30}, 90%, ${75 + Math.random() * 15}%)`;
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - s);
        ctx.lineTo(p.x + s * 0.3, p.y + s);
        ctx.lineTo(p.x - s * 0.3, p.y + s);
        ctx.closePath();
      } else {
        // warm sun sparks
        ctx.fillStyle = `hsl(${38 + Math.random() * 15}, 100%, ${55 + Math.random() * 15}%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    if (alive && dt < 1) requestAnimationFrame(draw);
    else canvas.remove();
  };
  requestAnimationFrame(draw);
}

/* ─── icons ───────────────────────────────────────────── */

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width={20}
      height={20}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: "visible" }}
    >
      <path d="M17 10.9a8 8 0 1 1-8-8.9 6 6 0 0 0 8 8.9z" fill="rgba(200,190,255,0.95)" />
      {/* orbiting stars */}
      {[
        { cx: 15.5, cy: 3.5, r: 1, delay: "0s" },
        { cx: 18, cy: 7, r: 0.7, delay: "0.6s" },
        { cx: 13, cy: 2, r: 0.6, delay: "1.1s" },
      ].map((s, i) => (
        <circle
          key={i}
          cx={s.cx}
          cy={s.cy}
          r={s.r}
          fill="rgba(200,190,255,0.85)"
          style={{
            animation: `tt-twinkle 2s ease-in-out ${s.delay} infinite`,
          }}
        />
      ))}
    </svg>
  );
}

function SunIcon() {
  const rays = [
    { x1: 10, y1: 2, x2: 10, y2: 3.8, delay: "0s" },
    { x1: 10, y1: 16.2, x2: 10, y2: 18, delay: "0.27s" },
    { x1: 2, y1: 10, x2: 3.8, y2: 10, delay: "0.55s" },
    { x1: 16.2, y1: 10, x2: 18, y2: 10, delay: "0.82s" },
    { x1: 4.22, y1: 4.22, x2: 5.49, y2: 5.49, delay: "0.1s" },
    { x1: 14.51, y1: 14.51, x2: 15.78, y2: 15.78, delay: "0.38s" },
    { x1: 4.22, y1: 15.78, x2: 5.49, y2: 14.51, delay: "0.65s" },
    { x1: 14.51, y1: 5.49, x2: 15.78, y2: 4.22, delay: "0.93s" },
  ];
  return (
    <svg
      viewBox="0 0 20 20"
      width={20}
      height={20}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: "visible" }}
    >
      <circle cx={10} cy={10} r={3.5} fill="rgba(180,120,0,0.9)" />
      {rays.map((r, i) => (
        <line
          key={i}
          x1={r.x1}
          y1={r.y1}
          x2={r.x2}
          y2={r.y2}
          stroke="rgba(180,120,0,0.75)"
          strokeWidth={1.5}
          strokeLinecap="round"
          style={{
            animation: `tt-ray 2.2s ease-in-out ${r.delay} infinite`,
          }}
        />
      ))}
    </svg>
  );
}

/* ─── keyframes injected once ─────────────────────────── */

const STYLES = `
  @keyframes tt-twinkle {
    0%,100% { opacity:.4; transform:scale(.8); }
    50%      { opacity:1;  transform:scale(1.1); }
  }
  @keyframes tt-ray {
    0%,100% { opacity:.7; }
    50%      { opacity:1; }
  }
  @keyframes tt-spin-cw  { to { transform: rotate(360deg);  } }
  @keyframes tt-spin-ccw { to { transform: rotate(-360deg); } }
  @keyframes tt-ripple {
    0%   { transform: scale(1);   opacity: .8; }
    100% { transform: scale(2.4); opacity: 0;  }
  }
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  const el = document.createElement("style");
  el.textContent = STYLES;
  document.head.appendChild(el);
  stylesInjected = true;
}

/* ─── Tooltip ─────────────────────────────────────────── */

function Tooltip({ label, shortcut }: { label: string; shortcut?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.18 }}
      style={{
        position: "absolute",
        bottom: "calc(100% + 10px)",
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--background)",
        border: "0.5px solid color-mix(in srgb, currentColor 20%, transparent)",
        borderRadius: 8,
        padding: "4px 10px",
        fontSize: 12,
        whiteSpace: "nowrap",
        pointerEvents: "none",
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        gap: 6,
        color: "var(--foreground)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      {label}
      {shortcut && (
        <kbd
          style={{
            fontSize: 10,
            fontFamily: "monospace",
            background: "color-mix(in srgb, currentColor 8%, transparent)",
            border: "0.5px solid color-mix(in srgb, currentColor 15%, transparent)",
            borderRadius: 4,
            padding: "1px 5px",
          }}
        >
          {shortcut}
        </kbd>
      )}
    </motion.div>
  );
}

/* ─── Orbital rings ───────────────────────────────────── */

function OrbitalRings({ isDark, visible }: { isDark: boolean; visible: boolean }) {
  const color = isDark ? "rgba(139,120,255," : "rgba(234,160,8,";
  return (
    <>
      {[
        {
          size: 62,
          offset: -7,
          anim: "tt-spin-cw 4s linear infinite",
          delay: "0s",
          opacity: 0.35,
          dashed: true,
        },
        {
          size: 76,
          offset: -14,
          anim: "tt-spin-ccw 6s linear infinite -2s",
          delay: "-2s",
          opacity: 0.15,
          dashed: false,
        },
      ].map((ring, i) => (
        <motion.span
          key={i}
          animate={{ opacity: visible ? 1 : 0 }}
          transition={{ duration: 0.3 }}
          style={{
            position: "absolute",
            width: ring.size,
            height: ring.size,
            top: ring.offset,
            left: ring.offset,
            borderRadius: "50%",
            border: `1px ${ring.dashed ? "dashed" : "solid"} ${color}${ring.opacity})`,
            animation: ring.anim,
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
}

/* ─── Ripple ring ─────────────────────────────────────── */

function RippleRing({ isDark, trigger }: { isDark: boolean; trigger: number }) {
  return (
    <AnimatePresence>
      {trigger > 0 && (
        <motion.span
          key={trigger}
          initial={{ scale: 1, opacity: 0.8 }}
          animate={{ scale: 2.4, opacity: 0 }}
          transition={{ duration: 0.65, ease: "easeOut" }}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `1.5px solid ${isDark ? "rgba(139,120,255,0.6)" : "rgba(234,160,8,0.6)"}`,
            pointerEvents: "none",
          }}
        />
      )}
    </AnimatePresence>
  );
}

/* ─── Main component ──────────────────────────────────── */

export function ThemeToggle({
  className,
  shortcut,
}: {
  className?: string;
  /** e.g. "⌘K" or "T" — shown in tooltip */
  shortcut?: string;
}) {
  const { theme, toggle } = useThemeStore();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [ripple, setRipple] = useState(0);

  const isDark = theme === "dark";

  useEffect(() => {
    injectStyles();
  }, []);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  /** Optional keyboard shortcut */
  useEffect(() => {
    if (!shortcut) return;
    const handler = (e: KeyboardEvent) => {
      // simple single-char shortcut, e.g. "T" or combined "⌘K"
      if (e.key.toLowerCase() === shortcut.replace(/[⌘⇧]/g, "").toLowerCase()) {
        btnRef.current?.click();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcut]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const rect = btnRef.current?.getBoundingClientRect();
      const x = rect ? rect.left + rect.width / 2 : e.clientX;
      const y = rect ? rect.top + rect.height / 2 : e.clientY;

      document.documentElement.style.setProperty("--nebula-x", `${x}px`);
      document.documentElement.style.setProperty("--nebula-y", `${y}px`);

      setRipple((n) => n + 1);
      burstParticles(x, y, isDark);

      const doc = document as Document & {
        startViewTransition?: (cb: () => void) => { finished: Promise<void> };
      };

      if (typeof doc.startViewTransition === "function") {
        doc.startViewTransition(() => {
          toggle();
          applyTheme(useThemeStore.getState().theme);
        });
      } else {
        toggle();
      }
    },
    [isDark, toggle],
  );

  const darkFace = {
    background: "rgba(30,27,75,0.72)",
    boxShadow: "inset 0 0 0 1px rgba(139,120,255,0.25)",
  };
  const lightFace = {
    background: "rgba(255,246,230,0.80)",
    boxShadow: "inset 0 0 0 1px rgba(234,179,8,0.30)",
  };

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      {/* Tooltip */}
      <AnimatePresence>
        {hovered && <Tooltip label={isDark ? "Light mode" : "Dark mode"} shortcut={shortcut} />}
      </AnimatePresence>

      <motion.button
        ref={btnRef}
        type="button"
        onClick={handleClick}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.91 }}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className={cn(
          "relative inline-flex h-12 w-12 items-center justify-center rounded-full overflow-visible focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          className,
        )}
        style={{ backdropFilter: "blur(8px)" }}
      >
        {/* Button face */}
        <motion.span
          animate={isDark ? darkFace : lightFace}
          transition={{ duration: 0.4 }}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
          }}
        />

        {/* Ambient glow */}
        <motion.span
          animate={{
            opacity: hovered ? 1 : 0,
            background: isDark
              ? "radial-gradient(circle, rgba(99,84,255,0.22) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(251,191,36,0.30) 0%, transparent 70%)",
          }}
          transition={{ duration: 0.35 }}
          style={{
            position: "absolute",
            width: 90,
            height: 90,
            top: -21,
            left: -21,
            borderRadius: "50%",
            pointerEvents: "none",
          }}
        />

        {/* Orbital rings */}
        <OrbitalRings isDark={isDark} visible={hovered} />

        {/* Ripple */}
        <RippleRing isDark={isDark} trigger={ripple} />

        {/* Icon swap */}
        <div style={{ position: "relative", zIndex: 2, width: 20, height: 20 }}>
          <AnimatePresence mode="wait" initial={false}>
            {isDark ? (
              <motion.span
                key="moon"
                initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MoonIcon />
              </motion.span>
            ) : (
              <motion.span
                key="sun"
                initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <SunIcon />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </motion.button>
    </div>
  );
}
