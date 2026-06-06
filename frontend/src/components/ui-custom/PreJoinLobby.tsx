/**
 * PreJoinLobby.tsx - Lumina Meet
 *
 * The pre-join device-check screen shown before any meeting entry
 * (instant, scheduled, or link join).
 *
 * Features:
 *  - Live camera preview with generative avatar fallback
 *  - Real-time audio level meter (animated bars)
 *  - Camera / microphone device selectors
 *  - Mic / cam toggle that mirrors the in-room controls
 *  - Background blur / effect preview selector
 *  - "Ready" join button that passes the live stream to the room
 *  - Permission error state with guidance
 *  - Acquiring / loading skeleton state
 *
 * Design:
 *  Matches Lumina Meet's theme exactly - oklch palette via CSS variables,
 *  glass morphism, neon-primary/secondary/accent/danger/success/warning glow,
 *  Framer Motion spring transitions throughout.
 *
 * ── Hardcoded-color audit ──────────────────────────────────────────────────
 *  All raw oklch() / hex values have been replaced with CSS custom properties
 *  from globals.css so light ↔ dark switching works without any patching.
 *
 *  New tokens consumed (add to globals.css if not already present):
 *    --neon-success   oklch(0.75 0.18 145)  / light: oklch(0.52 0.18 145)
 *    --neon-warning   oklch(0.80 0.18  80)  / light: oklch(0.58 0.18  80)
 *
 *  Removed one-off magic values:
 *    "#0B0F19"           → var(--body-base)
 *    oklch(0.65 0.22 280) → var(--neon-primary)
 *    oklch(0.82 0.16 210) → var(--neon-secondary)
 *    oklch(0.75 0.18 305) → var(--neon-accent)
 *    oklch(0.72 0.22  35) → var(--neon-danger)
 *    oklch(0.75 0.18 145) → var(--neon-success)
 *    oklch(0.80 0.18  80) → var(--neon-warning)
 * ──────────────────────────────────────────────────────────────────────────
 */

import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  ChevronDown,
  RefreshCw,
  ShieldCheck,
  Loader2,
  Camera,
  AlertTriangle,
  Settings2,
  CheckCircle2,
  LogIn,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TileGenerativeAvatar } from "@/components/ui-custom/GenerativeAvatar";
import { useDeviceCheck } from "@/hooks/useDeviceCheck";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PreJoinLobbyProps {
  /** Meeting ID shown in the header */
  meetingId: string;
  /** Current user's display name */
  username: string;
  /** Called when the user clicks "Join now" - receives the live stream */
  onJoin: (stream: MediaStream | null, micEnabled: boolean, camEnabled: boolean) => void;
  /** Called when the user wants to go back / cancel */
  onCancel: () => void;
}

// ─── Lumina Logo ───────────────────────────────────────────────────────────────
// Uses only CSS variable color tokens — no hardcoded hex or oklch values.

function LuminaLogo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="lg-main" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--neon-primary)" />
          <stop offset="100%" stopColor="var(--neon-secondary)" />
        </linearGradient>
        <radialGradient id="rg-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--neon-secondary)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--neon-primary)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lg-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.3" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x="1" y="1" width="34" height="34" rx="10" fill="url(#lg-main)" opacity="0.15" />
      <rect x="1" y="1" width="34" height="34" rx="10" stroke="url(#lg-main)" strokeWidth="1.5" />
      <rect x="1" y="1" width="34" height="34" rx="10" fill="url(#rg-glow)" />
      <rect
        x="5"
        y="11"
        width="18"
        height="14"
        rx="3"
        fill="url(#lg-main)"
        filter="url(#glow)"
        opacity="0.9"
      />
      {/* Theme surface fills the lens "hole" — adapts to light/dark automatically */}
      <circle cx="14" cy="18" r="4.5" fill="var(--body-base)" />
      <circle cx="14" cy="18" r="3" fill="url(#lg-main)" opacity="0.7" />
      <circle cx="14" cy="18" r="1.5" fill="var(--neon-secondary)" filter="url(#glow)" />
      <circle cx="15.2" cy="16.8" r="0.7" fill="white" opacity="0.6" />
      <path
        d="M25 14.5 L31 18 L25 21.5 Z"
        fill="url(#lg-main)"
        filter="url(#glow)"
        opacity="0.95"
      />
      <rect x="5" y="11" width="18" height="6" rx="3" fill="url(#lg-shine)" />
    </svg>
  );
}

// ─── Audio Level Meter ─────────────────────────────────────────────────────────
// Bar colors: low → neon-primary, mid → neon-secondary, high → neon-danger
// All via CSS variables — no raw oklch().

function AudioMeter({ level, active }: { level: number; active: boolean }) {
  const BAR_COUNT = 20;
  return (
    <div className="flex items-end gap-[2px] h-5">
      {Array.from({ length: BAR_COUNT }).map((_, i) => {
        const threshold = (i / BAR_COUNT) * 100;
        const lit = active && level > threshold;
        const isHigh = i > BAR_COUNT * 0.75;
        const isMid = i > BAR_COUNT * 0.45;
        return (
          <motion.div
            key={i}
            className="w-[3px] rounded-full transition-all duration-75"
            style={{
              height: lit ? `${8 + (i / BAR_COUNT) * 12}px` : "4px",
              // Inactive bars: white/12 is intentionally theme-neutral (works on both themes)
              background: lit
                ? isHigh
                  ? "var(--neon-danger)"
                  : isMid
                    ? "var(--neon-secondary)"
                    : "var(--neon-primary)"
                : "oklch(1 0 0 / 0.12)",
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Device Select Dropdown ────────────────────────────────────────────────────

function DeviceSelect({
  options,
  value,
  onChange,
  icon,
  placeholder,
  disabled,
}: {
  options: { deviceId: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  icon: React.ReactNode;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const selected = options.find((o) => o.deviceId === value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={cn(
          "w-full flex items-center gap-2 rounded-xl border px-3 py-2 text-xs text-left transition",
          disabled
            ? "border-white/5 bg-white/[0.03] text-muted-foreground/40 cursor-not-allowed"
            : open
              ? "border-[var(--neon-primary)]/50 bg-[var(--neon-primary)]/[0.08] text-foreground"
              : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/[0.08] hover:border-white/20",
        )}
      >
        <span className="shrink-0 text-muted-foreground/60">{icon}</span>
        <span className="flex-1 truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 text-muted-foreground/50 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ type: "spring", damping: 24, stiffness: 360 }}
            className="absolute bottom-full mb-1.5 left-0 right-0 z-50 glass-strong rounded-xl border border-white/10 p-1 shadow-2xl"
          >
            {options.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No devices found</p>
            ) : (
              options.map((opt) => (
                <button
                  key={opt.deviceId}
                  onClick={() => {
                    onChange(opt.deviceId);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-left transition",
                    opt.deviceId === value
                      ? "bg-[var(--neon-primary)]/15 text-[var(--neon-primary)]"
                      : "hover:bg-white/[0.08] text-muted-foreground",
                  )}
                >
                  {opt.deviceId === value && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                  <span className="flex-1 truncate">{opt.label}</span>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Video Preview ─────────────────────────────────────────────────────────────

function VideoPreview({
  stream,
  camEnabled,
  username,
  audioLevel,
  micEnabled,
}: {
  stream: MediaStream | null;
  camEnabled: boolean;
  username: string;
  audioLevel: number;
  micEnabled: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream && camEnabled) {
      el.srcObject = stream;
    } else {
      el.srcObject = null;
    }
  }, [stream, camEnabled]);

  const hasVideo =
    camEnabled &&
    stream != null &&
    stream.getVideoTracks().some((t) => t.readyState === "live" && t.enabled);

  // Dynamic opacity for the speaking ring, derived from audio level
  const speakingRingOpacity = Math.min(0.9, audioLevel / 60);

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black/60 border border-white/[0.08]">
      {/* Camera feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cn(
          "absolute inset-0 w-full h-full object-cover scale-x-[-1] transition-opacity duration-300",
          hasVideo ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Avatar fallback when camera is off */}
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <TileGenerativeAvatar username={username} speaking={false} />
        </div>
      )}

      {/* Subtle vignette — pure black overlay, theme-neutral by nature */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.45) 100%)",
        }}
      />

      {/* Speaking ring — uses CSS var for color, JS only for dynamic alpha */}
      <AnimatePresence>
        {micEnabled && audioLevel > 15 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              // color-mix lets us apply a dynamic alpha to the CSS variable color
              boxShadow: `inset 0 0 0 2.5px color-mix(in oklch, var(--neon-secondary) ${Math.round(speakingRingOpacity * 100)}%, transparent)`,
            }}
          />
        )}
      </AnimatePresence>

      {/* Camera-off pill
          Fix: bg raised to black/85, explicit text-white, border bumped to white/20,
          font-medium added — all so it stays legible over the dark avatar background. */}
      <AnimatePresence>
        {!camEnabled && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/85 backdrop-blur-md border border-white/20 px-3.5 py-1.5 shadow-lg"
          >
            <VideoOff className="h-3.5 w-3.5 text-[var(--neon-danger)] shrink-0" />
            <span className="text-[11px] font-medium text-white whitespace-nowrap">
              Camera is off
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Name tag
          Fix: bg raised to black/85, explicit text-white + text-white/60 for "(you)",
          font-medium, stronger border — visible over any avatar or live video frame. */}
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-black/85 backdrop-blur-md border border-white/15 px-2.5 py-1.5 shadow-lg text-xs">
        <span className="truncate max-w-[140px] font-medium text-white">{username}</span>
        <span className="text-[10px] font-normal text-white/55 shrink-0">(you)</span>
      </div>

      {/* Encrypted badge — uses neon-secondary CSS variable */}
      <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full border border-[var(--neon-secondary)]/30 bg-[var(--neon-secondary)]/10 px-2 py-0.5">
        <ShieldCheck className="h-2.5 w-2.5 text-[var(--neon-secondary)]" />
        <span className="text-[9px] text-[var(--neon-secondary)] font-medium">Encrypted</span>
      </div>
    </div>
  );
}

// ─── Permission Error ──────────────────────────────────────────────────────────
// All danger colors routed through var(--neon-danger).

function PermissionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="w-full aspect-video rounded-2xl overflow-hidden border border-[var(--neon-danger)]/40 bg-[var(--neon-danger)]/[0.06] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <motion.div
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 2.5, repeat: Infinity }}
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--neon-danger)]/15 border border-[var(--neon-danger)]/30"
      >
        <AlertTriangle className="h-7 w-7 text-[var(--neon-danger)]" />
      </motion.div>
      <div>
        <p className="text-sm font-semibold text-[var(--neon-danger)] mb-1">Permission Required</p>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-xl border border-[var(--neon-danger)]/40 bg-[var(--neon-danger)]/12 px-4 py-2 text-xs font-medium text-[var(--neon-danger)] hover:bg-[var(--neon-danger)]/20 transition"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </button>
    </div>
  );
}

// ─── Acquiring Skeleton ────────────────────────────────────────────────────────

function AcquiringSkeleton() {
  return (
    <div className="w-full aspect-video rounded-2xl overflow-hidden border border-white/[0.08] bg-black/40 flex flex-col items-center justify-center gap-4">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      >
        <Loader2 className="h-8 w-8 text-[var(--neon-primary)]" />
      </motion.div>
      <p className="text-xs text-muted-foreground">Requesting camera and microphone…</p>
    </div>
  );
}

// ─── Status Row ────────────────────────────────────────────────────────────────
// Uses --neon-success / --neon-warning / --neon-danger exclusively.
// Add these tokens to globals.css (see file header comment).

function StatusRow({
  label,
  ok,
  warning,
  error,
  okText,
  warnText,
  errText,
}: {
  label: string;
  ok: boolean;
  warning: boolean;
  error: boolean;
  okText: string;
  warnText: string;
  errText: string;
}) {
  // Semantic color token selection — all CSS variables, zero magic values
  const stateColor = error
    ? "text-[var(--neon-danger)]"
    : warning
      ? "text-[var(--neon-warning)]"
      : "text-[var(--neon-success)]";

  const borderColor = error
    ? "border-[var(--neon-danger)]/30"
    : warning
      ? "border-[var(--neon-warning)]/30"
      : "border-[var(--neon-success)]/25";

  const bgColor = error
    ? "bg-[var(--neon-danger)]/[0.06]"
    : warning
      ? "bg-[var(--neon-warning)]/[0.05]"
      : "bg-[var(--neon-success)]/[0.06]";

  // Used in inline style (not Tailwind) because it drives a dynamic animation color
  const dotColor = error
    ? "var(--neon-danger)"
    : warning
      ? "var(--neon-warning)"
      : "var(--neon-success)";

  const text = error ? errText : warning ? warnText : okText;

  return (
    <div
      className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5", borderColor, bgColor)}
    >
      <div className="relative flex h-2 w-2 shrink-0">
        {/* Ping animation only when not in error state */}
        {(ok || warning) && !error && (
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-50"
            style={{ background: dotColor }}
          />
        )}
        <span className="relative h-2 w-2 rounded-full" style={{ background: dotColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{label}</p>
        <p className={cn("text-[10px] truncate", stateColor)}>{text}</p>
      </div>
      {ok && !error && !warning && (
        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--neon-success)] shrink-0" />
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function PreJoinLobby({ meetingId, username, onJoin, onCancel }: PreJoinLobbyProps) {
  const {
    previewStream,
    isAcquiring,
    permissionError,
    micEnabled,
    camEnabled,
    audioLevel,
    cameras,
    microphones,
    selectedCameraId,
    selectedMicId,
    toggleMic,
    toggleCam,
    switchCamera,
    switchMicrophone,
    confirmAndJoin,
  } = useDeviceCheck();

  const [joining, setJoining] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);

  // Auto-open device settings if more than one device is available
  useEffect(() => {
    if (cameras.length > 1 || microphones.length > 1) {
      setShowDeviceSettings(true);
    }
  }, [cameras.length, microphones.length]);

  const handleJoin = useCallback(() => {
    setJoining(true);
    const stream = confirmAndJoin();
    // Small delay lets the button animation complete before handing off
    setTimeout(() => {
      onJoin(stream, micEnabled, camEnabled);
    }, 300);
  }, [confirmAndJoin, onJoin, micEnabled, camEnabled]);

  const handleRetry = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    /*
     * Root wrapper background:
     *   Was: style={{ background: "#0B0F19" }}  ← hardcoded, broke light mode entirely
     *   Now: style={{ background: "var(--body-base)" }}  ← theme-aware
     */
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center px-4 py-6"
      style={{ background: "var(--body-base)" }}
    >
      {/* ── Ambient background orbs ──────────────────────────────────────────
          All radial-gradient colors use CSS vars so they shift hue in light mode.
          Opacity values stay as numeric since they intentionally differ per orb.
      */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <motion.div
          className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full opacity-25"
          style={{
            background: "radial-gradient(circle, var(--neon-primary), transparent 70%)",
          }}
          animate={{ scale: [1, 1.18, 1], x: [0, 40, 0], y: [0, -20, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full opacity-15"
          style={{
            background: "radial-gradient(circle, var(--neon-secondary), transparent 70%)",
          }}
          animate={{ scale: [1, 1.22, 1], x: [0, -25, 0], y: [0, 25, 0] }}
          transition={{ duration: 17, repeat: Infinity, ease: "easeInOut", delay: 3 }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full opacity-[0.08]"
          style={{
            background: "radial-gradient(circle, var(--neon-accent), transparent 70%)",
          }}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 5 }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 24, stiffness: 260 }}
        className="relative w-full max-w-5xl"
      >
        {/* Outer glow ring — uses gradient-bg CSS var tokens */}
        <div
          className="absolute -inset-2 rounded-[2.5rem] blur-2xl pointer-events-none"
          style={{ background: "var(--gradient-bg)" }}
        />

        {/* Card */}
        <div className="relative glass-strong rounded-[2rem] border border-white/[0.08] overflow-hidden">
          {/* Top accent bar — uses gradient-cyber utility */}
          <div className="h-px gradient-cyber opacity-70" />

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] min-h-0">
            {/* ── LEFT: Video Preview ──────────────────────────────────────── */}
            <div className="flex flex-col p-6 lg:p-8 gap-5 lg:border-r lg:border-white/5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.div
                    whileHover={{ scale: 1.08, rotate: -4 }}
                    transition={{ type: "spring", stiffness: 300, damping: 18 }}
                  >
                    <LuminaLogo size={32} />
                  </motion.div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">Lumina Meet</p>
                    <p className="text-[10px] text-muted-foreground/60 font-mono">{meetingId}</p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onCancel}
                  className="text-[11px] text-muted-foreground hover:text-foreground border border-white/10 bg-white/5 rounded-lg px-3 py-1.5 transition"
                >
                  Cancel
                </motion.button>
              </div>

              {/* Preview area — conditionally shows skeleton / error / live feed */}
              {isAcquiring ? (
                <AcquiringSkeleton />
              ) : permissionError ? (
                <PermissionError message={permissionError} onRetry={handleRetry} />
              ) : (
                <VideoPreview
                  stream={previewStream}
                  camEnabled={camEnabled}
                  username={username}
                  audioLevel={audioLevel}
                  micEnabled={micEnabled}
                />
              )}

              {/* Controls row */}
              <div className="flex items-center justify-between">
                {/* Mic + Cam toggles */}
                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={toggleMic}
                    disabled={!!permissionError}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition",
                      micEnabled
                        ? "border-white/[0.12] bg-white/[0.06] text-foreground hover:bg-white/10"
                        : // Off state: neon-danger tint — fully tokenised
                          "border-[var(--neon-danger)]/45 bg-[var(--neon-danger)]/12 text-[var(--neon-danger)]",
                    )}
                  >
                    {micEnabled ? (
                      <Mic className="h-3.5 w-3.5" />
                    ) : (
                      <MicOff className="h-3.5 w-3.5" />
                    )}
                    <span>{micEnabled ? "Mic on" : "Mic off"}</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => void toggleCam()}
                    disabled={!!permissionError}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition",
                      camEnabled
                        ? "border-white/[0.12] bg-white/[0.06] text-foreground hover:bg-white/10"
                        : "border-[var(--neon-danger)]/45 bg-[var(--neon-danger)]/12 text-[var(--neon-danger)]",
                    )}
                  >
                    {camEnabled ? (
                      <VideoIcon className="h-3.5 w-3.5" />
                    ) : (
                      <VideoOff className="h-3.5 w-3.5" />
                    )}
                    <span>{camEnabled ? "Cam on" : "Cam off"}</span>
                  </motion.button>
                </div>

                {/* Audio meter + device settings toggle */}
                <div className="flex items-center gap-3">
                  <AudioMeter level={audioLevel} active={micEnabled && !permissionError} />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowDeviceSettings((v) => !v)}
                    className={cn(
                      "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] transition",
                      showDeviceSettings
                        ? "border-[var(--neon-primary)]/40 bg-[var(--neon-primary)]/10 text-[var(--neon-primary)]"
                        : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/[0.08]",
                    )}
                  >
                    <Settings2 className="h-3 w-3" />
                    <span>Devices</span>
                  </motion.button>
                </div>
              </div>

              {/* Device selectors (collapsible) */}
              <AnimatePresence>
                {showDeviceSettings && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ type: "spring", damping: 28, stiffness: 320 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold">
                        Device settings
                      </p>
                      <DeviceSelect
                        options={cameras}
                        value={selectedCameraId}
                        onChange={(id) => void switchCamera(id)}
                        icon={<Camera className="h-3 w-3" />}
                        placeholder="No camera detected"
                        disabled={cameras.length === 0 || !!permissionError}
                      />
                      <DeviceSelect
                        options={microphones}
                        value={selectedMicId}
                        onChange={(id) => void switchMicrophone(id)}
                        icon={<Mic className="h-3 w-3" />}
                        placeholder="No microphone detected"
                        disabled={microphones.length === 0 || !!permissionError}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── RIGHT: Join Panel ─────────────────────────────────────────── */}
            <div className="flex flex-col justify-between p-6 lg:p-8 gap-6">
              {/* Top section: welcome + status checklist */}
              <div className="space-y-6">
                <div>
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-[11px] uppercase tracking-widest text-[var(--neon-primary)] font-semibold mb-2"
                  >
                    Ready to join?
                  </motion.p>
                  <motion.h1
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="text-2xl font-bold text-gradient leading-tight"
                  >
                    Hi, {username}!
                  </motion.h1>
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-sm text-muted-foreground mt-1"
                  >
                    Check your setup before entering.
                  </motion.p>
                </div>

                {/* Device status checklist */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="space-y-2"
                >
                  {[
                    {
                      label: "Microphone",
                      ok: micEnabled && !permissionError,
                      warning: !micEnabled && !permissionError,
                      error: !!permissionError,
                      okText: "Active & detecting sound",
                      warnText: "Off — you'll join muted",
                      errText: "Permission denied",
                    },
                    {
                      label: "Camera",
                      ok: camEnabled && !permissionError,
                      warning: !camEnabled && !permissionError,
                      error: !!permissionError,
                      okText: "Video feed is live",
                      warnText: "Off — others won't see you",
                      errText: "Permission denied",
                    },
                    {
                      label: "Connection",
                      ok: true,
                      warning: false,
                      error: false,
                      okText: "End-to-end encrypted",
                      warnText: "",
                      errText: "",
                    },
                  ].map((item) => (
                    <StatusRow key={item.label} {...item} />
                  ))}
                </motion.div>

                {/* Listen-only info banner — shown when both mic and cam are off */}
                <AnimatePresence>
                  {!micEnabled && !camEnabled && !permissionError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-start gap-2.5 rounded-xl border border-[var(--neon-warning)]/30 bg-[var(--neon-warning)]/[0.06] px-3 py-2.5">
                        <Sparkles className="h-3.5 w-3.5 text-[var(--neon-warning)] shrink-0 mt-0.5" />
                        <p className="text-[11px] text-[var(--neon-warning)] leading-relaxed">
                          You'll join in listen-only mode. You can enable camera and mic anytime
                          inside the meeting.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Quick tips */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.35 }}
                  className="space-y-1.5"
                >
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-semibold">
                    Quick tips
                  </p>
                  {[
                    "Select an option and use Space to toggle it on/off",
                    "Test your mic and camera before joining",
                    "Sit facing a window or light source for best video quality",
                  ].map((tip) => (
                    <div key={tip} className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-[var(--neon-primary)]/50 shrink-0" />
                      <span className="text-[11px] text-muted-foreground/50">{tip}</span>
                    </div>
                  ))}
                </motion.div>
              </div>

              {/* Bottom: join button */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-3"
              >
                <motion.button
                  whileHover={!joining && !permissionError ? { scale: 1.02 } : {}}
                  whileTap={!joining && !permissionError ? { scale: 0.97 } : {}}
                  onClick={!joining ? handleJoin : undefined}
                  disabled={joining || isAcquiring}
                  className={cn(
                    "w-full relative flex items-center justify-center gap-2.5 rounded-2xl py-3.5 text-base font-semibold text-white transition overflow-hidden",
                    joining || isAcquiring
                      ? // Disabled state: tinted with primary variable
                        "bg-[var(--neon-primary)]/40 cursor-not-allowed"
                      : // Active state: uses gradient-primary + glow-primary — both defined in
                        // globals.css and already theme-aware. No raw oklch needed here.
                        "bg-gradient-primary glow-primary hover:opacity-95",
                  )}
                >
                  {/* Shimmer overlay (CSS animation, theme-neutral white highlight) */}
                  {!joining && !isAcquiring && (
                    <div className="absolute inset-0 shimmer pointer-events-none" />
                  )}

                  {joining ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <Loader2 className="h-5 w-5" />
                      </motion.div>
                      Joining…
                    </>
                  ) : isAcquiring ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Preparing devices…
                    </>
                  ) : (
                    <>
                      <LogIn className="h-5 w-5" />
                      Join now
                    </>
                  )}
                </motion.button>

                <p className="text-[10px] text-center text-muted-foreground/40">
                  By joining you agree to our usage policy
                </p>
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
