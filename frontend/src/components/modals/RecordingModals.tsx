/**
 * RecordingModals - Lumina Meet
 *
 * Refactored v3 — full light-mode compatibility.
 *
 * Root cause of invisible-in-light-mode bug:
 *   Every surface colour, border, and text colour was hardcoded as an oklch()
 *   literal tuned for the dark theme. In light mode these values rendered dark
 *   text on a near-white card that itself sat on a light backdrop, making the
 *   entire modal effectively invisible.
 *
 * Fix strategy:
 *   • Surface colours  → CSS vars: --card, --glass-bg, --glass-bg-strong,
 *                         --glass-border, --glass-border-strong
 *   • Text colours     → Tailwind semantic classes: text-foreground,
 *                         text-muted-foreground
 *   • Borders          → var(--border), var(--glass-border*)
 *   • Brand neon       → var(--neon-primary/secondary/accent/success/warning/danger)
 *   • Glow shadows     → var(--shadow-glow-primary/cyan/purple)
 *   • Alpha mixing     → color-mix(in oklch, var(--neon-*) N%, transparent)
 *                         so tints scale correctly in both themes
 *
 *   Only pure brand-accent OKLCH literals remain (gradients on buttons/icons
 *   where the neon must pop regardless of theme).
 *
 * All other changes from v2 are preserved:
 *   • createPortal into document.body for all modals
 *   • Stable onDismiss (useCallback in parent) for RecordingWarningBanner
 */

import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  X,
  Monitor,
  Mic2,
  MonitorSmartphone,
  Video,
  CheckCircle2,
  Copy,
  ExternalLink,
  Mail,
  Circle,
  Clock,
  AlertTriangle,
  StopCircle,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NeonButton } from "@/components/ui-custom/NeonButton";
import type { RecordingMode, RecordingEntry } from "@/hooks/useRecording";
import {
  estimatedUploadSec,
  MAX_RECORDING_DURATION_MIN,
  MAX_RECORDING_DURATION_SEC,
  RECORDING_WARNING_BEFORE_SEC,
} from "@/hooks/useRecording";

// ─── Recording Options Modal ──────────────────────────────────────────────────

interface RecordingOptionsModalProps {
  open: boolean;
  onClose: () => void;
  onStart: (mode: RecordingMode) => void;
  isSharing: boolean;
}

// Only OKLCH literals that are pure brand accents (gradients, glows on
// interactive elements). Surfaces and text always use CSS vars.
const RECORDING_OPTIONS: {
  mode: RecordingMode;
  icon: React.ReactNode;
  label: string;
  desc: string;
  // These stay as oklch because they're deliberate neon overrides
  from: string;
  to: string;
  glowRaw: string; // oklch glow for box-shadow
  borderRaw: string; // oklch border for selected state
  textVar: string; // CSS var for text; kept as var so it adapts
}[] = [
  {
    mode: "screen_voice",
    icon: <MonitorSmartphone className="h-7 w-7" />,
    label: "Screen + Voice",
    desc: "Capture everything - your screen and microphone together",
    from: "oklch(0.55 0.22 280)",
    to: "oklch(0.65 0.18 305)",
    glowRaw: "oklch(0.65 0.22 280 / 0.4)",
    borderRaw: "oklch(0.65 0.22 280 / 0.5)",
    textVar: "var(--neon-primary)",
  },
  {
    mode: "screen",
    icon: <Monitor className="h-7 w-7" />,
    label: "Screen Only",
    desc: "Silent screen capture - great for demos with no narration",
    from: "oklch(0.55 0.18 210)",
    to: "oklch(0.65 0.16 240)",
    glowRaw: "oklch(0.65 0.18 210 / 0.4)",
    borderRaw: "oklch(0.65 0.18 210 / 0.5)",
    textVar: "var(--neon-secondary)",
  },
  {
    mode: "voice",
    icon: <Mic2 className="h-7 w-7" />,
    label: "Voice Only",
    desc: "Audio recording only - lightweight, perfect for audio notes",
    from: "oklch(0.65 0.18 305)",
    to: "oklch(0.72 0.22 35)",
    glowRaw: "oklch(0.75 0.18 305 / 0.4)",
    borderRaw: "oklch(0.75 0.18 305 / 0.5)",
    textVar: "var(--neon-accent)",
  },
];

export function RecordingOptionsModal({
  open,
  onClose,
  onStart,
  isSharing,
}: RecordingOptionsModalProps) {
  const [selected, setSelected] = useState<RecordingMode | null>(null);
  const [hovering, setHovering] = useState<RecordingMode | null>(null);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setHovering(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  const handleStart = () => {
    if (!selected) return;
    onStart(selected);
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-xl"
          onClick={onClose}
        >
          {/* Ambient orbs — decorative only, opacity kept low */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div
              className="absolute left-1/4 top-1/4 h-80 w-80 rounded-full opacity-10"
              style={{
                background: "radial-gradient(circle, var(--neon-primary), transparent 70%)",
              }}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 5, repeat: Infinity }}
            />
            <motion.div
              className="absolute right-1/4 bottom-1/4 h-72 w-72 rounded-full opacity-8"
              style={{
                background: "radial-gradient(circle, var(--neon-secondary), transparent 70%)",
              }}
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 7, repeat: Infinity, delay: 2 }}
            />
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 28 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 16 }}
            transition={{ type: "spring", damping: 22, stiffness: 280 }}
            className="relative mx-4 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Outer glow — purely decorative, low opacity */}
            <div
              className="absolute -inset-2 rounded-[2.5rem] blur-2xl opacity-20"
              style={{
                background:
                  "linear-gradient(135deg, var(--neon-primary), var(--neon-secondary), var(--neon-accent))",
              }}
            />

            {/* Card — uses glass-strong so it picks up theme surface vars */}
            <div className="relative overflow-hidden glass-strong rounded-[2rem]">
              {/* Top gradient line */}
              <div
                className="h-px"
                style={{
                  background:
                    "linear-gradient(90deg, var(--neon-primary), var(--neon-secondary), var(--neon-accent))",
                }}
              />

              <div className="p-8">
                {/* Header */}
                <div className="flex items-start justify-between mb-7">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-xl"
                        style={{
                          background: "color-mix(in oklch, var(--neon-primary) 15%, transparent)",
                          border:
                            "1px solid color-mix(in oklch, var(--neon-primary) 35%, transparent)",
                        }}
                      >
                        <Video className="h-4 w-4" style={{ color: "var(--neon-primary)" }} />
                      </div>
                      <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                        Meeting Recording
                      </span>
                    </div>
                    <h2 className="text-2xl font-bold text-gradient">Choose Recording Mode</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Select what to capture - saved securely to cloud
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-muted-foreground hover:text-foreground hover:bg-[var(--glass-hover)] transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Mode options */}
                <div className="space-y-3 mb-5">
                  {RECORDING_OPTIONS.map((opt) => {
                    const isActive = selected === opt.mode;
                    const isHovered = hovering === opt.mode;

                    return (
                      <motion.button
                        key={opt.mode}
                        whileHover={{ scale: 1.015 }}
                        whileTap={{ scale: 0.985 }}
                        onClick={() => setSelected(opt.mode)}
                        onMouseEnter={() => setHovering(opt.mode)}
                        onMouseLeave={() => setHovering(null)}
                        className="w-full flex items-center gap-4 rounded-2xl border p-4 text-left transition-all duration-200"
                        style={
                          isActive
                            ? {
                                borderColor: opt.borderRaw,
                                background: `color-mix(in oklch, ${opt.from} 8%, var(--card))`,
                                boxShadow: `0 0 30px -8px ${opt.glowRaw}`,
                              }
                            : isHovered
                              ? {
                                  borderColor: `color-mix(in oklch, ${opt.borderRaw} 50%, var(--border))`,
                                  background: `color-mix(in oklch, ${opt.from} 4%, var(--card))`,
                                }
                              : {
                                  borderColor: "var(--border)",
                                  background: "var(--card)",
                                }
                        }
                      >
                        {/* Icon */}
                        <div
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-all duration-200"
                          style={
                            isActive
                              ? {
                                  background: `color-mix(in oklch, ${opt.from} 18%, transparent)`,
                                  borderColor: opt.borderRaw,
                                  color: opt.textVar,
                                  boxShadow: `0 0 20px -4px ${opt.glowRaw}`,
                                }
                              : {
                                  background: "var(--glass-bg)",
                                  borderColor: "var(--glass-border)",
                                  color: "var(--muted-foreground)",
                                }
                          }
                        >
                          {opt.icon}
                        </div>

                        {/* Label + description */}
                        <div className="flex-1 min-w-0">
                          <p
                            className="font-semibold text-sm transition-colors duration-200 mb-0.5"
                            style={
                              isActive ? { color: opt.textVar } : { color: "var(--foreground)" }
                            }
                          >
                            {opt.label}
                          </p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {opt.desc}
                          </p>
                        </div>

                        {/* Selection indicator */}
                        <div
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200"
                          style={
                            isActive
                              ? { borderColor: opt.borderRaw, background: opt.borderRaw }
                              : { borderColor: "var(--border)", background: "transparent" }
                          }
                        >
                          {isActive && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="h-2 w-2 rounded-full bg-white"
                            />
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Duration limit note */}
                <div
                  className="flex items-start gap-2.5 rounded-xl border px-4 py-3 mb-3"
                  style={{
                    borderColor: "color-mix(in oklch, var(--neon-warning) 35%, transparent)",
                    background: "color-mix(in oklch, var(--neon-warning) 7%, var(--card))",
                  }}
                >
                  <Timer
                    className="h-3.5 w-3.5 shrink-0 mt-0.5"
                    style={{ color: "var(--neon-warning)" }}
                  />
                  <p className="text-[12px] leading-relaxed" style={{ color: "var(--foreground)" }}>
                    <span className="font-semibold">
                      Recording length is capped at {MAX_RECORDING_DURATION_MIN} minutes.
                    </span>{" "}
                    The recorder stops automatically and your clip is saved when the limit is
                    reached. You'll get a warning 1 minute before.
                  </p>
                </div>

                {/* Privacy note */}
                <div
                  className="flex items-start gap-2.5 rounded-xl border px-4 py-3 mb-6"
                  style={{
                    borderColor: "color-mix(in oklch, var(--neon-secondary) 20%, transparent)",
                    background: "color-mix(in oklch, var(--neon-secondary) 5%, var(--card))",
                  }}
                >
                  <div
                    className="h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 animate-pulse"
                    style={{ background: "var(--neon-secondary)" }}
                  />
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    Recording is visible to you only. A shareable link + email notification will be
                    delivered once processing is complete.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <NeonButton variant="outline" onClick={onClose} className="flex-1">
                    Cancel
                  </NeonButton>
                  <motion.button
                    whileHover={{ scale: selected ? 1.02 : 1 }}
                    whileTap={{ scale: selected ? 0.97 : 1 }}
                    onClick={handleStart}
                    disabled={!selected}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white transition",
                      selected
                        ? "shadow-[var(--shadow-glow-primary)] hover:opacity-95"
                        : "cursor-not-allowed opacity-40",
                    )}
                    style={
                      selected
                        ? {
                            background:
                              "linear-gradient(135deg, oklch(0.55 0.22 280), oklch(0.65 0.18 305))",
                          }
                        : {
                            background: "var(--glass-bg)",
                            color: "var(--muted-foreground)",
                          }
                    }
                  >
                    <Circle className="h-3 w-3 fill-current text-red-400" />
                    Start Recording
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── Recording Limit Modal ────────────────────────────────────────────────────

interface RecordingLimitModalProps {
  open: boolean;
  onClose: () => void;
  recordingMode: RecordingMode;
}

export function RecordingLimitModal({ open, onClose, recordingMode }: RecordingLimitModalProps) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  const modeLabel =
    recordingMode === "screen_voice"
      ? "Screen + Voice"
      : recordingMode === "screen"
        ? "Screen"
        : "Voice";

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 backdrop-blur-2xl"
          onClick={onClose}
        >
          {/* Ambient background */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[700px] w-[700px] rounded-full"
              style={{
                background:
                  "radial-gradient(circle, color-mix(in oklch, var(--neon-danger) 35%, transparent), transparent 65%)",
              }}
              animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute -top-40 -right-40 h-96 w-96 rounded-full opacity-20"
              style={{
                background: "radial-gradient(circle, var(--neon-primary), transparent 70%)",
              }}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 4, repeat: Infinity, delay: 1 }}
            />
            <motion.div
              className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full opacity-15"
              style={{
                background: "radial-gradient(circle, var(--neon-warning), transparent 70%)",
              }}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 5, repeat: Infinity, delay: 0.5 }}
            />
            {/* Scanline sweep */}
            <motion.div
              className="absolute inset-x-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, color-mix(in oklch, var(--neon-danger) 60%, transparent), transparent)",
              }}
              animate={{ top: ["-2px", "100vh"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.82, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 20 }}
            transition={{ type: "spring", damping: 18, stiffness: 260 }}
            className="relative mx-4 w-full max-w-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Halo glow */}
            <motion.div
              className="absolute -inset-4 rounded-[3rem] blur-3xl opacity-40"
              style={{
                background: "linear-gradient(135deg, var(--neon-danger), var(--neon-primary))",
              }}
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            />

            {/* Card */}
            <div
              className="relative overflow-hidden glass-strong rounded-[2.5rem]"
              style={{
                borderColor: "color-mix(in oklch, var(--neon-danger) 40%, var(--glass-border))",
              }}
            >
              {/* Animated top bar */}
              <div
                className="h-1 shimmer"
                style={{
                  background:
                    "linear-gradient(90deg, var(--neon-primary), var(--neon-danger), var(--neon-warning), var(--neon-danger), var(--neon-primary))",
                  backgroundSize: "200% 100%",
                }}
              />

              <div className="px-10 pt-10 pb-8 text-center">
                {/* Pulsing stop icon */}
                <div className="relative mx-auto mb-7 flex h-28 w-28 items-center justify-center">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="absolute inset-0 rounded-full"
                      style={{
                        border:
                          "1px solid color-mix(in oklch, var(--neon-danger) 40%, transparent)",
                      }}
                      animate={{ scale: [1, 1.6 + i * 0.3], opacity: [0.6, 0] }}
                      transition={{
                        duration: 1.8,
                        repeat: Infinity,
                        delay: i * 0.5,
                        ease: "easeOut",
                      }}
                    />
                  ))}
                  <motion.div
                    className="relative flex h-full w-full items-center justify-center rounded-full"
                    style={{
                      background:
                        "linear-gradient(135deg, oklch(0.55 0.28 15), oklch(0.72 0.25 35))",
                      boxShadow:
                        "0 0 60px -8px oklch(0.72 0.28 25 / 0.8), inset 0 1px 0 oklch(1 0 0 / 0.15)",
                    }}
                    animate={{
                      boxShadow: [
                        "0 0 40px -8px oklch(0.72 0.28 25 / 0.6)",
                        "0 0 80px -4px oklch(0.72 0.28 25 / 0.9)",
                        "0 0 40px -8px oklch(0.72 0.28 25 / 0.6)",
                      ],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <StopCircle className="h-12 w-12 text-white" />
                  </motion.div>
                </div>

                {/* Headline */}
                <motion.h2
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-3xl font-bold mb-2 leading-tight"
                  style={{
                    background: "linear-gradient(135deg, var(--neon-danger), var(--neon-warning))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Recording Limit Reached
                </motion.h2>

                {/* Sub-headline */}
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 }}
                  className="text-base text-muted-foreground mb-6 leading-relaxed"
                >
                  Your {modeLabel} recording has hit the{" "}
                  <span className="font-semibold" style={{ color: "var(--neon-warning)" }}>
                    {MAX_RECORDING_DURATION_MIN}-minute limit
                  </span>{" "}
                  and has been automatically stopped. Everything recorded so far is being saved to
                  your cloud.
                </motion.p>

                {/* Info cards */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.26 }}
                  className="grid grid-cols-2 gap-3 mb-6"
                >
                  <div
                    className="rounded-2xl border px-4 py-3 text-left"
                    style={{
                      borderColor: "color-mix(in oklch, var(--neon-success) 30%, transparent)",
                      background: "color-mix(in oklch, var(--neon-success) 7%, var(--card))",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2
                        className="h-3.5 w-3.5"
                        style={{ color: "var(--neon-success)" }}
                      />
                      <p
                        className="text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: "var(--neon-success)" }}
                      >
                        Recording saved
                      </p>
                    </div>
                    <p className="text-[12px] text-muted-foreground leading-relaxed">
                      Your full {MAX_RECORDING_DURATION_MIN}-min clip is uploading to cloud now.
                    </p>
                  </div>
                  <div
                    className="rounded-2xl border px-4 py-3 text-left"
                    style={{
                      borderColor: "color-mix(in oklch, var(--neon-warning) 30%, transparent)",
                      background: "color-mix(in oklch, var(--neon-warning) 7%, var(--card))",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-3.5 w-3.5" style={{ color: "var(--neon-warning)" }} />
                      <p
                        className="text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: "var(--neon-warning)" }}
                      >
                        New recording
                      </p>
                    </div>
                    <p className="text-[12px] text-muted-foreground leading-relaxed">
                      You can start a fresh recording immediately after this.
                    </p>
                  </div>
                </motion.div>

                {/* Why the limit */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.32 }}
                  className="flex items-start gap-2.5 rounded-xl border px-4 py-3 mb-7 text-left"
                  style={{
                    borderColor: "color-mix(in oklch, var(--neon-danger) 20%, var(--border))",
                    background: "color-mix(in oklch, var(--neon-danger) 5%, var(--card))",
                  }}
                >
                  <AlertTriangle
                    className="h-3.5 w-3.5 shrink-0 mt-0.5"
                    style={{ color: "var(--neon-danger)" }}
                  />
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    The {MAX_RECORDING_DURATION_MIN}-minute cap keeps recordings concise and within
                    your free-tier cloud storage allowance. For longer sessions, split into multiple
                    recordings.
                  </p>
                </motion.div>

                {/* CTA */}
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.38 }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onClose}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-semibold text-white transition"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.55 0.28 15), oklch(0.72 0.22 35))",
                    boxShadow: "0 8px 40px -8px oklch(0.72 0.28 25 / 0.6)",
                  }}
                >
                  Got it - dismiss
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── Recording Warning Banner ─────────────────────────────────────────────────

interface RecordingWarningBannerProps {
  show: boolean;
  onDismiss: () => void;
}

export function RecordingWarningBanner({ show, onDismiss }: RecordingWarningBannerProps) {
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [show, onDismiss]);

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.96 }}
          transition={{ type: "spring", damping: 22, stiffness: 320 }}
          className="fixed top-[72px] left-1/2 -translate-x-1/2 z-[9980] pointer-events-auto"
        >
          <div
            className="flex items-center gap-3 rounded-2xl border px-4 py-2.5 shadow-2xl backdrop-blur-xl"
            style={{
              background: "var(--card)",
              borderColor: "color-mix(in oklch, var(--neon-danger) 45%, var(--border))",
              boxShadow: "0 8px 40px -8px color-mix(in oklch, var(--neon-danger) 40%, transparent)",
            }}
          >
            {/* Pulsing dot */}
            <div className="relative flex h-2.5 w-2.5 shrink-0">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ background: "var(--neon-danger)" }}
              />
              <span
                className="relative inline-flex h-2.5 w-2.5 rounded-full"
                style={{ background: "var(--neon-danger)" }}
              />
            </div>

            <p className="text-sm font-medium text-foreground">
              <span className="font-bold" style={{ color: "var(--neon-warning)" }}>
                1 minute left
              </span>{" "}
              - recording will auto-stop at {MAX_RECORDING_DURATION_MIN} min
            </p>

            <button
              onClick={onDismiss}
              className="ml-1 text-muted-foreground hover:text-foreground transition shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── Recording Link Modal ─────────────────────────────────────────────────────

interface RecordingLinkModalProps {
  open: boolean;
  onClose: () => void;
  mode: RecordingMode;
  durationSec: number;
  uploadProgress: number;
  isUploading: boolean;
  recording: RecordingEntry | null;
  error: string | null;
  userEmail: string;
}

function formatDur(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

const MODE_LABELS: Record<RecordingMode, string> = {
  screen_voice: "Screen + Voice",
  screen: "Screen Only",
  voice: "Voice Only",
};

// Use CSS vars for text so they adapt; keep gradient coords as oklch for
// visual identity on CTA buttons that intentionally ignore theme surfaces.
const MODE_COLORS: Record<
  RecordingMode,
  { from: string; to: string; glowRaw: string; textVar: string }
> = {
  screen_voice: {
    from: "oklch(0.55 0.22 280)",
    to: "oklch(0.65 0.18 305)",
    glowRaw: "oklch(0.65 0.22 280 / 0.4)",
    textVar: "var(--neon-primary)",
  },
  screen: {
    from: "oklch(0.55 0.18 210)",
    to: "oklch(0.65 0.16 240)",
    glowRaw: "oklch(0.65 0.18 210 / 0.4)",
    textVar: "var(--neon-secondary)",
  },
  voice: {
    from: "oklch(0.65 0.18 305)",
    to: "oklch(0.72 0.22 35)",
    glowRaw: "oklch(0.75 0.18 305 / 0.4)",
    textVar: "var(--neon-accent)",
  },
};

const UPLOAD_PHASES = [
  { threshold: 0, label: "Preparing recording…" },
  { threshold: 10, label: "Compressing file…" },
  { threshold: 30, label: "Uploading to cloud…" },
  { threshold: 60, label: "Syncing with Cloudinary…" },
  { threshold: 85, label: "Processing media…" },
  { threshold: 92, label: "Generating link…" },
  { threshold: 98, label: "Finalising…" },
];

function getPhase(progress: number): string {
  let label = UPLOAD_PHASES[0].label;
  for (const p of UPLOAD_PHASES) {
    if (progress >= p.threshold) label = p.label;
  }
  return label;
}

export function RecordingLinkModal({
  open,
  onClose,
  mode,
  durationSec,
  uploadProgress,
  isUploading,
  recording,
  error,
  userEmail,
}: RecordingLinkModalProps) {
  const [copied, setCopied] = useState(false);
  const [timerLeft, setTimerLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const colors = MODE_COLORS[mode];

  useEffect(() => {
    if (!open || !isUploading) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const total = estimatedUploadSec(mode, durationSec);
    setTimerLeft(total);
    timerRef.current = setInterval(() => {
      setTimerLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [open, isUploading, mode, durationSec]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isUploading) onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, isUploading, onClose]);

  const handleCopy = () => {
    if (!recording?.cloudinaryUrl) return;
    navigator.clipboard.writeText(recording.cloudinaryUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const R = 56;
  const C = 2 * Math.PI * R;
  const progressArc = isUploading ? C - (uploadProgress / 100) * C : recording ? 0 : C;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-xl"
          onClick={!isUploading ? onClose : undefined}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full opacity-10"
              style={{
                background: `radial-gradient(circle, ${colors.from}, transparent 70%)`,
              }}
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 4, repeat: Infinity }}
            />
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 28 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", damping: 22, stiffness: 280 }}
            className="relative mx-4 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="absolute -inset-2 rounded-[2.5rem] blur-2xl opacity-20"
              style={{
                background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
              }}
            />

            <div className="relative overflow-hidden glass-strong rounded-[2rem]">
              <div
                className="h-px"
                style={{
                  background: `linear-gradient(90deg, transparent, ${colors.from}, ${colors.to}, transparent)`,
                }}
              />

              <div className="p-8 text-center">
                {/* SVG progress ring */}
                <div
                  className="relative mx-auto mb-6 flex items-center justify-center"
                  style={{ width: 140, height: 140 }}
                >
                  {isUploading && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-2"
                      style={{
                        borderColor: `color-mix(in oklch, ${colors.textVar} 20%, transparent)`,
                      }}
                      animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0.6, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  )}

                  <svg
                    width="140"
                    height="140"
                    style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}
                  >
                    <circle
                      cx="70"
                      cy="70"
                      r={R}
                      fill="none"
                      stroke="var(--glass-border)"
                      strokeWidth="6"
                    />
                    <motion.circle
                      cx="70"
                      cy="70"
                      r={R}
                      fill="none"
                      stroke={colors.textVar}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={C}
                      strokeDashoffset={progressArc}
                      transition={{ duration: 0.5 }}
                      style={{ filter: `drop-shadow(0 0 8px ${colors.glowRaw})` }}
                    />
                  </svg>

                  <div className="relative z-10 flex flex-col items-center justify-center">
                    {isUploading && !recording && !error && (
                      <>
                        <motion.p
                          className="text-3xl font-bold font-mono tabular-nums"
                          style={{ color: colors.textVar }}
                          key={timerLeft}
                          initial={{ scale: 1.1 }}
                          animate={{ scale: 1 }}
                        >
                          {timerLeft > 0 ? `${timerLeft}s` : "…"}
                        </motion.p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                          {uploadProgress}%
                        </p>
                      </>
                    )}
                    {recording && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 400 }}
                      >
                        <CheckCircle2 className="h-10 w-10" style={{ color: colors.textVar }} />
                      </motion.div>
                    )}
                    {error && !isUploading && (
                      <X className="h-8 w-8" style={{ color: "var(--neon-danger)" }} />
                    )}
                  </div>
                </div>

                {/* State: uploading */}
                {isUploading && !recording && !error && (
                  <>
                    <motion.h2
                      className="text-xl font-bold mb-2"
                      style={{ color: colors.textVar }}
                      key="uploading-title"
                    >
                      Generating Your Link
                    </motion.h2>
                    <motion.p
                      key={getPhase(uploadProgress)}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-sm text-muted-foreground mb-4"
                    >
                      {getPhase(uploadProgress)}
                    </motion.p>

                    <div
                      className="h-1.5 w-full rounded-full overflow-hidden mb-3"
                      style={{ background: "var(--glass-border)" }}
                    >
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          background: `linear-gradient(90deg, ${colors.from}, ${colors.to})`,
                          boxShadow: `0 0 12px ${colors.glowRaw}`,
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>

                    <div className="flex items-center justify-center gap-3 mt-4">
                      <span
                        className="text-[11px] rounded-full border px-3 py-1 text-muted-foreground"
                        style={{
                          borderColor: "var(--border)",
                          background: "var(--glass-bg)",
                        }}
                      >
                        {MODE_LABELS[mode]}
                      </span>
                      <span
                        className="text-[11px] rounded-full border px-3 py-1 text-muted-foreground"
                        style={{
                          borderColor: "var(--border)",
                          background: "var(--glass-bg)",
                        }}
                      >
                        {formatDur(durationSec)}
                      </span>
                    </div>

                    <p className="mt-3 text-[11px] text-muted-foreground opacity-60">
                      Estimated {formatDur(Math.max(0, timerLeft))} remaining
                    </p>

                    <div
                      className="mt-5 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-left"
                      style={{
                        borderColor: "var(--border)",
                        background: "var(--glass-bg)",
                      }}
                    >
                      <Mail
                        className="h-3.5 w-3.5 shrink-0 mt-0.5"
                        style={{ color: "var(--neon-secondary)" }}
                      />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        A shareable link will be sent to{" "}
                        <span className="text-foreground font-medium">{userEmail}</span> once
                        processing is complete.
                      </p>
                    </div>
                  </>
                )}

                {/* State: done */}
                {recording && !isUploading && (
                  <>
                    <motion.h2
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xl font-bold mb-1"
                      style={{ color: colors.textVar }}
                    >
                      Recording Ready!
                    </motion.h2>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 }}
                      className="text-sm text-muted-foreground mb-5"
                    >
                      Your recording has been saved to the cloud
                    </motion.p>

                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="flex items-center justify-center gap-2 flex-wrap mb-5"
                    >
                      {[
                        MODE_LABELS[mode],
                        formatDur(recording.durationSec),
                        `${(recording.fileSizeBytes / 1024 / 1024).toFixed(1)} MB`,
                      ].map((chip) => (
                        <span
                          key={chip}
                          className="text-[11px] rounded-full border px-3 py-1 text-muted-foreground"
                          style={{
                            borderColor: "var(--border)",
                            background: "var(--glass-bg)",
                          }}
                        >
                          {chip}
                        </span>
                      ))}
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="mb-4 rounded-xl border flex items-center gap-2 px-3 py-2.5 text-left"
                      style={{
                        borderColor: "var(--border)",
                        background: "var(--glass-bg)",
                      }}
                    >
                      <p
                        className="flex-1 min-w-0 text-[12px] font-mono truncate"
                        style={{ color: "var(--neon-secondary)" }}
                      >
                        {recording.cloudinaryUrl}
                      </p>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleCopy}
                        className="shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border transition"
                        style={
                          copied
                            ? {
                                borderColor:
                                  "color-mix(in oklch, var(--neon-success) 50%, transparent)",
                                background:
                                  "color-mix(in oklch, var(--neon-success) 15%, transparent)",
                                color: "var(--neon-success)",
                              }
                            : {
                                borderColor: "var(--border)",
                                background: "var(--glass-bg)",
                                color: "var(--muted-foreground)",
                              }
                        }
                      >
                        {copied ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> Copy
                          </>
                        )}
                      </motion.button>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.35 }}
                      className="flex items-start gap-2 rounded-xl border px-4 py-3 mb-5 text-left"
                      style={{
                        borderColor: "color-mix(in oklch, var(--neon-secondary) 20%, transparent)",
                        background: "color-mix(in oklch, var(--neon-secondary) 5%, var(--card))",
                      }}
                    >
                      <Mail
                        className="h-3.5 w-3.5 shrink-0 mt-0.5"
                        style={{ color: "var(--neon-secondary)" }}
                      />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Email with this link sent to{" "}
                        <span className="text-foreground font-medium">{userEmail}</span>
                      </p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="flex gap-3"
                    >
                      <a
                        href={recording.cloudinaryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-semibold transition text-foreground hover:bg-[var(--glass-hover)]"
                        style={{
                          borderColor: "var(--border)",
                          background: "var(--glass-bg)",
                        }}
                      >
                        <ExternalLink className="h-4 w-4" /> Open
                      </a>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={onClose}
                        className="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white transition"
                        style={{
                          background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
                          boxShadow: `0 8px 32px -8px ${colors.glowRaw}`,
                        }}
                      >
                        Done
                      </motion.button>
                    </motion.div>
                  </>
                )}

                {/* State: error */}
                {error && !isUploading && (
                  <>
                    <h2 className="text-xl font-bold mb-2" style={{ color: "var(--neon-danger)" }}>
                      Upload Failed
                    </h2>
                    <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{error}</p>
                    <NeonButton variant="outline" onClick={onClose} className="w-full">
                      Close
                    </NeonButton>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
