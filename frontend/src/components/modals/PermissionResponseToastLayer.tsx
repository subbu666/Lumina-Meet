/**
 * PermissionResponseToastLayer.tsx — Lumina Meet
 *
 * Shown to the HOST when a participant responds (accept/decline) to a
 * mic/cam permission request.
 *
 * Design goals:
 *  - Impossible to miss: particle burst + spring entrance + colour-coded
 *  - Auto-dismisses after 5 s with a progress bar countdown
 *  - Stacks up to 4 toasts (oldest at bottom, newest on top)
 *  - Accepted = vibrant green celebration; Declined = muted, non-judgmental
 */

import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";
import { Mic2, Video, CheckCircle2, XCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PermissionToast {
  id: string;
  fromUsername: string;
  type: "mic" | "cam" | "both";
  accepted: boolean;
}

// ─── Particle burst (pure SVG, auto-removes after 800 ms) ────────────────────

function ParticleBurst({ accepted }: { accepted: boolean }) {
  const color = accepted ? "oklch(0.75 0.18 145)" : "oklch(0.7 0.1 260)";
  const count = 8;
  const angles = Array.from({ length: count }, (_, i) => (i / count) * 360);

  return (
    <span className="absolute inset-0 pointer-events-none overflow-visible" aria-hidden>
      {angles.map((angle, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 block h-1.5 w-1.5 rounded-full"
          style={{ background: color, translateX: "-50%", translateY: "-50%" }}
          initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
          animate={{
            scale: [0, 1.4, 0],
            x: Math.cos((angle * Math.PI) / 180) * 28,
            y: Math.sin((angle * Math.PI) / 180) * 28,
            opacity: [0, 1, 0],
          }}
          transition={{ duration: 0.65, delay: i * 0.025, ease: "easeOut" }}
        />
      ))}
    </span>
  );
}

// ─── Single toast ─────────────────────────────────────────────────────────────

function PermissionToastItem({
  toast,
  onDismiss,
}: {
  toast: PermissionToast;
  onDismiss: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, 5000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [onDismiss]);

  const accepted = toast.accepted;
  const typeLabel =
    toast.type === "mic" ? "microphone"
    : toast.type === "cam" ? "camera"
    : "mic & camera";

  const acceptedConfig = {
    border: "oklch(0.75 0.18 145 / 0.5)",
    bg: "oklch(0.75 0.18 145 / 0.07)",
    glow: "0 8px 40px -8px oklch(0.75 0.18 145 / 0.5)",
    accentColor: "oklch(0.85 0.15 145)",
    label: "bg-[oklch(0.75_0.18_145/0.2)] text-[oklch(0.85_0.15_145)] border-[oklch(0.75_0.18_145/0.4)]",
    shimmer: "oklch(0.75 0.18 145)",
  };
  const declinedConfig = {
    border: "oklch(0.65 0.15 260 / 0.35)",
    bg: "oklch(0.65 0.15 260 / 0.05)",
    glow: "0 8px 40px -8px oklch(0.55 0.15 260 / 0.3)",
    accentColor: "oklch(0.75 0.12 260)",
    label: "bg-[oklch(0.65_0.15_260/0.15)] text-[oklch(0.75_0.12_260)] border-[oklch(0.65_0.15_260/0.3)]",
    shimmer: "oklch(0.65 0.15 260)",
  };
  const cfg = accepted ? acceptedConfig : declinedConfig;

  const DeviceIcon = toast.type === "cam" ? Video : Mic2;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 90, scale: 0.88 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 90, scale: 0.9 }}
      transition={{ type: "spring", damping: 22, stiffness: 300 }}
      className="relative overflow-hidden rounded-2xl w-80"
      style={{
        border: `1px solid ${cfg.border}`,
        background: "oklch(0.14 0.025 265 / 0.96)",
        backdropFilter: "blur(24px)",
        boxShadow: cfg.glow,
      }}
    >
      {/* Top shimmer line */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{
          background: `linear-gradient(90deg, transparent, ${cfg.shimmer}, transparent)`,
        }}
      />

      {/* Progress bar (bottom) */}
      <motion.div
        className="absolute bottom-0 left-0 h-0.5 rounded-b-2xl"
        style={{ background: cfg.shimmer, opacity: 0.6 }}
        initial={{ width: "100%" }}
        animate={{ width: "0%" }}
        transition={{ duration: 5, ease: "linear" }}
      />

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon with particle burst */}
          <div className="relative shrink-0 mt-0.5">
            {accepted && <ParticleBurst accepted />}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, delay: 0.05 }}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl"
              style={{
                background: accepted
                  ? "oklch(0.75 0.18 145 / 0.2)"
                  : "oklch(0.65 0.15 260 / 0.15)",
                border: `1px solid ${cfg.border}`,
              }}
            >
              {accepted ? (
                <motion.span
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 500, delay: 0.1 }}
                >
                  <CheckCircle2 className="h-5 w-5" style={{ color: cfg.accentColor }} />
                </motion.span>
              ) : (
                <XCircle className="h-5 w-5" style={{ color: cfg.accentColor }} />
              )}
            </motion.div>
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            {/* Status pill */}
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide mb-1 ${cfg.label}`}
            >
              <DeviceIcon className="h-2.5 w-2.5" />
              {accepted ? "Accepted" : "Declined"}
            </span>

            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-sm font-semibold leading-tight"
            >
              {toast.fromUsername}
            </motion.p>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.16 }}
              className="text-[12px] text-muted-foreground leading-relaxed mt-0.5"
            >
              {accepted
                ? `turned their ${typeLabel} on`
                : `declined to enable ${typeLabel}`}
            </motion.p>
          </div>

          {/* Dismiss */}
          <button
            onClick={onDismiss}
            className="shrink-0 text-muted-foreground hover:text-foreground transition mt-0.5"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Accepted: celebratory sub-line */}
        {accepted && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ delay: 0.25 }}
            className="mt-2.5 flex items-center gap-2 rounded-xl px-3 py-2"
            style={{
              background: "oklch(0.75 0.18 145 / 0.06)",
              border: "1px solid oklch(0.75 0.18 145 / 0.2)",
            }}
          >
            <motion.span
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="text-base"
            >
              🎉
            </motion.span>
            <p className="text-[11px] text-muted-foreground">
              {typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} is now live in the meeting.
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Layer (stacks multiple toasts) ──────────────────────────────────────────

export function PermissionResponseToastLayer({
  toasts,
  onDismiss,
}: {
  toasts: PermissionToast[];
  onDismiss: (id: string) => void;
}) {
  return createPortal(
    <div className="fixed bottom-28 right-4 z-[9980] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.slice(-4).map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <PermissionToastItem
              toast={t}
              onDismiss={() => onDismiss(t.id)}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}