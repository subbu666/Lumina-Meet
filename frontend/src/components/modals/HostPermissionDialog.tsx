/**
 * HostPermissionDialog.tsx - Lumina Meet
 *
 * Shown to a participant when the host requests they turn their mic/cam on.
 * The participant can accept or decline - their choice is theirs alone.
 *
 * Design: full-screen backdrop, spring-animated card, pulsing icon, clear
 * action buttons. The host's name is shown prominently so the participant
 * knows exactly who is asking.
 */

import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { Mic, Video, Mic2, X, Check } from "lucide-react";
import type { HostPermissionRequest } from "@/hooks/useWebRTC";

// ─── Config per request type ──────────────────────────────────────────────────

const CONFIG = {
  mic: {
    icon: <Mic className="h-10 w-10 text-white" />,
    gradient: "from-[oklch(0.55_0.22_280)] to-[oklch(0.65_0.18_305)]",
    glow: "oklch(0.65 0.22 280 / 0.6)",
    borderColor: "oklch(0.65 0.22 280 / 0.4)",
    accentColor: "oklch(0.82 0.16 280)",
    title: "Microphone requested",
    body: (name: string) => (
      <>
        <span className="font-semibold" style={{ color: "oklch(0.82 0.16 280)" }}>
          {name}
        </span>{" "}
        is asking you to{" "}
        <span className="font-semibold text-foreground">unmute your microphone</span>. You are in
        control - accept only if you're comfortable.
      </>
    ),
    acceptLabel: "Unmute mic",
    AcceptIcon: Mic2,
  },
  cam: {
    icon: <Video className="h-10 w-10 text-white" />,
    gradient: "from-[oklch(0.55_0.18_210)] to-[oklch(0.65_0.16_240)]",
    glow: "oklch(0.65 0.18 210 / 0.6)",
    borderColor: "oklch(0.65 0.18 210 / 0.4)",
    accentColor: "oklch(0.82 0.16 210)",
    title: "Camera requested",
    body: (name: string) => (
      <>
        <span className="font-semibold" style={{ color: "oklch(0.82 0.16 210)" }}>
          {name}
        </span>{" "}
        is asking you to <span className="font-semibold text-foreground">turn your camera on</span>.
        You are in control - accept only if you're comfortable.
      </>
    ),
    acceptLabel: "Turn camera on",
    AcceptIcon: Video,
  },
  both: {
    icon: (
      <span className="flex gap-2">
        <Mic className="h-8 w-8 text-white" />
        <Video className="h-8 w-8 text-white" />
      </span>
    ),
    gradient: "from-[oklch(0.55_0.22_280)] to-[oklch(0.65_0.18_210)]",
    glow: "oklch(0.65 0.2 250 / 0.6)",
    borderColor: "oklch(0.65 0.2 250 / 0.4)",
    accentColor: "oklch(0.82 0.18 250)",
    title: "Mic & camera requested",
    body: (name: string) => (
      <>
        <span className="font-semibold" style={{ color: "oklch(0.82 0.18 250)" }}>
          {name}
        </span>{" "}
        is asking you to{" "}
        <span className="font-semibold text-foreground">unmute and turn your camera on</span>. You
        are in control - accept only if you're comfortable.
      </>
    ),
    acceptLabel: "Enable mic & camera",
    AcceptIcon: Mic2,
  },
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function HostPermissionDialog({
  request,
  onAccept,
  onDecline,
}: {
  request: HostPermissionRequest;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const cfg = CONFIG[request.type];

  // Escape key = decline
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDecline();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onDecline]);

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-2xl"
      >
        {/* Ambient glow behind card */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full opacity-20"
            style={{
              background: `radial-gradient(circle, ${cfg.glow}, transparent 65%)`,
            }}
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.84, y: 32 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.88, y: 20 }}
          transition={{ type: "spring", damping: 20, stiffness: 280 }}
          className="relative mx-4 w-full max-w-md"
        >
          {/* Outer halo */}
          <motion.div
            className="absolute -inset-2 rounded-[2.5rem] blur-2xl opacity-40"
            style={{
              background: `linear-gradient(135deg, ${cfg.glow}, transparent)`,
            }}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          />

          {/* Card */}
          <div
            className="relative overflow-hidden glass-strong rounded-[2rem] border"
            style={{ borderColor: cfg.borderColor }}
          >
            {/* Top gradient line */}
            <div
              className="h-0.5"
              style={{
                background: `linear-gradient(90deg, transparent, ${cfg.accentColor}, transparent)`,
              }}
            />

            <div className="px-8 pt-8 pb-7 text-center">
              {/* Icon */}
              <motion.div
                initial={{ scale: 0, rotate: -12 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 14, stiffness: 280, delay: 0.08 }}
                className="mx-auto mb-6 relative flex h-20 w-20 items-center justify-center"
              >
                {/* Pulsing rings */}
                {[0, 1].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute inset-0 rounded-full border"
                    style={{ borderColor: cfg.accentColor }}
                    animate={{ scale: [1, 1.5 + i * 0.3], opacity: [0.5, 0] }}
                    transition={{
                      duration: 1.6,
                      repeat: Infinity,
                      delay: i * 0.6,
                      ease: "easeOut",
                    }}
                  />
                ))}
                <div
                  className={`relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br ${cfg.gradient}`}
                  style={{ boxShadow: `0 0 40px -8px ${cfg.glow}` }}
                >
                  {cfg.icon}
                </div>
              </motion.div>

              {/* Host badge */}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="flex items-center justify-center gap-2 mb-3"
              >
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
                  style={{
                    color: cfg.accentColor,
                    borderColor: cfg.borderColor,
                    background: `${cfg.glow.replace("0.6", "0.08")}`,
                  }}
                >
                  👑 Host request
                </span>
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16 }}
                className="text-2xl font-bold mb-3 text-gradient"
              >
                {cfg.title}
              </motion.h2>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.22 }}
                className="text-sm text-muted-foreground leading-relaxed mb-7"
              >
                {cfg.body(request.fromUsername)}
              </motion.p>

              {/* Action buttons */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28 }}
                className="flex gap-3"
              >
                {/* Decline */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onDecline}
                  className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
                >
                  <X className="h-4 w-4" />
                  Decline
                </motion.button>

                {/* Accept */}
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onAccept}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white transition bg-gradient-to-r ${cfg.gradient}`}
                  style={{ boxShadow: `0 8px 32px -8px ${cfg.glow}` }}
                >
                  <Check className="h-4 w-4" />
                  {cfg.acceptLabel}
                </motion.button>
              </motion.div>

              {/* Reassurance note */}
              <p className="mt-4 text-[11px] text-muted-foreground/50">
                You're in control. Declining won't remove you from the meeting.
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
