/**
 * RecordingModals — Lumina Meet
 *
 * Two modals:
 *  1. RecordingOptionsModal  — picks Screen / Voice / Both, requires canManage
 *  2. RecordingLinkModal     — shown post-upload, animated timer + final link
 *
 * Matches existing okclh design tokens from styles.css exactly.
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
  Loader2,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NeonButton } from "@/components/ui-custom/NeonButton";
import type { RecordingMode, RecordingEntry } from "@/hooks/useRecording";
import { estimatedUploadSec } from "@/hooks/useRecording";

// ─── Recording Options Modal ───────────────────────────────────────────────

interface RecordingOptionsModalProps {
  open: boolean;
  onClose: () => void;
  onStart: (mode: RecordingMode) => void;
  isSharing: boolean; // whether screen share is active
}

const RECORDING_OPTIONS: {
  mode: RecordingMode;
  icon: React.ReactNode;
  label: string;
  desc: string;
  gradient: string;
  glow: string;
  border: string;
  textColor: string;
  requiresSharing?: boolean;
}[] = [
  {
    mode: "screen_voice",
    icon: <MonitorSmartphone className="h-7 w-7" />,
    label: "Screen + Voice",
    desc: "Capture everything — your screen and microphone together",
    gradient: "from-[oklch(0.55_0.22_280)] to-[oklch(0.65_0.18_305)]",
    glow: "oklch(0.65 0.22 280 / 0.4)",
    border: "oklch(0.65 0.22 280 / 0.5)",
    textColor: "oklch(0.82 0.16 280)",
  },
  {
    mode: "screen",
    icon: <Monitor className="h-7 w-7" />,
    label: "Screen Only",
    desc: "Silent screen capture — great for demos with no narration",
    gradient: "from-[oklch(0.55_0.18_210)] to-[oklch(0.65_0.16_240)]",
    glow: "oklch(0.65 0.18 210 / 0.4)",
    border: "oklch(0.65 0.18 210 / 0.5)",
    textColor: "oklch(0.82 0.16 210)",
  },
  {
    mode: "voice",
    icon: <Mic2 className="h-7 w-7" />,
    label: "Voice Only",
    desc: "Audio recording only — lightweight, perfect for audio notes",
    gradient: "from-[oklch(0.65_0.18_305)] to-[oklch(0.72_0.22_35)]",
    glow: "oklch(0.75 0.18 305 / 0.4)",
    border: "oklch(0.75 0.18 305 / 0.5)",
    textColor: "oklch(0.85 0.16 305)",
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
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-xl"
          onClick={onClose}
        >
          {/* Ambient orbs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div
              className="absolute left-1/4 top-1/4 h-80 w-80 rounded-full opacity-15"
              style={{
                background: "radial-gradient(circle, oklch(0.65 0.22 280), transparent 70%)",
              }}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 5, repeat: Infinity }}
            />
            <motion.div
              className="absolute right-1/4 bottom-1/4 h-72 w-72 rounded-full opacity-10"
              style={{
                background: "radial-gradient(circle, oklch(0.82 0.16 210), transparent 70%)",
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
            {/* Outer glow */}
            <div className="absolute -inset-2 rounded-[2.5rem] bg-gradient-to-br from-[oklch(0.65_0.22_280/0.3)] via-[oklch(0.82_0.16_210/0.1)] to-[oklch(0.75_0.18_305/0.2)] blur-2xl" />

            {/* Card */}
            <div className="relative overflow-hidden glass-strong rounded-[2rem] border border-white/10">
              {/* Top gradient line */}
              <div className="h-px bg-gradient-to-r from-[oklch(0.65_0.22_280)] via-[oklch(0.82_0.16_210)] to-[oklch(0.75_0.18_305)] shimmer" />

              <div className="p-8">
                {/* Header */}
                <div className="flex items-start justify-between mb-7">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[oklch(0.65_0.22_280/0.2)] border border-[oklch(0.65_0.22_280/0.4)]">
                        <Video className="h-4 w-4 text-[oklch(0.82_0.16_280)]" />
                      </div>
                      <span className="text-[11px] uppercase tracking-widest text-muted-foreground/60 font-semibold">
                        Meeting Recording
                      </span>
                    </div>
                    <h2 className="text-2xl font-bold text-gradient">Choose Recording Mode</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Select what to capture — saved securely to cloud
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10 transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Options */}
                <div className="space-y-3 mb-7">
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
                        className={cn(
                          "w-full flex items-center gap-4 rounded-2xl border p-4 text-left transition-all duration-200",
                          isActive
                            ? "border-[var(--neon-primary)]/50 bg-[var(--neon-primary)]/10"
                            : "border-white/8 bg-white/4 hover:bg-white/7 hover:border-white/15",
                        )}
                        style={
                          isActive
                            ? {
                                borderColor: opt.border,
                                background: `${opt.glow.replace("0.4", "0.08")}`,
                                boxShadow: `0 0 30px -8px ${opt.glow}`,
                              }
                            : isHovered
                              ? {
                                  borderColor: opt.border.replace("0.5", "0.25"),
                                  background: `${opt.glow.replace("0.4", "0.04")}`,
                                }
                              : {}
                        }
                      >
                        {/* Icon */}
                        <div
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-all duration-200"
                          style={
                            isActive
                              ? {
                                  background: `${opt.glow.replace("0.4", "0.2")}`,
                                  borderColor: opt.border,
                                  color: opt.textColor,
                                  boxShadow: `0 0 20px -4px ${opt.glow}`,
                                }
                              : {
                                  background: "rgba(255,255,255,0.05)",
                                  borderColor: "rgba(255,255,255,0.1)",
                                  color: "oklch(0.7 0.03 260)",
                                }
                          }
                        >
                          {opt.icon}
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p
                              className="font-semibold text-sm transition-colors duration-200"
                              style={isActive ? { color: opt.textColor } : {}}
                            >
                              {opt.label}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {opt.desc}
                          </p>
                        </div>

                        {/* Selection indicator */}
                        <div
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200",
                            isActive
                              ? "border-[var(--neon-primary)] bg-[var(--neon-primary)]"
                              : "border-white/20 bg-transparent",
                          )}
                          style={
                            isActive ? { borderColor: opt.border, background: opt.border } : {}
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

                {/* Info note */}
                <div className="flex items-start gap-2.5 rounded-xl border border-[oklch(0.82_0.16_210/0.2)] bg-[oklch(0.82_0.16_210/0.05)] px-4 py-3 mb-6">
                  <div className="h-1.5 w-1.5 rounded-full bg-[var(--neon-secondary)] mt-1.5 shrink-0 animate-pulse" />
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
                        ? "bg-gradient-to-r from-[oklch(0.55_0.22_280)] to-[oklch(0.65_0.18_305)] shadow-[0_8px_32px_-8px_oklch(0.65_0.22_280/0.5)] hover:opacity-95"
                        : "bg-white/10 cursor-not-allowed opacity-50",
                    )}
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

// ─── Recording Link Generation Modal ──────────────────────────────────────

interface RecordingLinkModalProps {
  open: boolean;
  onClose: () => void;
  mode: RecordingMode;
  durationSec: number;
  uploadProgress: number; // 0–100
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

const MODE_COLORS: Record<
  RecordingMode,
  { from: string; to: string; glow: string; text: string }
> = {
  screen_voice: {
    from: "oklch(0.55 0.22 280)",
    to: "oklch(0.65 0.18 305)",
    glow: "oklch(0.65 0.22 280 / 0.4)",
    text: "oklch(0.82 0.16 280)",
  },
  screen: {
    from: "oklch(0.55 0.18 210)",
    to: "oklch(0.65 0.16 240)",
    glow: "oklch(0.65 0.18 210 / 0.4)",
    text: "oklch(0.82 0.16 210)",
  },
  voice: {
    from: "oklch(0.65 0.18 305)",
    to: "oklch(0.72 0.22 35)",
    glow: "oklch(0.75 0.18 305 / 0.4)",
    text: "oklch(0.85 0.16 305)",
  },
};

// Phase labels while uploading
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

  // Kick off the visual countdown when upload starts
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

  const totalEstimate = estimatedUploadSec(mode, durationSec);

  // Circumference for SVG timer ring
  const R = 56;
  const C = 2 * Math.PI * R;
  const progressArc = isUploading
    ? C - (uploadProgress / 100) * C
    : recording
      ? 0
      : C;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-xl"
          onClick={!isUploading ? onClose : undefined}
        >
          {/* Ambient bg */}
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
            {/* Glow halo */}
            <div
              className="absolute -inset-2 rounded-[2.5rem] blur-2xl opacity-30"
              style={{
                background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
              }}
            />

            {/* Card */}
            <div className="relative overflow-hidden glass-strong rounded-[2rem] border border-white/10">
              <div
                className="h-px shimmer"
                style={{
                  background: `linear-gradient(90deg, transparent, ${colors.from}, ${colors.to}, transparent)`,
                }}
              />

              <div className="p-8 text-center">
                {/* Visual timer ring */}
                <div className="relative mx-auto mb-6 flex items-center justify-center" style={{ width: 140, height: 140 }}>
                  {/* Outer pulse ring */}
                  {isUploading && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-2"
                      style={{ borderColor: `${colors.text}30` }}
                      animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0.6, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  )}

                  {/* SVG Progress ring */}
                  <svg
                    width="140"
                    height="140"
                    style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}
                  >
                    {/* Track */}
                    <circle
                      cx="70"
                      cy="70"
                      r={R}
                      fill="none"
                      stroke="rgba(255,255,255,0.06)"
                      strokeWidth="6"
                    />
                    {/* Progress arc */}
                    <motion.circle
                      cx="70"
                      cy="70"
                      r={R}
                      fill="none"
                      stroke={colors.text}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={C}
                      strokeDashoffset={progressArc}
                      transition={{ duration: 0.5 }}
                      style={{
                        filter: `drop-shadow(0 0 8px ${colors.glow})`,
                      }}
                    />
                  </svg>

                  {/* Center content */}
                  <div className="relative z-10 flex flex-col items-center justify-center">
                    {isUploading && !recording && !error && (
                      <>
                        <motion.p
                          className="text-3xl font-bold font-mono tabular-nums"
                          style={{ color: colors.text }}
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
                        <CheckCircle2 className="h-10 w-10" style={{ color: colors.text }} />
                      </motion.div>
                    )}
                    {error && !isUploading && (
                      <X className="h-8 w-8 text-[oklch(0.78_0.2_35)]" />
                    )}
                  </div>
                </div>

                {/* State: uploading */}
                {isUploading && !recording && !error && (
                  <>
                    <motion.h2
                      className="text-xl font-bold mb-2"
                      style={{ color: colors.text }}
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

                    {/* Progress bar */}
                    <div className="h-1.5 w-full rounded-full bg-white/8 overflow-hidden mb-3">
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          background: `linear-gradient(90deg, ${colors.from}, ${colors.to})`,
                          boxShadow: `0 0 12px ${colors.glow}`,
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>

                    {/* Recording metadata chips */}
                    <div className="flex items-center justify-center gap-3 mt-4">
                      <span className="text-[11px] rounded-full border border-white/10 bg-white/5 px-3 py-1 text-muted-foreground">
                        {MODE_LABELS[mode]}
                      </span>
                      <span className="text-[11px] rounded-full border border-white/10 bg-white/5 px-3 py-1 text-muted-foreground">
                        {formatDur(durationSec)}
                      </span>
                    </div>

                    {/* Estimated time left */}
                    <p className="mt-3 text-[11px] text-muted-foreground/50">
                      Estimated {formatDur(Math.max(0, timerLeft))} remaining
                    </p>

                    <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-left">
                      <Mail className="h-3.5 w-3.5 text-[var(--neon-secondary)] shrink-0 mt-0.5" />
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
                      style={{ color: colors.text }}
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

                    {/* Metadata pills */}
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
                          className="text-[11px] rounded-full border border-white/10 bg-white/5 px-3 py-1 text-muted-foreground"
                        >
                          {chip}
                        </span>
                      ))}
                    </motion.div>

                    {/* Link box */}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="mb-4 rounded-xl border border-white/10 bg-white/5 flex items-center gap-2 px-3 py-2.5 text-left"
                    >
                      <p className="flex-1 min-w-0 text-[12px] font-mono text-[var(--neon-secondary)] truncate">
                        {recording.cloudinaryUrl}
                      </p>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleCopy}
                        className={cn(
                          "shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border transition",
                          copied
                            ? "border-[oklch(0.75_0.18_145/0.5)] bg-[oklch(0.75_0.18_145/0.15)] text-[oklch(0.85_0.15_145)]"
                            : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10",
                        )}
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

                    {/* Email confirmation */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.35 }}
                      className="flex items-start gap-2 rounded-xl border border-[oklch(0.82_0.16_210/0.2)] bg-[oklch(0.82_0.16_210/0.05)] px-4 py-3 mb-5 text-left"
                    >
                      <Mail className="h-3.5 w-3.5 text-[var(--neon-secondary)] shrink-0 mt-0.5" />
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
                        className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-semibold hover:bg-white/10 transition"
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
                          boxShadow: `0 8px 32px -8px ${colors.glow}`,
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
                    <h2 className="text-xl font-bold text-[oklch(0.82_0.2_35)] mb-2">
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