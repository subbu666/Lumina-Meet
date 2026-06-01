/**
 * PreJoinLobby.tsx — Lumina Meet
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
 *  Matches Lumina Meet's dark-space theme exactly — oklch palette,
 *  glass morphism, neon-primary/secondary/accent glow, Framer Motion
 *  spring transitions throughout.
 */

import { createPortal } from "react-dom";
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
import { NeonButton } from "@/components/ui-custom/NeonButton";
import { TileGenerativeAvatar } from "@/components/ui-custom/GenerativeAvatar";
import { useDeviceCheck } from "@/hooks/useDeviceCheck";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PreJoinLobbyProps {
  /** Meeting ID shown in the header */
  meetingId: string;
  /** Current user's display name */
  username: string;
  /** Called when the user clicks "Join now" — receives the live stream */
  onJoin: (stream: MediaStream | null, micEnabled: boolean, camEnabled: boolean) => void;
  /** Called when the user wants to go back / cancel */
  onCancel: () => void;
}

// ─── Audio Level Meter ────────────────────────────────────────────────────────

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
              background: lit
                ? isHigh
                  ? "oklch(0.72 0.22 35)"
                  : isMid
                    ? "oklch(0.82 0.16 210)"
                    : "oklch(0.65 0.22 280)"
                : "oklch(1 0 0 / 0.12)",
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Device Select Dropdown ───────────────────────────────────────────────────

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
            ? "border-white/5 bg-white/3 text-muted-foreground/40 cursor-not-allowed"
            : open
              ? "border-[var(--neon-primary)]/50 bg-[var(--neon-primary)]/8 text-foreground"
              : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/8 hover:border-white/20",
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
                      : "hover:bg-white/8 text-muted-foreground",
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

// ─── Video Preview ────────────────────────────────────────────────────────────

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

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black/60 border border-white/8">
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

      {/* Subtle vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.45) 100%)",
        }}
      />

      {/* Speaking ring */}
      <AnimatePresence>
        {micEnabled && audioLevel > 15 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              boxShadow: `inset 0 0 0 2.5px oklch(0.82 0.16 210 / ${Math.min(0.9, audioLevel / 60)})`,
            }}
          />
        )}
      </AnimatePresence>

      {/* Camera-off pill */}
      <AnimatePresence>
        {!camEnabled && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/70 backdrop-blur border border-white/10 px-3 py-1.5"
          >
            <VideoOff className="h-3 w-3 text-[oklch(0.78_0.2_35)]" />
            <span className="text-[11px] text-muted-foreground">Camera is off</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Name tag */}
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-black/60 backdrop-blur px-2 py-1 text-xs">
        <span className="truncate max-w-[120px]">{username}</span>
        <span className="text-[10px] text-muted-foreground/50">(you)</span>
      </div>

      {/* Encrypted badge */}
      <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full border border-[var(--neon-secondary)]/30 bg-[var(--neon-secondary)]/10 px-2 py-0.5">
        <ShieldCheck className="h-2.5 w-2.5 text-[var(--neon-secondary)]" />
        <span className="text-[9px] text-[var(--neon-secondary)] font-medium">Encrypted</span>
      </div>
    </div>
  );
}

// ─── Permission Error ─────────────────────────────────────────────────────────

function PermissionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="w-full aspect-video rounded-2xl overflow-hidden border border-[oklch(0.72_0.22_35)/0.4] bg-[oklch(0.72_0.22_35)/0.06] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <motion.div
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 2.5, repeat: Infinity }}
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[oklch(0.72_0.22_35)/0.15] border border-[oklch(0.72_0.22_35)/0.3]"
      >
        <AlertTriangle className="h-7 w-7 text-[oklch(0.82_0.2_35)]" />
      </motion.div>
      <div>
        <p className="text-sm font-semibold text-[oklch(0.88_0.12_35)] mb-1">Permission Required</p>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-xl border border-[oklch(0.72_0.22_35)/0.4] bg-[oklch(0.72_0.22_35)/0.12] px-4 py-2 text-xs font-medium text-[oklch(0.82_0.2_35)] hover:bg-[oklch(0.72_0.22_35)/0.2] transition"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </button>
    </div>
  );
}

// ─── Acquiring Skeleton ───────────────────────────────────────────────────────

function AcquiringSkeleton() {
  return (
    <div className="w-full aspect-video rounded-2xl overflow-hidden border border-white/8 bg-black/40 flex flex-col items-center justify-center gap-4">
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

// ─── Main Component ───────────────────────────────────────────────────────────

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

  // Auto-open device settings if more than one device available
  useEffect(() => {
    if (cameras.length > 1 || microphones.length > 1) {
      setShowDeviceSettings(true);
    }
  }, [cameras.length, microphones.length]);

  const handleJoin = useCallback(() => {
    setJoining(true);
    const stream = confirmAndJoin();
    // Small delay so the animation plays
    setTimeout(() => {
      onJoin(stream, micEnabled, camEnabled);
    }, 300);
  }, [confirmAndJoin, onJoin, micEnabled, camEnabled]);

  const handleRetry = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center px-4 py-6"
      style={{ background: "#0B0F19" }}
    >
      {/* Ambient background orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <motion.div
          className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full opacity-25"
          style={{
            background: "radial-gradient(circle, oklch(0.65 0.22 280), transparent 70%)",
          }}
          animate={{ scale: [1, 1.18, 1], x: [0, 40, 0], y: [0, -20, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full opacity-15"
          style={{
            background: "radial-gradient(circle, oklch(0.82 0.16 210), transparent 70%)",
          }}
          animate={{ scale: [1, 1.22, 1], x: [0, -25, 0], y: [0, 25, 0] }}
          transition={{ duration: 17, repeat: Infinity, ease: "easeInOut", delay: 3 }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full opacity-8"
          style={{
            background: "radial-gradient(circle, oklch(0.75 0.18 305), transparent 70%)",
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
        {/* Outer glow */}
        <div className="absolute -inset-2 rounded-[2.5rem] bg-gradient-to-br from-[oklch(0.65_0.22_280/0.15)] via-[oklch(0.75_0.18_305/0.08)] to-[oklch(0.82_0.16_210/0.12)] blur-2xl pointer-events-none" />

        {/* Card */}
        <div className="relative glass-strong rounded-[2rem] border border-white/8 overflow-hidden">
          {/* Top accent bar */}
          <div className="h-px bg-gradient-to-r from-transparent via-[var(--neon-primary)] via-50% to-transparent opacity-70" />

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] min-h-0">
            {/* ── LEFT: Video Preview ─────────────────────────────────────── */}
            <div className="flex flex-col p-6 lg:p-8 gap-5 lg:border-r lg:border-white/5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 shrink-0 rounded-lg bg-gradient-neon animate-pulse-glow" />
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

              {/* Preview */}
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
                        ? "border-white/12 bg-white/6 text-foreground hover:bg-white/10"
                        : "border-[oklch(0.72_0.22_35)/0.45] bg-[oklch(0.72_0.22_35)/0.12] text-[oklch(0.82_0.2_35)]",
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
                        ? "border-white/12 bg-white/6 text-foreground hover:bg-white/10"
                        : "border-[oklch(0.72_0.22_35)/0.45] bg-[oklch(0.72_0.22_35)/0.12] text-[oklch(0.82_0.2_35)]",
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

                {/* Audio level + settings toggle */}
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
                        : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/8",
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
                    <div className="rounded-2xl border border-white/8 bg-white/3 p-4 space-y-3">
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

            {/* ── RIGHT: Join Panel ───────────────────────────────────────── */}
            <div className="flex flex-col justify-between p-6 lg:p-8 gap-6">
              {/* Top section: welcome text + status */}
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

                {/* Info banner when both are off */}
                <AnimatePresence>
                  {!micEnabled && !camEnabled && !permissionError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-start gap-2.5 rounded-xl border border-[oklch(0.8_0.18_80)/0.3] bg-[oklch(0.8_0.18_80)/0.06] px-3 py-2.5">
                        <Sparkles className="h-3.5 w-3.5 text-[oklch(0.85_0.18_80)] shrink-0 mt-0.5" />
                        <p className="text-[11px] text-[oklch(0.85_0.15_80)] leading-relaxed">
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
                    "Press Space to quickly unmute",
                    "Raise hand with Alt + H",
                    "Screen share with Alt + S",
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
                      ? "bg-[var(--neon-primary)]/40 cursor-not-allowed"
                      : "bg-gradient-to-r from-[oklch(0.55_0.22_280)] to-[oklch(0.65_0.18_305)] shadow-[0_8px_32px_-8px_oklch(0.65_0.22_280/0.55)] hover:opacity-95",
                  )}
                >
                  {/* Shimmer overlay */}
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

// ─── Status Row ───────────────────────────────────────────────────────────────

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
  const stateColor = error
    ? "text-[oklch(0.82_0.2_35)]"
    : warning
      ? "text-[oklch(0.85_0.18_80)]"
      : "text-[oklch(0.85_0.15_145)]";

  const borderColor = error
    ? "border-[oklch(0.72_0.22_35)/0.3]"
    : warning
      ? "border-[oklch(0.8_0.18_80)/0.3]"
      : "border-[oklch(0.75_0.18_145)/0.25]";

  const bgColor = error
    ? "bg-[oklch(0.72_0.22_35)/0.06]"
    : warning
      ? "bg-[oklch(0.8_0.18_80)/0.05]"
      : "bg-[oklch(0.75_0.18_145)/0.06]";

  const dotColor = error
    ? "oklch(0.72 0.22 35)"
    : warning
      ? "oklch(0.8 0.18 80)"
      : "oklch(0.75 0.18 145)";

  const text = error ? errText : warning ? warnText : okText;

  return (
    <div
      className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5", borderColor, bgColor)}
    >
      <div className="relative flex h-2 w-2 shrink-0">
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
        <CheckCircle2 className="h-3.5 w-3.5 text-[oklch(0.75_0.18_145)] shrink-0" />
      )}
    </div>
  );
}
