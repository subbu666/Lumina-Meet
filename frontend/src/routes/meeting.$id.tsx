/**
 * meeting.$id.tsx — Lumina Meet
 *
 * FULLY REFACTORED — All patches merged (original + Patch 1-4).
 *
 * PATCHES INCLUDED (original set):
 * ─ FIX A   useWebRTC() onMeetingEnded callback for host "end for all" nav
 * ─ FIX B   handleLeaveConfirm: host → endMeetingForAll + fire-and-forget HTTP
 * ─ FIX C   RemoteVideoTile <video muted> prevents mobile echo/feedback
 * ─ FIX 1   isConnecting stays true until "room-peers"|"waiting"|"you-are-host"
 * ─ FIX 2   isWaiting guard checked BEFORE isConnecting guard
 * ─ PATCH 1-6   Post-meeting modals (MeetingEndedByHost, MeetingEndedByYou, YouLeft)
 * ─ CHAT PATCH  Private messaging with recipient picker & lock badge
 * ─ LOBBY   Full RBAC lobby (LobbyGate, LobbyManagerPanel, LobbyKnockToast, DenyConfirmModal)
 * ─ RECORDING   useRecording hook integration (crash-safe __luminaSocket callback)
 *               • RecordingOptionsModal / RecordingLinkModal / RecordingLimitModal
 *               • CircleDot / StopCircle controls in footer
 *               • REC live-indicator chip in header
 *
 * NEW PATCHES (v2 integration):
 * ─ PATCH 1   Destructure requestMicOn/requestCamOn/requestMicCamOn/hostPermissionRequest/
 *             respondToPermissionRequest from webrtc
 * ─ PATCH 2   permissionToasts state + LuminaMeet:permission-result event listener
 * ─ PATCH 3   HostPermissionDialog (participant view) + PermissionResponseToastLayer (host view)
 * ─ PATCH 4   Per-peer "ask to unmute / ask to turn camera on" buttons in ParticipantsPanel
 */

import { createPortal } from "react-dom";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { z } from "zod";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  MonitorUp,
  MonitorX,
  Users,
  ShieldCheck,
  X,
  Hourglass,
  Loader2,
  AlertTriangle,
  MessageSquare,
  Hand,
  SmilePlus,
  Send,
  Reply,
  ChevronDown,
  Coffee,
  Clock,
  Presentation,
  CheckCircle2,
  CornerDownLeft,
  WifiOff,
  Crown,
  UserCog,
  PenLine,
  Eraser,
  Trash2,
  StickyNote,
  ArrowUpRight,
  Square,
  Circle,
  MousePointer,
  BarChart2,
  ListChecks,
  ChevronRight,
  ChevronLeft,
  Play,
  Pause,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  Music2,
  CloudRain,
  Headphones,
  Volume2,
  VolumeX,
  Mic2,
  Layers,
  Sparkles,
  Plus,
  Undo2,
  Redo2,
  Type,
  BellRing,
  DoorOpen,
  DoorClosed,
  ShieldAlert,
  UserCheck,
  UserX,
  LogIn,
  Lock,
  CircleDot,
  StopCircle,
  // NEW — permission UI icons
  Bell,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { NeonButton } from "@/components/ui-custom/NeonButton";
import { cn } from "@/lib/utils";
import {
  useWebRTC,
  type RemotePeer,
  type ChatMessage,
  type ParticipantStatus,
  type WhiteboardElement,
  type WhiteboardTool,
  type Poll,
  type AgendaState,
  type TilePosition,
  type PendingParticipant,
} from "@/hooks/useWebRTC";
import { useAmbientSound, type SoundscapeId } from "@/hooks/useAmbientSound";
import { useRecording } from "@/hooks/useRecording";
import { TileGenerativeAvatar } from "@/components/ui-custom/GenerativeAvatar";
import {
  RecordingOptionsModal,
  RecordingLinkModal,
  RecordingLimitModal,
  RecordingWarningBanner,
} from "@/components/modals/RecordingModals";
import { apiClient } from "@/api/apiClient";

// ─── Route ────────────────────────────────────────────────────────────────────

const search = z.object({ scheduledFor: z.number().optional() }).partial();
export const Route = createFileRoute("/meeting/$id")({
  component: MeetingRoom,
  validateSearch: search.parse,
  head: () => ({ meta: [{ title: "Meeting — Lumina Meet" }] }),
});

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_BASE_URL;

// ─── Constants ────────────────────────────────────────────────────────────────

const REACTIONS = ["👍", "❤️", "😂", "😮", "👏", "🔥", "🎉", "💯", "🙌", "✨"];
const WB_SCALE = 1000;
const WB_COLORS = [
  "#f1f5f9",
  "#a78bfa",
  "#38bdf8",
  "#34d399",
  "#fb923c",
  "#f87171",
  "#facc15",
  "#e879f9",
];
const WB_WIDTHS = [2, 4, 8, 16];

const SOUNDSCAPES: { id: SoundscapeId; label: string; icon: React.ReactNode }[] = [
  { id: "rain", label: "Rain", icon: <CloudRain className="h-4 w-4" /> },
  { id: "lofi", label: "Lo-fi", icon: <Headphones className="h-4 w-4" /> },
  { id: "coffee", label: "Café", icon: <Coffee className="h-4 w-4" /> },
];

const STATUS_CONFIG: Record<
  ParticipantStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  available: {
    label: "Available",
    color: "oklch(0.75 0.18 145)",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  busy: {
    label: "Busy",
    color: "oklch(0.72 0.22 35)",
    icon: <WifiOff className="h-3 w-3" />,
  },
  away: {
    label: "Away",
    color: "oklch(0.8 0.18 80)",
    icon: <Clock className="h-3 w-3" />,
  },
  presenting: {
    label: "Presenting",
    color: "oklch(0.65 0.22 280)",
    icon: <Presentation className="h-3 w-3" />,
  },
  brb: {
    label: "BRB",
    color: "oklch(0.78 0.15 210)",
    icon: <Coffee className="h-3 w-3" />,
  },
};
const MANUAL_STATUSES: ParticipantStatus[] = ["available", "busy", "away", "brb"];

type PanelType = "participants" | "chat" | "whiteboard" | "polls" | "agenda" | "lobby" | null;
type LayoutMode = "grid" | "spatial" | "cinema";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape of the permission request pushed by the host via socket → useWebRTC */
interface HostPermissionRequest {
  type: "mic" | "cam" | "both";
  hostUsername: string;
}

/** Toast shown to the HOST after a participant responds to the request */
interface PermissionResponseToast {
  id: string;
  fromUsername: string;
  type: "mic" | "cam" | "both";
  accepted: boolean;
}

// ─── Portal Dropdown ──────────────────────────────────────────────────────────

function PortalDropdown({
  anchorRef,
  open,
  onClose,
  children,
  align = "right",
}: {
  anchorRef: React.RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const update = () => {
      const rect = anchorRef.current!.getBoundingClientRect();
      setPos({
        top: rect.bottom + 8,
        left: align === "right" ? rect.right : rect.left,
      });
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true, capture: true });
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef, align]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (anchorRef.current?.contains(e.target as Node)) return;
      if (document.getElementById("portal-dropdown-root")?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      id="portal-dropdown-root"
      style={{
        position: "fixed",
        top: pos.top,
        [align === "right" ? "right" : "left"]:
          align === "right" ? window.innerWidth - pos.left : pos.left,
        zIndex: 9999,
      }}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: "spring", damping: 22, stiffness: 320 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

// ─── Reaction Picker Portal ───────────────────────────────────────────────────

function ReactionPickerPortal({
  anchorRef,
  open,
  onClose,
  onReact,
}: {
  anchorRef: React.RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
}) {
  const [pos, setPos] = useState({ bottom: 0, centerX: 0 });

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const update = () => {
      const rect = anchorRef.current!.getBoundingClientRect();
      setPos({
        bottom: window.innerHeight - rect.top + 8,
        centerX: rect.left + rect.width / 2,
      });
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (anchorRef.current?.contains(e.target as Node)) return;
      if (document.getElementById("reaction-picker-portal")?.contains(e.target as Node)) return;
      onClose();
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      id="reaction-picker-portal"
      style={{
        position: "fixed",
        bottom: pos.bottom,
        left: pos.centerX,
        transform: "translateX(-50%)",
        zIndex: 9999,
      }}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.88 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
          >
            <div className="glass-strong rounded-2xl border border-white/10 p-2 shadow-2xl">
              <div className="flex gap-0.5">
                {REACTIONS.map((emoji, i) => (
                  <motion.button
                    key={emoji}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.025 }}
                    whileHover={{ scale: 1.4, y: -5 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => onReact(emoji)}
                    className="text-xl p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    {emoji}
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

// ─── Lobby Knock Toast ────────────────────────────────────────────────────────

function LobbyKnockToast({
  participant,
  onAdmit,
  onDeny,
  onDismiss,
}: {
  participant: PendingParticipant;
  onAdmit: () => void;
  onDeny: () => void;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 80, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.9 }}
      transition={{ type: "spring", damping: 22, stiffness: 300 }}
      className="relative overflow-hidden rounded-2xl border border-[var(--neon-primary)]/40 bg-[oklch(0.17_0.025_265/0.95)] backdrop-blur-xl shadow-[0_8px_40px_-8px_oklch(0.65_0.22_280/0.5)] w-80"
    >
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[var(--neon-primary)] to-transparent opacity-80 shimmer" />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-full bg-[var(--neon-primary)]/30 animate-ping" />
            <div className="relative">
              <Avatar
                name={participant.username}
                hue={hueForName(participant.username)}
                size={40}
              />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <BellRing className="h-3.5 w-3.5 text-[var(--neon-primary)] shrink-0 animate-pulse" />
              <p className="text-[11px] uppercase tracking-wider text-[var(--neon-primary)] font-semibold">
                Lobby knock
              </p>
            </div>
            <p className="text-sm font-semibold truncate">{participant.username}</p>
            <p className="text-[11px] text-muted-foreground">is waiting to join</p>
          </div>
          <button
            onClick={onDismiss}
            className="shrink-0 text-muted-foreground hover:text-foreground transition mt-0.5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={onAdmit}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[var(--neon-primary)]/20 border border-[var(--neon-primary)]/40 py-2 text-xs font-semibold text-[var(--neon-primary)] hover:bg-[var(--neon-primary)]/30 transition"
          >
            <UserCheck className="h-3.5 w-3.5" /> Admit
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={onDeny}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[oklch(0.72_0.22_35)]/15 border border-[oklch(0.72_0.22_35)]/35 py-2 text-xs font-semibold text-[oklch(0.82_0.2_35)] hover:bg-[oklch(0.72_0.22_35)]/25 transition"
          >
            <UserX className="h-3.5 w-3.5" /> Decline
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Deny Confirm Modal ───────────────────────────────────────────────────────

function DenyConfirmModal({
  participant,
  onConfirm,
  onCancel,
}: {
  participant: PendingParticipant;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/75 backdrop-blur-lg"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 24 }}
        transition={{ type: "spring", damping: 22, stiffness: 300 }}
        className="relative mx-4 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute -inset-1.5 rounded-[2rem] bg-gradient-to-br from-[oklch(0.72_0.22_35)] to-[oklch(0.65_0.22_280)] opacity-25 blur-2xl" />
        <div className="relative glass-strong rounded-3xl border border-white/10 p-8 text-center overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[oklch(0.72_0.22_35)] to-transparent" />
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[oklch(0.72_0.22_35)]/15 border border-[oklch(0.72_0.22_35)]/30"
          >
            <ShieldAlert className="h-8 w-8 text-[oklch(0.82_0.2_35)]" />
          </motion.div>
          <h2 className="text-xl font-bold mb-2">Decline admission?</h2>
          <p className="text-sm text-muted-foreground mb-1">Are you sure you don't want to let</p>
          <p className="text-base font-semibold text-[var(--neon-primary)] mb-1">
            {participant.username}
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            into the meeting? They'll be notified and disconnected from the lobby.
          </p>
          <div className="flex gap-3">
            <NeonButton variant="outline" onClick={onCancel} className="flex-1">
              Cancel
            </NeonButton>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onConfirm}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[oklch(0.65_0.25_25)] to-[oklch(0.72_0.22_35)] py-2.5 text-sm font-semibold text-white"
            >
              <UserX className="h-4 w-4" /> Yes, decline
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

// ─── Lobby Gate ───────────────────────────────────────────────────────────────

function LobbyGate({ username, onLeave }: { username: string; onLeave: () => void }) {
  const [dotCount, setDotCount] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setDotCount((n) => (n % 3) + 1), 600);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 relative z-10 overflow-hidden">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <motion.div
          className="absolute -top-32 -left-32 h-96 w-96 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, oklch(0.65 0.22 280), transparent 70%)" }}
          animate={{ scale: [1, 1.15, 1], x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, oklch(0.82 0.16 210), transparent 70%)" }}
          animate={{ scale: [1, 1.2, 1], x: [0, -20, 0], y: [0, 20, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 3 }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        className="relative mx-auto w-full max-w-md"
      >
        <div className="absolute -inset-2 rounded-[2.5rem] bg-gradient-to-br from-[var(--neon-primary)]/20 via-[var(--neon-accent)]/10 to-[var(--neon-secondary)]/20 blur-2xl" />
        <div className="relative glass-strong rounded-3xl border border-[var(--neon-primary)]/20 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-[var(--neon-primary)] via-[var(--neon-accent)] to-[var(--neon-secondary)]" />
          <div className="p-10 text-center">
            <div className="mx-auto mb-6 relative w-20 h-20">
              <motion.div
                className="absolute inset-0 rounded-2xl bg-[var(--neon-primary)]/10 border border-[var(--neon-primary)]/20"
                animate={{ scale: [1, 1.12, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="relative flex h-full w-full items-center justify-center">
                <DoorClosed className="h-9 w-9 text-[var(--neon-primary)]" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-gradient mb-1">Hi, {username}!</h2>
            <p className="text-base font-medium mb-1">You're in the lobby</p>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
              The host has been notified. Please wait while they review your request to join.
            </p>

            <div className="mb-8 flex items-center justify-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-5 py-3">
              <div className="flex gap-1 items-end">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-1.5 rounded-full bg-[var(--neon-secondary)]"
                    animate={{ height: ["6px", "14px", "6px"] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Waiting for host approval
                <span className="inline-block w-6 text-left">{".".repeat(dotCount)}</span>
              </p>
            </div>

            <div className="space-y-2.5 mb-8 text-left">
              {[
                {
                  icon: <BellRing className="h-4 w-4" />,
                  label: "Host notified",
                  done: true,
                  active: false,
                },
                {
                  icon: <Hourglass className="h-4 w-4" />,
                  label: "Waiting for permission",
                  done: false,
                  active: true,
                },
                {
                  icon: <DoorOpen className="h-4 w-4" />,
                  label: "Enter meeting",
                  done: false,
                  active: false,
                },
              ].map((step, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 border transition",
                    step.done
                      ? "border-[oklch(0.75_0.18_145)/0.3] bg-[oklch(0.75_0.18_145)/0.07] text-[oklch(0.85_0.15_145)]"
                      : step.active
                        ? "border-[var(--neon-primary)]/30 bg-[var(--neon-primary)]/7 text-[var(--neon-primary)]"
                        : "border-white/5 bg-white/3 text-muted-foreground/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      step.done
                        ? "bg-[oklch(0.75_0.18_145)/0.2]"
                        : step.active
                          ? "bg-[var(--neon-primary)]/15"
                          : "bg-white/5",
                    )}
                  >
                    {step.active ? (
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      >
                        {step.icon}
                      </motion.span>
                    ) : (
                      step.icon
                    )}
                  </span>
                  <span className="text-sm font-medium">{step.label}</span>
                  {step.done && (
                    <CheckCircle2 className="ml-auto h-4 w-4 text-[oklch(0.75_0.18_145)]" />
                  )}
                </div>
              ))}
            </div>

            <NeonButton variant="outline" onClick={onLeave} className="w-full">
              <PhoneOff className="h-4 w-4 mr-2" />
              Leave lobby
            </NeonButton>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Lobby Manager Panel ──────────────────────────────────────────────────────

function LobbyManagerPanel({
  pendingParticipants,
  onAdmit,
  onDeny,
  onClose,
}: {
  pendingParticipants: PendingParticipant[];
  onAdmit: (socketId: string) => void;
  onDeny: (p: PendingParticipant) => void;
  onClose: () => void;
}) {
  return (
    <motion.aside
      initial={{ x: 340 }}
      animate={{ x: 0 }}
      exit={{ x: 340 }}
      transition={{ type: "spring", damping: 26, stiffness: 250 }}
      className="absolute right-0 top-0 bottom-0 w-80 max-w-full glass-strong border-l border-white/10 overflow-y-auto z-10 flex flex-col"
    >
      <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <div className="relative">
            <DoorOpen className="h-4 w-4 text-[var(--neon-primary)]" />
            {pendingParticipants.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-[var(--neon-danger)] text-[8px] font-bold text-white flex items-center justify-center">
                {pendingParticipants.length}
              </span>
            )}
          </div>
          Lobby{" "}
          <span className="text-muted-foreground font-normal">
            ({pendingParticipants.length} waiting)
          </span>
        </h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {pendingParticipants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="h-16 w-16 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center"
            >
              <DoorClosed className="h-8 w-8 text-muted-foreground/40" />
            </motion.div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">Lobby is empty</p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                Participants will appear here when they knock
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingParticipants.map((p, i) => (
              <motion.div
                key={p.socketId}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ delay: i * 0.05 }}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/4"
              >
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--neon-primary)]/30 to-transparent" />
                <div className="p-3.5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="relative">
                      <div
                        className="absolute inset-0 rounded-full bg-[var(--neon-primary)]/20 animate-ping"
                        style={{ animationDuration: "2s" }}
                      />
                      <Avatar name={p.username} hue={hueForName(p.username)} size={36} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{p.username}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.8_0.18_80)] animate-pulse" />
                        <p className="text-[11px] text-muted-foreground">Waiting in lobby</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => onAdmit(p.socketId)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[var(--neon-primary)]/15 border border-[var(--neon-primary)]/30 py-2 text-xs font-semibold text-[var(--neon-primary)] hover:bg-[var(--neon-primary)]/25 transition"
                    >
                      <UserCheck className="h-3.5 w-3.5" /> Admit
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => onDeny(p)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[oklch(0.72_0.22_35)]/10 border border-[oklch(0.72_0.22_35)]/25 py-2 text-xs font-semibold text-[oklch(0.82_0.2_35)] hover:bg-[oklch(0.72_0.22_35)]/20 transition"
                    >
                      <UserX className="h-3.5 w-3.5" /> Decline
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {pendingParticipants.length > 0 && (
        <div className="p-4 border-t border-white/5 shrink-0">
          <div className="flex items-start gap-2 rounded-xl border border-[var(--neon-primary)]/15 bg-[var(--neon-primary)]/5 p-3">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--neon-primary)] shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Only host and co-hosts can manage lobby access.
            </p>
          </div>
        </div>
      )}
    </motion.aside>
  );
}

// ─── HostPermissionDialog (PATCH 3) ──────────────────────────────────────────
// Shown to the PARTICIPANT when the host requests their mic/cam be turned on.

function HostPermissionDialog({
  request,
  onAccept,
  onDecline,
}: {
  request: HostPermissionRequest;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const labelMap: Record<HostPermissionRequest["type"], string> = {
    mic: "microphone",
    cam: "camera",
    both: "microphone and camera",
  };
  const iconMap: Record<HostPermissionRequest["type"], React.ReactNode> = {
    mic: <Mic className="h-8 w-8 text-white" />,
    cam: <VideoIcon className="h-8 w-8 text-white" />,
    both: <Mic2 className="h-8 w-8 text-white" />,
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/75 backdrop-blur-lg"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 24 }}
        transition={{ type: "spring", damping: 22, stiffness: 300 }}
        className="relative mx-4 w-full max-w-sm"
      >
        <div className="absolute -inset-1.5 rounded-[2rem] bg-gradient-to-br from-[var(--neon-primary)]/30 to-[var(--neon-secondary)]/20 blur-2xl" />
        <div className="relative glass-strong rounded-3xl border border-white/10 p-8 text-center overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--neon-primary)] to-transparent" />

          {/* Pulsing icon */}
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--neon-primary)] to-[var(--neon-accent)] shadow-[0_0_40px_-8px_oklch(0.65_0.22_280/0.7)]"
          >
            {iconMap[request.type]}
          </motion.div>

          {/* Bell badge */}
          <div className="mb-3 flex items-center justify-center gap-2">
            <Bell className="h-3.5 w-3.5 text-[var(--neon-primary)] animate-pulse" />
            <span className="text-[11px] uppercase tracking-wider text-[var(--neon-primary)] font-semibold">
              Host request
            </span>
          </div>

          <h2 className="text-xl font-bold mb-2">Turn on your {labelMap[request.type]}?</h2>
          <p className="text-sm text-muted-foreground mb-1">
            <span className="font-semibold text-foreground">{request.hostUsername}</span> (host) is
            asking you to enable your {labelMap[request.type]}.
          </p>
          <p className="text-xs text-muted-foreground mb-7 leading-relaxed">
            You can decline and keep your current settings.
          </p>

          <div className="flex gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onDecline}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-white/10 transition"
            >
              <ThumbsDown className="h-4 w-4" /> Decline
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onAccept}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--neon-primary)] to-[var(--neon-accent)] py-2.5 text-sm font-semibold text-white shadow-[0_4px_20px_-4px_oklch(0.65_0.22_280/0.5)] hover:opacity-95 transition"
            >
              <ThumbsUp className="h-4 w-4" /> Accept
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

// ─── PermissionResponseToastLayer (PATCH 3) ───────────────────────────────────
// Shown to the HOST after a participant responds (accepted/declined) to their request.

function PermissionResponseToastLayer({
  toasts,
  onDismiss,
}: {
  toasts: PermissionResponseToast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-28 left-4 z-[9990] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <PermissionResponseToast key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function PermissionResponseToast({
  toast,
  onDismiss,
}: {
  toast: PermissionResponseToast;
  onDismiss: () => void;
}) {
  // Auto-dismiss after 5s
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const labelMap: Record<PermissionResponseToast["type"], string> = {
    mic: "mic",
    cam: "camera",
    both: "mic & camera",
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -60, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -60, scale: 0.9 }}
      transition={{ type: "spring", damping: 22, stiffness: 300 }}
      className={cn(
        "pointer-events-auto relative overflow-hidden rounded-2xl border backdrop-blur-xl shadow-xl w-72",
        toast.accepted
          ? "border-[oklch(0.75_0.18_145)/0.4] bg-[oklch(0.12_0.02_145/0.92)]"
          : "border-[oklch(0.72_0.22_35)/0.4] bg-[oklch(0.12_0.02_35/0.92)]",
      )}
    >
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-0.5",
          toast.accepted
            ? "bg-gradient-to-r from-transparent via-[oklch(0.75_0.18_145)] to-transparent"
            : "bg-gradient-to-r from-transparent via-[oklch(0.72_0.22_35)] to-transparent",
        )}
      />
      <div className="p-3.5 flex items-center gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            toast.accepted ? "bg-[oklch(0.75_0.18_145)/0.2]" : "bg-[oklch(0.72_0.22_35)/0.2]",
          )}
        >
          {toast.accepted ? (
            <ThumbsUp className="h-4 w-4 text-[oklch(0.85_0.15_145)]" />
          ) : (
            <ThumbsDown className="h-4 w-4 text-[oklch(0.82_0.2_35)]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{toast.fromUsername}</p>
          <p
            className={cn(
              "text-[11px]",
              toast.accepted ? "text-[oklch(0.85_0.15_145)]" : "text-[oklch(0.82_0.2_35)]",
            )}
          >
            {toast.accepted
              ? `turned on their ${labelMap[toast.type]}`
              : `declined to turn on ${labelMap[toast.type]}`}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground transition"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

function MeetingRoom() {
  const { id } = Route.useParams();
  const { scheduledFor } = Route.useSearch();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass-strong rounded-3xl p-8 text-center max-w-md">
          <h2 className="text-xl font-semibold">Please log in to join</h2>
          <Link to="/login" className="mt-4 inline-block">
            <NeonButton>Log in</NeonButton>
          </Link>
        </div>
      </div>
    );
  }

  if (scheduledFor && scheduledFor > now)
    return <CountdownScreen scheduledFor={scheduledFor} now={now} meetingId={id} />;

  return (
    <Room
      id={id}
      username={user.username}
      userId={user.id}
      user={user}
      onLeave={() => navigate({ to: "/dashboard" })}
    />
  );
}

// ─── Countdown Screen ─────────────────────────────────────────────────────────

function CountdownScreen({
  scheduledFor,
  now,
  meetingId,
}: {
  scheduledFor: number;
  now: number;
  meetingId: string;
}) {
  const navigate = useNavigate();
  const diff = Math.max(0, scheduledFor - now);

  useEffect(() => {
    if (diff === 0) navigate({ to: "/meeting/$id", params: { id: meetingId } });
  }, [diff, meetingId, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-strong rounded-3xl p-10 text-center max-w-md"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-neon animate-pulse-glow">
          <Hourglass className="h-8 w-8 text-white" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold">Meeting not started yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hang tight — we'll let you in automatically.
        </p>
        <div className="mt-6 flex justify-center gap-3 font-mono text-3xl">
          {[
            Math.floor(diff / 3_600_000),
            Math.floor(diff / 60_000) % 60,
            Math.floor(diff / 1000) % 60,
          ].map((v, i) => (
            <div key={i} className="glass rounded-xl px-4 py-3 min-w-[72px]">
              <div className="text-gradient">{String(v).padStart(2, "0")}</div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                {["hrs", "min", "sec"][i]}
              </div>
            </div>
          ))}
        </div>
        <Link
          to="/dashboard"
          className="mt-6 inline-block text-xs text-[var(--neon-secondary)] hover:underline"
        >
          Back to dashboard
        </Link>
      </motion.div>
    </main>
  );
}

// ─── Room ─────────────────────────────────────────────────────────────────────

function Room({
  id,
  username,
  userId,
  user,
  onLeave,
}: {
  id: string;
  username: string;
  userId: string;
  user: { email?: string; [key: string]: any };
  onLeave: () => void;
}) {
  const navigate = useNavigate();

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("grid");
  const [showSettings, setShowSettings] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [transferTarget, setTransferTarget] = useState<RemotePeer | null>(null);

  // ── Post-meeting modal state ──────────────────────────────────────────────
  const [meetingEndedInfo, setMeetingEndedInfo] = useState<{ hostUsername: string } | null>(null);
  const [showYouLeftModal, setShowYouLeftModal] = useState(false);

  // ── Lobby state ───────────────────────────────────────────────────────────
  const [toastQueue, setToastQueue] = useState<PendingParticipant[]>([]);
  const [denyTarget, setDenyTarget] = useState<PendingParticipant | null>(null);
  const dismissedToastsRef = useRef<Set<string>>(new Set());

  // ── PATCH 2: Permission state ─────────────────────────────────────────────
  const [permissionToasts, setPermissionToasts] = useState<PermissionResponseToast[]>([]);

  // ── Whiteboard state ──────────────────────────────────────────────────────
  const [wbTool, setWbTool] = useState<WhiteboardTool>("pen");
  const [wbColor, setWbColor] = useState(WB_COLORS[0]);
  const [wbWidth, setWbWidth] = useState(3);
  const [wbDrawing, setWbDrawing] = useState(false);
  const [wbPoints, setWbPoints] = useState<number[][]>([]);
  const [wbCurrentId, setWbCurrentId] = useState<string | null>(null);
  const [wbShapeStart, setWbShapeStart] = useState<{ x: number; y: number } | null>(null);
  const [wbPreview, setWbPreview] = useState<WhiteboardElement | null>(null);
  const [wbUndoStack, setWbUndoStack] = useState<WhiteboardElement[][]>([]);
  const [wbRedoStack, setWbRedoStack] = useState<WhiteboardElement[][]>([]);

  // ── Poll state ────────────────────────────────────────────────────────────
  const [pollQ, setPollQ] = useState("");
  const [pollOpts, setPollOpts] = useState(["", ""]);
  const [showPollNew, setShowPollNew] = useState(false);

  // ── Agenda state ──────────────────────────────────────────────────────────
  const [agendaIn, setAgendaIn] = useState([{ title: "", durationSec: 300 }]);
  const [showAgNew, setShowAgNew] = useState(false);
  const [agendaTick, setAgendaTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgendaTick(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // ── Recording modal state ─────────────────────────────────────────────────
  const [showRecordingOptions, setShowRecordingOptions] = useState(false);
  const [showRecordingLink, setShowRecordingLink] = useState(false);
  const [showRecordingLimit, setShowRecordingLimit] = useState(false);
  const [showRecordingWarning, setShowRecordingWarning] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const layoutBtnRef = useRef<HTMLButtonElement>(null);
  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const reactionBtnContainerRef = useRef<HTMLDivElement>(null);

  const {
    activeSoundscape,
    volume: soundVol,
    setVolume: setSoundVol,
    toggleSoundscape,
  } = useAmbientSound();

  // ── useWebRTC ─────────────────────────────────────────────────────────────
  // NOTE: socketRef is intentionally NOT destructured — the recording emit
  // path uses window.__luminaSocket instead (stale-closure crash fix).
  const webrtc = useWebRTC(
    id,
    username,
    SOCKET_URL,
    userId,
    (info) => setMeetingEndedInfo(info),
    () => setShowYouLeftModal(true),
  );

  const {
    localStream,
    localCameraStream,
    localSocketId,
    mic,
    cam,
    sharing,
    peers,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    leaveRoom,
    endMeetingForAll,
    muteAll,
    camOffAll,
    removePeer,
    isSpeaking,
    speakingPeerId,
    messages,
    typingPeers,
    sendChatMessage,
    sendChatReaction,
    setTyping,
    unreadCount,
    markRead,
    localStatus,
    setStatus,
    localHandRaised,
    raiseHand,
    lowerHand,
    lowerPeerHand,
    raisedHands,
    reactions,
    sendReaction,
    isHost,
    isSubHost,
    isWaiting,
    pendingParticipants,
    admitParticipant,
    rejectParticipant,
    transferHost,
    error,
    isConnecting,
    whiteboardElements,
    whiteboardCursors,
    drawWhiteboardElement,
    eraseWhiteboardElement,
    clearWhiteboard,
    syncWhiteboardElements,
    broadcastWhiteboardCursor,
    currentPoll,
    createPoll,
    votePoll,
    closePoll,
    dismissPoll,
    agenda,
    setAgenda,
    agendaNext,
    agendaPrev,
    agendaGoto,
    agendaTimerStart,
    agendaTimerPause,
    noiseSuppressionEnabled,
    noiseSuppressionSupported,
    toggleNoiseSuppression,
    backgroundMode,
    setBackgroundMode,
    isBlurProcessing,
    tilePositions,
    setTilePosition,
    cinemaMode,
    setCinemaMode,
    spotlightId,
    setSpotlightId,
    autoSpotlight,
    setAutoSpotlight,
    activeSpotlightId,
    lobbyKnockCount,
    clearLobbyKnockCount,
    // ── PATCH 1: new permission-management values ──────────────────────────
    requestMicOn,
    requestCamOn,
    requestMicCamOn,
    hostPermissionRequest,
    respondToPermissionRequest,
  } = webrtc;

  // ── RECORDING EMIT — crash-safe callback ──────────────────────────────────
  const recordingEmit = useCallback((event: string, payload: unknown) => {
    (window as any).__luminaSocket?.emit(event, payload);
  }, []);

  const {
    isRecording,
    recordingMode,
    recordingDurationSec,
    startRecording,
    stopRecording,
    uploadProgress,
    isUploading,
    lastRecording,
    error: recordingError,
  } = useRecording(id, localStream, recordingEmit, {
    onApproachingLimit: () => setShowRecordingWarning(true),
    onLimitExceeded: () => {
      setShowRecordingWarning(false);
      setShowRecordingLimit(true);
    },
  });

  // Auto-open link modal when upload starts or completes
  useEffect(() => {
    if (isUploading || lastRecording) setShowRecordingLink(true);
  }, [isUploading, lastRecording]);

  const canManage = isHost || isSubHost;
  const isCinema = layoutMode === "cinema";

  const recMM = Math.floor(recordingDurationSec / 60)
    .toString()
    .padStart(2, "0");
  const recSS = (recordingDurationSec % 60).toString().padStart(2, "0");

  const agendaTimeLeft = useMemo(() => {
    if (!agenda) return null;
    const item = agenda.items[agenda.activeIdx];
    if (!item || item.durationSec == null) return null;
    if (agenda.timerPaused || !agenda.timerEnd) return item.durationSec * 1000;
    return Math.max(0, agenda.timerEnd - agendaTick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda, agendaTick]);

  useEffect(() => {
    setCinemaMode(isCinema);
  }, [isCinema, setCinemaMode]);

  // Host-removed event
  useEffect(() => {
    const handler = () => leaveRoom();
    window.addEventListener("Lumina Meet:host-removed", handler);
    return () => window.removeEventListener("Lumina Meet:host-removed", handler);
  }, [leaveRoom]);

  // ── PATCH 2: Listen for permission responses from participants ────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { fromUsername, type, accepted } = (e as CustomEvent).detail;
      setPermissionToasts((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          fromUsername,
          type: type as "mic" | "cam" | "both",
          accepted,
        },
      ]);
    };
    window.addEventListener("LuminaMeet:permission-result", handler);
    return () => window.removeEventListener("LuminaMeet:permission-result", handler);
  }, []);

  // ── Lobby toast management ────────────────────────────────────────────────
  useEffect(() => {
    if (!canManage) return;
    pendingParticipants.forEach((p) => {
      if (dismissedToastsRef.current.has(p.socketId)) return;
      setToastQueue((prev) => (prev.some((t) => t.socketId === p.socketId) ? prev : [...prev, p]));
    });
    setToastQueue((prev) =>
      prev.filter((t) => pendingParticipants.some((p) => p.socketId === t.socketId)),
    );
  }, [pendingParticipants, canManage]);

  const dismissToast = useCallback((socketId: string) => {
    dismissedToastsRef.current.add(socketId);
    setToastQueue((prev) => prev.filter((t) => t.socketId !== socketId));
  }, []);

  const handleAdmitFromToast = useCallback(
    (socketId: string) => {
      admitParticipant(socketId);
      dismissToast(socketId);
    },
    [admitParticipant, dismissToast],
  );

  const handleDenyRequest = useCallback((p: PendingParticipant) => setDenyTarget(p), []);
  const handleDenyConfirm = useCallback(() => {
    if (!denyTarget) return;
    rejectParticipant(denyTarget.socketId);
    dismissToast(denyTarget.socketId);
    setDenyTarget(null);
  }, [denyTarget, rejectParticipant, dismissToast]);

  useEffect(() => {
    if (activePanel === "lobby") clearLobbyKnockCount();
  }, [activePanel, clearLobbyKnockCount]);

  // ── Whiteboard helpers ────────────────────────────────────────────────────
  const wbPushUndo = useCallback((snapshot: WhiteboardElement[]) => {
    setWbUndoStack((prev) => [...prev.slice(-49), [...snapshot]]);
    setWbRedoStack([]);
  }, []);

  const wbUndo = useCallback(() => {
    setWbUndoStack((prev) => {
      if (!prev.length) return prev;
      const stack = [...prev];
      const snapshot = stack.pop()!;
      setWbRedoStack((r) => [...r, [...whiteboardElements]]);
      syncWhiteboardElements(snapshot);
      return stack;
    });
  }, [whiteboardElements, syncWhiteboardElements]);

  const wbRedo = useCallback(() => {
    setWbRedoStack((prev) => {
      if (!prev.length) return prev;
      const stack = [...prev];
      const snapshot = stack.pop()!;
      setWbUndoStack((u) => [...u, [...whiteboardElements]]);
      syncWhiteboardElements(snapshot);
      return stack;
    });
  }, [whiteboardElements, syncWhiteboardElements]);

  useEffect(() => {
    if (activePanel !== "whiteboard") return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        wbUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        wbRedo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activePanel, wbUndo, wbRedo]);

  const svgCoords = (e: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * WB_SCALE,
      y: ((e.clientY - rect.top) / rect.height) * WB_SCALE,
    };
  };

  const handleWbPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (wbTool === "select" || wbTool === "eraser") return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const { x, y } = svgCoords(e);
      const id = `wb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setWbCurrentId(id);
      setWbDrawing(true);
      if (wbTool === "pen") setWbPoints([[x, y]]);
      else setWbShapeStart({ x, y });
    },
    [wbTool],
  );

  const handleWbPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const { x, y } = svgCoords(e);
      broadcastWhiteboardCursor(x / WB_SCALE, y / WB_SCALE);
      if (!wbDrawing || !wbCurrentId) return;
      if (wbTool === "pen") {
        setWbPoints((prev) => [...prev, [x, y]]);
      } else if (wbShapeStart) {
        const preview: WhiteboardElement = {
          id: wbCurrentId,
          type: wbTool as any,
          x: Math.min(wbShapeStart.x, x),
          y: Math.min(wbShapeStart.y, y),
          width: Math.abs(x - wbShapeStart.x),
          height: Math.abs(y - wbShapeStart.y),
          color: wbColor,
          strokeWidth: wbWidth,
          author: username,
          authorId: localSocketId ?? "",
        };
        if (wbTool === "arrow")
          preview.points = [
            [wbShapeStart.x, wbShapeStart.y],
            [x, y],
          ];
        setWbPreview(preview);
      }
    },
    [
      wbDrawing,
      wbTool,
      wbCurrentId,
      wbShapeStart,
      wbColor,
      wbWidth,
      username,
      localSocketId,
      broadcastWhiteboardCursor,
    ],
  );

  const handleWbPointerUp = useCallback(() => {
    if (!wbDrawing || !wbCurrentId) {
      setWbDrawing(false);
      setWbPoints([]);
      setWbCurrentId(null);
      setWbShapeStart(null);
      setWbPreview(null);
      return;
    }
    wbPushUndo(whiteboardElements);
    if (wbTool === "pen" && wbPoints.length >= 2) {
      drawWhiteboardElement({
        id: wbCurrentId,
        type: "stroke",
        points: wbPoints,
        color: wbColor,
        strokeWidth: wbWidth,
        author: username,
        authorId: localSocketId ?? "",
      });
    } else if (wbPreview) {
      drawWhiteboardElement(wbPreview);
    }
    setWbDrawing(false);
    setWbPoints([]);
    setWbCurrentId(null);
    setWbShapeStart(null);
    setWbPreview(null);
  }, [
    wbDrawing,
    wbTool,
    wbCurrentId,
    wbPoints,
    wbPreview,
    wbColor,
    wbWidth,
    username,
    localSocketId,
    drawWhiteboardElement,
    wbPushUndo,
    whiteboardElements,
  ]);

  const handleWbClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (wbTool !== "sticky" && wbTool !== "text") return;
      const { x, y } = svgCoords(e);
      wbPushUndo(whiteboardElements);
      drawWhiteboardElement({
        id: `wb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: wbTool === "sticky" ? "sticky" : "text",
        x,
        y,
        text: wbTool === "sticky" ? "Sticky note" : "Text",
        color: wbColor,
        author: username,
        authorId: localSocketId ?? "",
      });
    },
    [
      wbTool,
      wbColor,
      username,
      localSocketId,
      drawWhiteboardElement,
      wbPushUndo,
      whiteboardElements,
    ],
  );

  const handleEraseClick = useCallback(
    (elementId: string) => {
      wbPushUndo(whiteboardElements);
      eraseWhiteboardElement(elementId);
    },
    [eraseWhiteboardElement, wbPushUndo, whiteboardElements],
  );

  // ── Poll handlers ─────────────────────────────────────────────────────────
  const handleCreatePoll = useCallback(() => {
    const opts = pollOpts.filter((o) => o.trim());
    if (!pollQ.trim() || opts.length < 2) return;
    createPoll(pollQ.trim(), opts);
    setPollQ("");
    setPollOpts(["", ""]);
    setShowPollNew(false);
    if (activePanel !== "polls") setActivePanel("polls");
  }, [pollQ, pollOpts, createPoll, activePanel]);

  // ── Agenda handlers ───────────────────────────────────────────────────────
  const handleSetAgenda = useCallback(() => {
    const items = agendaIn.filter((i) => i.title.trim());
    if (!items.length) return;
    setAgenda(items);
    setShowAgNew(false);
    if (activePanel !== "agenda") setActivePanel("agenda");
  }, [agendaIn, setAgenda, activePanel]);

  // ── Leave / end ───────────────────────────────────────────────────────────
  const handleLeaveConfirm = useCallback(async () => {
    setShowLeaveModal(false);
    if (isHost) {
      endMeetingForAll();
      apiClient.post(`/meeting/${id}/end`).catch(() => {});
    } else {
      leaveRoom();
    }
  }, [isHost, id, endMeetingForAll, leaveRoom]);

  const handleTransfer = useCallback(
    (mode: "full" | "sub") => {
      if (transferTarget) transferHost(transferTarget.socketId, mode);
      setTransferTarget(null);
    },
    [transferTarget, transferHost],
  );

  const togglePanel = (panel: PanelType) => {
    setActivePanel((prev) => {
      if (prev === panel) return null;
      if (panel === "chat") markRead();
      if (panel === "lobby") clearLobbyKnockCount();
      return panel;
    });
  };

  const handleSendReaction = useCallback(
    (emoji: string) => {
      sendReaction(emoji);
      setReactionPickerOpen(false);
    },
    [sendReaction],
  );

  const handleCloseReactionPicker = useCallback(() => setReactionPickerOpen(false), []);

  // ── FIX 2: isWaiting guard BEFORE isConnecting ────────────────────────────
  if (isWaiting) {
    return (
      <LobbyGate
        username={username}
        onLeave={() => {
          leaveRoom();
          onLeave();
        }}
      />
    );
  }

  if (isConnecting) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="h-10 w-10 text-[var(--neon-primary)]" />
        </motion.div>
        <p className="text-sm text-muted-foreground">Connecting to room…</p>
      </div>
    );
  }

  if (error) {
    const isExpired =
      error.toLowerCase().includes("expired") ||
      error.toLowerCase().includes("passed") ||
      error.toLowerCase().includes("never started");

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative mx-auto w-full max-w-sm"
        >
          <div className="absolute -inset-2 rounded-[2rem] bg-gradient-to-br from-[oklch(0.72_0.22_35/0.3)] to-[oklch(0.65_0.22_280/0.15)] blur-2xl" />
          <div className="relative glass-strong rounded-3xl border border-white/10 p-10 text-center overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[oklch(0.72_0.22_35/0.8)] to-transparent" />
            <motion.div
              animate={isExpired ? {} : { scale: [1, 1.08, 1] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[oklch(0.72_0.22_35/0.12)] border border-[oklch(0.72_0.22_35/0.35)]"
            >
              {isExpired ? (
                <Hourglass className="h-8 w-8 text-[oklch(0.82_0.2_35)]" />
              ) : (
                <AlertTriangle className="h-8 w-8 text-[oklch(0.82_0.2_35)]" />
              )}
            </motion.div>
            <h2 className="text-xl font-bold mb-2">
              {isExpired ? "Meeting link expired" : "Unable to join"}
            </h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed max-w-xs mx-auto">
              {isExpired
                ? "This scheduled meeting's time window has passed. The link is no longer valid."
                : error}
            </p>
            {isExpired && (
              <div className="mb-6 rounded-2xl border border-[oklch(0.72_0.22_35/0.2)] bg-[oklch(0.72_0.22_35/0.06)] px-4 py-3 text-xs text-[oklch(0.82_0.2_35)/0.8] text-left">
                To start a new meeting, use the{" "}
                <span className="font-semibold text-[oklch(0.82_0.2_35)]">Instant meeting</span>{" "}
                button on your dashboard, or schedule a new one.
              </div>
            )}
            <NeonButton variant="outline" onClick={onLeave} className="w-full">
              Back to dashboard
            </NeonButton>
          </div>
        </motion.div>
      </div>
    );
  }

  const effectiveLobbyBadge =
    canManage && lobbyKnockCount > 0 && activePanel !== "lobby" ? lobbyKnockCount : 0;

  const headerPanelButtons = [
    ["chat", <MessageSquare className="h-4 w-4" />, unreadCount],
    ["whiteboard", <PenLine className="h-4 w-4" />, 0],
    ["polls", <BarChart2 className="h-4 w-4" />, 0],
    ["agenda", <ListChecks className="h-4 w-4" />, 0],
    ["participants", <Users className="h-4 w-4" />, 0],
    ...(canManage ? [["lobby", <DoorOpen className="h-4 w-4" />, effectiveLobbyBadge]] : []),
  ] as const;

  return (
    <div className="flex min-h-screen flex-col overflow-hidden" style={{ background: "#0B0F19" }}>
      {/* Ambient orbs */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <motion.div
          className="absolute -top-32 -left-32 h-96 w-96 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, oklch(0.65 0.22 280), transparent 70%)" }}
          animate={{ scale: [1, 1.15, 1], x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, oklch(0.82 0.16 210), transparent 70%)" }}
          animate={{ scale: [1, 1.2, 1], x: [0, -20, 0], y: [0, 20, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 3 }}
        />
      </div>

      {/* Lobby knock toasts */}
      <AnimatePresence>
        {canManage && toastQueue.length > 0 && (
          <div className="fixed top-20 right-4 z-[9990] flex flex-col gap-3 pointer-events-none">
            {toastQueue.slice(0, 3).map((p) => (
              <div key={p.socketId} className="pointer-events-auto">
                <LobbyKnockToast
                  participant={p}
                  onAdmit={() => handleAdmitFromToast(p.socketId)}
                  onDeny={() => handleDenyRequest(p)}
                  onDismiss={() => dismissToast(p.socketId)}
                />
              </div>
            ))}
            {toastQueue.length > 3 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="pointer-events-auto glass-strong rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground text-center"
              >
                +{toastQueue.length - 3} more →{" "}
                <button
                  onClick={() => togglePanel("lobby")}
                  className="text-[var(--neon-primary)] hover:underline"
                >
                  Open lobby
                </button>
              </motion.div>
            )}
          </div>
        )}
      </AnimatePresence>

      {/* Deny confirm modal */}
      <AnimatePresence>
        {denyTarget && (
          <DenyConfirmModal
            participant={denyTarget}
            onConfirm={handleDenyConfirm}
            onCancel={() => setDenyTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* Cinema exit FAB */}
      <AnimatePresence>
        {isCinema && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => setLayoutMode("grid")}
            className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-2xl border border-white/20 bg-black/70 backdrop-blur-xl px-4 py-2.5 text-sm font-medium text-white hover:bg-black/90 hover:border-white/40 transition shadow-xl"
          >
            <Minimize2 className="h-4 w-4" /> Exit cinema
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {!isCinema && (
          <motion.header
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            className="relative z-10 flex items-center justify-between border-b border-white/5 bg-black/40 backdrop-blur-xl px-4 py-3 sm:px-6 gap-2"
          >
            {/* Left — brand */}
            <div className="flex items-center gap-3 min-w-0 shrink-0">
              <div className="h-7 w-7 shrink-0 rounded-lg bg-gradient-neon animate-pulse-glow" />
              <div className="min-w-0 hidden sm:block">
                <p className="truncate text-sm font-semibold">Lumina Meet</p>
                <p className="truncate text-[11px] text-muted-foreground font-mono">{id}</p>
              </div>
            </div>

            {/* Center — contextual chips */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              <AnimatePresence>
                {raisedHands.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="hidden md:flex items-center gap-2 rounded-full border border-[oklch(0.8_0.18_80)/0.4] bg-[oklch(0.8_0.18_80)/0.08] px-3 py-1.5 text-xs text-[oklch(0.9_0.18_80)] shrink-0"
                  >
                    <motion.span
                      animate={{ rotate: [0, 15, -10, 15, 0] }}
                      transition={{ duration: 1, repeat: Infinity, repeatDelay: 2 }}
                    >
                      ✋
                    </motion.span>
                    <span className="font-medium">{raisedHands[0].username}</span>
                    {raisedHands.length > 1 && (
                      <span className="text-muted-foreground">+{raisedHands.length - 1}</span>
                    )}
                  </motion.div>
                )}
                {activeSoundscape && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={() => setShowSettings(true)}
                    className="hidden sm:flex items-center gap-1.5 rounded-full border border-[oklch(0.8_0.18_80)/0.4] bg-[oklch(0.8_0.18_80)/0.1] px-2.5 py-1 text-[11px] text-[oklch(0.9_0.18_80)] shrink-0"
                  >
                    <Music2 className="h-3 w-3" />
                    <span>{SOUNDSCAPES.find((s) => s.id === activeSoundscape)?.label}</span>
                  </motion.button>
                )}
                {isRecording && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="hidden sm:flex items-center gap-1.5 rounded-full border border-[oklch(0.72_0.22_35)/0.6] bg-[oklch(0.72_0.22_35)/0.15] px-2.5 py-1 text-[11px] text-[oklch(0.82_0.2_35)] animate-pulse-danger shrink-0"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.72_0.22_35)] animate-pulse" />
                    <span className="font-semibold">
                      REC {recMM}:{recSS}
                    </span>
                  </motion.div>
                )}
                {currentPoll && !currentPoll.closed && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={() => togglePanel("polls")}
                    className="hidden sm:flex items-center gap-1.5 rounded-full border border-[var(--neon-secondary)]/40 bg-[var(--neon-secondary)]/10 px-2.5 py-1 text-[11px] text-[var(--neon-secondary)] animate-pulse-glow shrink-0"
                  >
                    <BarChart2 className="h-3 w-3" /> <span>Live poll</span>
                  </motion.button>
                )}
                {canManage && pendingParticipants.length > 0 && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={() => togglePanel("lobby")}
                    className="hidden sm:flex items-center gap-1.5 rounded-full border border-[oklch(0.8_0.18_80)/0.5] bg-[oklch(0.8_0.18_80)/0.12] px-2.5 py-1 text-[11px] text-[oklch(0.9_0.18_80)] animate-pulse-glow shrink-0"
                  >
                    <motion.span
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    >
                      🔔
                    </motion.span>
                    <span>{pendingParticipants.length} in lobby</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Right — status, badges, panel toggles, layout */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Status picker */}
              <button
                ref={statusBtnRef}
                onClick={() => setShowStatusPicker((v) => !v)}
                className={cn(
                  "hidden sm:flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition",
                  localStatus === "presenting"
                    ? "border-[oklch(0.65_0.22_280)/0.6] bg-[oklch(0.65_0.22_280)/0.15] text-[oklch(0.8_0.18_280)] animate-pulse-glow"
                    : "border-white/10 bg-white/5 hover:bg-white/10",
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{
                    background: STATUS_CONFIG[localStatus].color,
                    boxShadow: `0 0 6px ${STATUS_CONFIG[localStatus].color}`,
                  }}
                />
                <span className="font-medium">{STATUS_CONFIG[localStatus].label}</span>
                <ChevronDown
                  className={cn(
                    "h-2.5 w-2.5 text-muted-foreground transition-transform",
                    showStatusPicker && "rotate-180",
                  )}
                />
              </button>

              <PortalDropdown
                anchorRef={statusBtnRef as React.RefObject<HTMLElement>}
                open={showStatusPicker}
                onClose={() => setShowStatusPicker(false)}
                align="right"
              >
                <div className="glass-strong rounded-2xl border border-white/10 p-1.5 shadow-2xl backdrop-blur-xl w-52">
                  <p className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold">
                    Set status
                  </p>
                  {localStatus === "presenting" && (
                    <div className="mx-1.5 mb-1.5 flex items-start gap-2 rounded-xl border border-[oklch(0.65_0.22_280)/0.35] bg-[oklch(0.65_0.22_280)/0.1] px-3 py-2">
                      <Presentation className="h-3 w-3 mt-0.5 shrink-0 text-[oklch(0.75_0.18_280)]" />
                      <p className="text-[11px] text-[oklch(0.8_0.15_280)] leading-snug">
                        Applies when sharing stops.
                      </p>
                    </div>
                  )}
                  {MANUAL_STATUSES.map((key) => {
                    const cfg = STATUS_CONFIG[key];
                    const isActive = localStatus !== "presenting" && localStatus === key;
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          setStatus(key);
                          setShowStatusPicker(false);
                        }}
                        className={cn(
                          "flex items-center gap-2.5 w-full rounded-xl px-3 py-2 text-sm text-left transition",
                          isActive ? "bg-white/10" : "hover:bg-white/5",
                        )}
                      >
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }}
                        />
                        <span className="flex-1">{cfg.label}</span>
                        {isActive && (
                          <CheckCircle2 className="h-3 w-3 text-[var(--neon-primary)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </PortalDropdown>

              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[var(--neon-secondary)]/30 bg-[var(--neon-secondary)]/10 px-2.5 py-1 text-[11px] text-[var(--neon-secondary)]">
                <ShieldCheck className="h-3 w-3" /> Encrypted
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {peers.length + 1} live
              </span>

              {/* Panel toggle buttons */}
              {headerPanelButtons.map(([panel, icon, badge]) => (
                <button
                  key={panel as string}
                  onClick={() => togglePanel(panel as PanelType)}
                  title={String(panel)}
                  className={cn(
                    "relative rounded-lg border p-2 transition",
                    activePanel === panel
                      ? "border-[var(--neon-primary)]/50 bg-[var(--neon-primary)]/15 text-[var(--neon-primary)]"
                      : panel === "lobby" && pendingParticipants.length > 0
                        ? "border-[oklch(0.8_0.18_80)/0.5] bg-[oklch(0.8_0.18_80)/0.1] text-[oklch(0.9_0.18_80)] animate-pulse-glow"
                        : "border-white/10 bg-white/5 hover:bg-white/10",
                  )}
                >
                  {icon}
                  {(badge as number) > 0 && activePanel !== panel && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--neon-danger)] text-[9px] font-bold text-white">
                      {(badge as number) > 9 ? "9+" : badge}
                    </span>
                  )}
                </button>
              ))}

              {/* Layout / settings dropdown */}
              <div className="relative">
                <button
                  ref={layoutBtnRef}
                  onClick={() => setShowSettings((v) => !v)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2 py-2 sm:px-3 transition",
                    showSettings
                      ? "border-[var(--neon-primary)]/50 bg-[var(--neon-primary)]/15 text-[var(--neon-primary)]"
                      : "border-white/10 bg-white/5 hover:bg-white/10",
                  )}
                >
                  <Layers className="h-4 w-4" />
                  <span className="hidden sm:inline text-xs font-medium">Layout</span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 text-muted-foreground transition-transform hidden sm:block",
                      showSettings && "rotate-180",
                    )}
                  />
                </button>
                <PortalDropdown
                  anchorRef={layoutBtnRef as React.RefObject<HTMLElement>}
                  open={showSettings}
                  onClose={() => setShowSettings(false)}
                  align="right"
                >
                  <SettingsMenu
                    layoutMode={layoutMode}
                    setLayoutMode={(m) => {
                      setLayoutMode(m);
                      setShowSettings(false);
                    }}
                    backgroundMode={backgroundMode}
                    setBackgroundMode={setBackgroundMode}
                    isBlurProcessing={isBlurProcessing}
                    activeSoundscape={activeSoundscape}
                    toggleSoundscape={toggleSoundscape}
                    soundVolume={soundVol}
                    setSoundVolume={setSoundVol}
                    noiseSuppressionEnabled={noiseSuppressionEnabled}
                    noiseSuppressionSupported={noiseSuppressionSupported}
                    toggleNoiseSuppression={toggleNoiseSuppression}
                    autoSpotlight={autoSpotlight}
                    setAutoSpotlight={setAutoSpotlight}
                  />
                </PortalDropdown>
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        <main className={cn("flex-1 overflow-hidden min-w-0", isCinema ? "p-0" : "p-3 sm:p-4")}>
          <AnimatePresence>
            {activePanel === "whiteboard" && (
              <WhiteboardOverlay
                elements={whiteboardElements}
                cursors={whiteboardCursors}
                preview={wbPreview}
                activeTool={wbTool}
                activeColor={wbColor}
                strokeWidth={wbWidth}
                currentPoints={wbPoints}
                canManage={canManage}
                undoAvailable={wbUndoStack.length > 0}
                redoAvailable={wbRedoStack.length > 0}
                onToolChange={setWbTool}
                onColorChange={setWbColor}
                onStrokeWidthChange={setWbWidth}
                onPointerDown={handleWbPointerDown}
                onPointerMove={handleWbPointerMove}
                onPointerUp={handleWbPointerUp}
                onClick={handleWbClick}
                onErase={handleEraseClick}
                onClear={() => {
                  wbPushUndo(whiteboardElements);
                  clearWhiteboard();
                }}
                onUndo={wbUndo}
                onRedo={wbRedo}
                onClose={() => setActivePanel(null)}
              />
            )}
          </AnimatePresence>

          {sharing ? (
            <ScreenShareView
              localStream={localStream}
              localCameraStream={localCameraStream}
              peers={peers}
              username={username}
              mic={mic}
              cam={cam}
              isSpeaking={isSpeaking}
              speakingPeerId={speakingPeerId}
            />
          ) : layoutMode === "spatial" ? (
            <SpatialCanvas
              localStream={localStream}
              localSocketId={localSocketId}
              username={username}
              mic={mic}
              cam={cam}
              localStatus={localStatus}
              localHandRaised={localHandRaised}
              isHost={isHost}
              isSubHost={isSubHost}
              peers={peers}
              onRemove={removePeer}
              onLowerHand={lowerPeerHand}
              isSpeaking={isSpeaking}
              speakingPeerId={speakingPeerId}
              tilePositions={tilePositions}
              setTilePosition={setTilePosition}
              spotlightId={spotlightId}
              setSpotlightId={setSpotlightId}
            />
          ) : (
            <VideoGrid
              localStream={localStream}
              localSocketId={localSocketId}
              username={username}
              mic={mic}
              cam={cam}
              localStatus={localStatus}
              localHandRaised={localHandRaised}
              isHost={isHost}
              isSubHost={isSubHost}
              peers={peers}
              onRemove={removePeer}
              onLowerHand={lowerPeerHand}
              isSpeaking={isSpeaking}
              speakingPeerId={speakingPeerId}
              cinemaMode={isCinema}
              activeSpotlightId={activeSpotlightId}
              spotlightId={spotlightId}
              setSpotlightId={setSpotlightId}
            />
          )}
        </main>

        {/* ── Side panels ─────────────────────────────────────────────────── */}
        <AnimatePresence>
          {activePanel === "participants" && (
            <ParticipantsPanel
              username={username}
              localStatus={localStatus}
              localHandRaised={localHandRaised}
              mic={mic}
              cam={cam}
              isHost={isHost}
              isSubHost={isSubHost}
              peers={peers}
              raisedHands={raisedHands}
              onLowerHand={lowerPeerHand}
              onRemove={removePeer}
              onMuteAll={muteAll}
              onCamOffAll={camOffAll}
              onTransferHost={setTransferTarget}
              onRequestMicOn={requestMicOn}
              onRequestCamOn={requestCamOn}
              onClose={() => setActivePanel(null)}
            />
          )}
          {activePanel === "chat" && (
            <ChatPanel
              localSocketId={localSocketId}
              username={username}
              messages={messages}
              typingPeers={typingPeers}
              peers={peers}
              onSend={sendChatMessage}
              onReact={sendChatReaction}
              onTyping={setTyping}
              onClose={() => setActivePanel(null)}
            />
          )}
          {activePanel === "polls" && (
            <PollsPanel
              currentPoll={currentPoll}
              isHost={canManage}
              showCreator={showPollNew}
              pollQuestion={pollQ}
              pollOptions={pollOpts}
              onQuestionChange={setPollQ}
              onOptionsChange={setPollOpts}
              onShowCreator={() => setShowPollNew(true)}
              onHideCreator={() => setShowPollNew(false)}
              onCreate={handleCreatePoll}
              onVote={votePoll}
              onClosePoll={closePoll}
              onDismiss={dismissPoll}
              onClose={() => setActivePanel(null)}
            />
          )}
          {activePanel === "agenda" && (
            <AgendaPanel
              agenda={agenda}
              agendaTimeLeft={agendaTimeLeft}
              isHost={canManage}
              showCreator={showAgNew}
              agendaInput={agendaIn}
              onAgendaInputChange={setAgendaIn}
              onShowCreator={() => setShowAgNew(true)}
              onHideCreator={() => setShowAgNew(false)}
              onCreate={handleSetAgenda}
              onNext={agendaNext}
              onPrev={agendaPrev}
              onGoto={agendaGoto}
              onTimerStart={agendaTimerStart}
              onTimerPause={agendaTimerPause}
              onClose={() => setActivePanel(null)}
            />
          )}
          {activePanel === "lobby" && canManage && (
            <LobbyManagerPanel
              pendingParticipants={pendingParticipants}
              onAdmit={admitParticipant}
              onDeny={handleDenyRequest}
              onClose={() => setActivePanel(null)}
            />
          )}
        </AnimatePresence>
      </div>

      <ReactionBurstLayer reactions={reactions} />

      {/* Speaking banner */}
      <AnimatePresence>
        {!isCinema && (isSpeaking || speakingPeerId) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-[88px] left-1/2 -translate-x-1/2 z-20 pointer-events-none"
          >
            <div className="flex items-center gap-2 rounded-full bg-black/70 backdrop-blur border border-[var(--neon-secondary)]/30 px-4 py-1.5 text-xs text-[var(--neon-secondary)]">
              <AudioBars color="var(--neon-secondary)" />
              <span className="font-medium">
                {isSpeaking
                  ? `${username} is speaking`
                  : `${peers.find((p) => p.socketId === speakingPeerId)?.username ?? "Someone"} is speaking`}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hand raised toast */}
      <AnimatePresence>
        {localHandRaised && (
          <motion.div
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60 }}
            className="absolute top-20 right-4 z-30 flex items-center gap-2 rounded-2xl border border-[oklch(0.8_0.18_80)/0.4] bg-black/70 backdrop-blur px-4 py-2 text-sm text-[oklch(0.9_0.18_80)]"
          >
            <motion.span
              animate={{ rotate: [0, 20, -10, 20, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1.5 }}
            >
              ✋
            </motion.span>
            <span>Hand raised</span>
            <button
              onClick={lowerHand}
              className="ml-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Footer controls ───────────────────────────────────────────────── */}
      <motion.footer
        animate={isCinema ? { y: 72, opacity: 0 } : { y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="relative z-10 border-t border-white/5 bg-black/50 backdrop-blur-xl px-2 py-3 sm:px-4"
        onMouseEnter={
          isCinema
            ? (e) => {
                (e.currentTarget as HTMLElement).style.cssText =
                  "transform:translateY(0);opacity:1";
              }
            : undefined
        }
        onMouseLeave={
          isCinema
            ? (e) => {
                (e.currentTarget as HTMLElement).style.cssText = "";
              }
            : undefined
        }
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
          {/* Left controls */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <ControlBtn
              active={!localHandRaised}
              onClick={localHandRaised ? lowerHand : raiseHand}
              on={<Hand className="h-4 w-4 sm:h-5 sm:w-5" />}
              off={<Hand className="h-4 w-4 sm:h-5 sm:w-5" />}
              label={localHandRaised ? "Lower" : "Raise hand"}
              highlightOn={localHandRaised}
              highlightColor="oklch(0.8 0.18 80)"
            />
            <div ref={reactionBtnContainerRef} className="relative">
              <ControlBtn
                active={true}
                onClick={() => setReactionPickerOpen((v) => !v)}
                on={<SmilePlus className="h-4 w-4 sm:h-5 sm:w-5" />}
                off={<SmilePlus className="h-4 w-4 sm:h-5 sm:w-5" />}
                label="React"
                highlightOn={reactionPickerOpen}
              />
            </div>
            <ReactionPickerPortal
              anchorRef={reactionBtnContainerRef as React.RefObject<HTMLElement>}
              open={reactionPickerOpen}
              onClose={handleCloseReactionPicker}
              onReact={handleSendReaction}
            />
            <ControlBtn
              active={activePanel !== "whiteboard"}
              onClick={() => togglePanel("whiteboard")}
              on={<PenLine className="h-4 w-4 sm:h-5 sm:w-5" />}
              off={<PenLine className="h-4 w-4 sm:h-5 sm:w-5" />}
              label="Whiteboard"
              highlightOn={activePanel === "whiteboard"}
            />
          </div>

          {/* Center controls */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <ControlBtn
              active={mic}
              onClick={toggleMic}
              on={<Mic className="h-4 w-4 sm:h-5 sm:w-5" />}
              off={<MicOff className="h-4 w-4 sm:h-5 sm:w-5" />}
              label={mic ? "Mute" : "Unmute"}
            />
            <ControlBtn
              active={cam}
              onClick={() => void toggleCam()}
              on={<VideoIcon className="h-4 w-4 sm:h-5 sm:w-5" />}
              off={<VideoOff className="h-4 w-4 sm:h-5 sm:w-5" />}
              label={cam ? "Stop video" : "Start video"}
            />
            <ControlBtn
              active={!sharing}
              onClick={() => void toggleScreenShare()}
              on={<MonitorUp className="h-4 w-4 sm:h-5 sm:w-5" />}
              off={<MonitorX className="h-4 w-4 sm:h-5 sm:w-5" />}
              label={sharing ? "Stop share" : "Share screen"}
              highlightOn={sharing}
            />
            <button
              onClick={() => setShowLeaveModal(true)}
              className="flex items-center gap-1.5 sm:gap-2 rounded-2xl bg-gradient-to-r from-[oklch(0.65_0.25_25)] to-[oklch(0.72_0.22_35)] px-3 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold text-white shadow-[0_8px_30px_-8px_oklch(0.72_0.22_35/0.6)] hover:opacity-95 transition shrink-0"
            >
              <PhoneOff className="h-4 w-4" />
              <span className="hidden sm:inline">Leave</span>
            </button>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <ControlBtn
              active={layoutMode !== "cinema"}
              onClick={() => setLayoutMode((p) => (p === "cinema" ? "grid" : "cinema"))}
              on={<Maximize2 className="h-4 w-4 sm:h-5 sm:w-5" />}
              off={<Minimize2 className="h-4 w-4 sm:h-5 sm:w-5" />}
              label={layoutMode === "cinema" ? "Exit cinema" : "Cinema"}
              highlightOn={layoutMode === "cinema"}
            />
            {noiseSuppressionSupported && (
              <ControlBtn
                active={!noiseSuppressionEnabled}
                onClick={() => void toggleNoiseSuppression()}
                on={<Mic2 className="h-4 w-4 sm:h-5 sm:w-5" />}
                off={<Mic2 className="h-4 w-4 sm:h-5 sm:w-5" />}
                label={noiseSuppressionEnabled ? "Noise ON" : "Noise OFF"}
                highlightOn={noiseSuppressionEnabled}
                highlightColor="oklch(0.75 0.18 145)"
              />
            )}
            <ControlBtn
              active={!activeSoundscape}
              onClick={() => {
                if (activeSoundscape) toggleSoundscape(null);
                else setShowSettings(true);
              }}
              on={<Music2 className="h-4 w-4 sm:h-5 sm:w-5" />}
              off={<Music2 className="h-4 w-4 sm:h-5 sm:w-5" />}
              label={
                activeSoundscape
                  ? `Stop ${SOUNDSCAPES.find((s) => s.id === activeSoundscape)?.label ?? ""}`
                  : "Soundscapes"
              }
              highlightOn={!!activeSoundscape}
              highlightColor="oklch(0.8 0.18 80)"
            />

            {/* Recording button — host and co-host only */}
            {canManage &&
              (isRecording ? (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={stopRecording}
                  title="Stop recording"
                  className="relative flex h-10 w-10 sm:h-12 sm:w-auto sm:px-4 items-center justify-center gap-2 rounded-2xl border border-[oklch(0.72_0.22_35)/0.6] bg-[oklch(0.72_0.22_35)/0.2] text-[oklch(0.82_0.2_35)] animate-pulse-danger shrink-0 transition"
                >
                  <StopCircle className="h-4 w-4 sm:h-5 sm:w-5 fill-[oklch(0.82_0.2_35)]" />
                  <span className="hidden sm:inline text-xs font-semibold tabular-nums">
                    {recMM}:{recSS}
                  </span>
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[oklch(0.72_0.22_35)] sm:hidden animate-pulse" />
                </motion.button>
              ) : (
                <ControlBtn
                  active={true}
                  onClick={() => setShowRecordingOptions(true)}
                  on={<CircleDot className="h-4 w-4 sm:h-5 sm:w-5" />}
                  off={<CircleDot className="h-4 w-4 sm:h-5 sm:w-5" />}
                  label="Record"
                />
              ))}
          </div>
        </div>
      </motion.footer>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showLeaveModal && (
          <LeaveModal
            isHost={isHost}
            onConfirm={handleLeaveConfirm}
            onCancel={() => setShowLeaveModal(false)}
          />
        )}
        {transferTarget && (
          <HostTransferModal
            peer={transferTarget}
            onTransfer={handleTransfer}
            onClose={() => setTransferTarget(null)}
          />
        )}
        {meetingEndedInfo && username === meetingEndedInfo.hostUsername && (
          <MeetingEndedByYouModal
            onDismiss={() => {
              setMeetingEndedInfo(null);
              onLeave();
            }}
          />
        )}
        {meetingEndedInfo && username !== meetingEndedInfo.hostUsername && (
          <MeetingEndedByHostModal
            hostUsername={meetingEndedInfo.hostUsername}
            onDismiss={() => {
              setMeetingEndedInfo(null);
              onLeave();
            }}
          />
        )}
        {showYouLeftModal && (
          <YouLeftModal
            onDismiss={() => {
              setShowYouLeftModal(false);
              onLeave();
            }}
            onRejoin={() => {
              setShowYouLeftModal(false);
              navigate({ to: `/meeting/${id}` });
            }}
          />
        )}
        {showRecordingOptions && (
          <RecordingOptionsModal
            open={showRecordingOptions}
            onClose={() => setShowRecordingOptions(false)}
            onStart={async (mode) => {
              setShowRecordingOptions(false);
              await startRecording(mode);
            }}
            isSharing={sharing}
          />
        )}
        {showRecordingLink && (
          <RecordingLinkModal
            open={showRecordingLink}
            onClose={() => {
              if (!isUploading) setShowRecordingLink(false);
            }}
            mode={recordingMode ?? "screen_voice"}
            durationSec={recordingDurationSec || lastRecording?.durationSec || 0}
            uploadProgress={uploadProgress}
            isUploading={isUploading}
            recording={lastRecording}
            error={recordingError}
            userEmail={user?.email ?? ""}
          />
        )}
        {showRecordingLimit && (
          <RecordingLimitModal
            open={showRecordingLimit}
            onClose={() => setShowRecordingLimit(false)}
            recordingMode={recordingMode ?? "screen_voice"}
          />
        )}

        {/* ── PATCH 3: Host permission request dialog (participant view) ── */}
        {hostPermissionRequest && (
          <HostPermissionDialog
            request={hostPermissionRequest}
            onAccept={() => respondToPermissionRequest(true)}
            onDecline={() => respondToPermissionRequest(false)}
          />
        )}
      </AnimatePresence>

      {/* Recording 1-minute warning banner */}
      {canManage && (
        <RecordingWarningBanner
          show={showRecordingWarning}
          onDismiss={() => setShowRecordingWarning(false)}
        />
      )}

      {/* ── PATCH 3: Permission response toasts (host view) ─────────────── */}
      <PermissionResponseToastLayer
        toasts={permissionToasts}
        onDismiss={(id) => setPermissionToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}

// ─── Settings Menu ────────────────────────────────────────────────────────────

function SettingsMenu({
  layoutMode,
  setLayoutMode,
  backgroundMode,
  setBackgroundMode,
  isBlurProcessing,
  activeSoundscape,
  toggleSoundscape,
  soundVolume,
  setSoundVolume,
  noiseSuppressionEnabled,
  noiseSuppressionSupported,
  toggleNoiseSuppression,
  autoSpotlight,
  setAutoSpotlight,
}: {
  layoutMode: LayoutMode;
  setLayoutMode: (m: LayoutMode) => void;
  backgroundMode: string;
  setBackgroundMode: (m: any) => void;
  isBlurProcessing: boolean;
  activeSoundscape: SoundscapeId;
  toggleSoundscape: (id: SoundscapeId) => void;
  soundVolume: number;
  setSoundVolume: (v: number) => void;
  noiseSuppressionEnabled: boolean;
  noiseSuppressionSupported: boolean;
  toggleNoiseSuppression: () => Promise<void>;
  autoSpotlight: boolean;
  setAutoSpotlight: (v: boolean) => void;
}) {
  const BACKGROUNDS = [
    { id: "none", label: "None", cls: "bg-white/5" },
    { id: "blur", label: "Blur", cls: "bg-[oklch(0.82_0.16_210/0.2)]" },
    { id: "gradient-purple", label: "Purple", cls: "bg-[oklch(0.35_0.18_280)]" },
    { id: "gradient-teal", label: "Teal", cls: "bg-[oklch(0.35_0.15_200)]" },
    { id: "gradient-dark", label: "Dark", cls: "bg-[oklch(0.12_0.02_265)]" },
  ] as const;

  return (
    <div className="glass-strong rounded-2xl border border-white/10 p-3 shadow-2xl space-y-4 w-72">
      <div>
        <p className="px-1 pb-2 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold">
          Layout
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {(["grid", "spatial", "cinema"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setLayoutMode(m)}
              className={cn(
                "rounded-xl py-2 text-xs font-medium capitalize transition border",
                layoutMode === m
                  ? "bg-[var(--neon-primary)]/20 border-[var(--neon-primary)]/50 text-[var(--neon-primary)]"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="px-1 pb-2 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold flex items-center gap-1.5">
          Virtual background{" "}
          {isBlurProcessing && (
            <Loader2 className="h-3 w-3 animate-spin text-[var(--neon-primary)]" />
          )}
        </p>
        <div className="flex gap-1.5 flex-wrap">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.id}
              onClick={() => setBackgroundMode(b.id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl p-2 border transition text-xs",
                backgroundMode === b.id
                  ? "border-[var(--neon-primary)]/50 bg-[var(--neon-primary)]/15 text-[var(--neon-primary)]"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10",
              )}
            >
              <div className={cn("h-8 w-12 rounded-lg border border-white/10", b.cls)} />
              <span>{b.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="px-1 pb-2 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold">
          Ambient sound
        </p>
        <div className="flex gap-1.5 mb-2">
          {SOUNDSCAPES.map((s) => (
            <button
              key={s.id}
              onClick={() => toggleSoundscape(s.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs border transition flex-1 justify-center",
                activeSoundscape === s.id
                  ? "border-[var(--neon-primary)]/50 bg-[var(--neon-primary)]/15 text-[var(--neon-primary)]"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10",
              )}
            >
              {s.icon} <span>{s.label}</span>
            </button>
          ))}
        </div>
        {activeSoundscape && (
          <div className="flex items-center gap-2">
            <VolumeX className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={soundVolume}
              onChange={(e) => setSoundVolume(Number(e.target.value))}
              className="flex-1 h-1 appearance-none bg-white/10 rounded-full outline-none cursor-pointer"
              style={{ accentColor: "oklch(0.65 0.22 280)" }}
            />
            <Volume2 className="h-3 w-3 text-muted-foreground shrink-0" />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="px-1 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold">
          Audio
        </p>
        {noiseSuppressionSupported && (
          <button
            onClick={() => void toggleNoiseSuppression()}
            className={cn(
              "flex items-center justify-between w-full rounded-xl px-3 py-2 text-xs border transition",
              noiseSuppressionEnabled
                ? "border-[oklch(0.75_0.18_145)/0.5] bg-[oklch(0.75_0.18_145)/0.15] text-[oklch(0.85_0.15_145)]"
                : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10",
            )}
          >
            <span className="flex items-center gap-2">
              <Mic2 className="h-3.5 w-3.5" /> Noise suppression
            </span>
            <span
              className={cn(
                "text-[10px] rounded px-1.5 py-0.5 font-semibold",
                noiseSuppressionEnabled
                  ? "bg-[oklch(0.75_0.18_145)/0.25] text-[oklch(0.85_0.15_145)]"
                  : "bg-white/5 text-muted-foreground",
              )}
            >
              {noiseSuppressionEnabled ? "ON" : "OFF"}
            </span>
          </button>
        )}
        <button
          onClick={() => setAutoSpotlight(!autoSpotlight)}
          className={cn(
            "flex items-center justify-between w-full rounded-xl px-3 py-2 text-xs border transition",
            autoSpotlight
              ? "border-[var(--neon-secondary)/0.5] bg-[var(--neon-secondary)/0.15] text-[var(--neon-secondary)]"
              : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10",
          )}
        >
          <span className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" /> Auto-spotlight speaker
          </span>
          <span
            className={cn(
              "text-[10px] rounded px-1.5 py-0.5 font-semibold",
              autoSpotlight
                ? "bg-[var(--neon-secondary)/0.25] text-[var(--neon-secondary)]"
                : "bg-white/5 text-muted-foreground",
            )}
          >
            {autoSpotlight ? "ON" : "OFF"}
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── Whiteboard Overlay ───────────────────────────────────────────────────────

function WhiteboardOverlay({
  elements,
  cursors,
  preview,
  activeTool,
  activeColor,
  strokeWidth,
  currentPoints,
  canManage,
  undoAvailable,
  redoAvailable,
  onToolChange,
  onColorChange,
  onStrokeWidthChange,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onClick,
  onErase,
  onClear,
  onUndo,
  onRedo,
  onClose,
}: {
  elements: WhiteboardElement[];
  cursors: Array<{ socketId: string; username: string; x: number; y: number }>;
  preview: WhiteboardElement | null;
  activeTool: WhiteboardTool;
  activeColor: string;
  strokeWidth: number;
  currentPoints: number[][];
  canManage: boolean;
  undoAvailable: boolean;
  redoAvailable: boolean;
  onToolChange: (t: WhiteboardTool) => void;
  onColorChange: (c: string) => void;
  onStrokeWidthChange: (w: number) => void;
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: () => void;
  onClick: (e: React.MouseEvent<SVGSVGElement>) => void;
  onErase: (id: string) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClose: () => void;
}) {
  const tools: { id: WhiteboardTool; icon: React.ReactNode; label: string }[] = [
    { id: "select", icon: <MousePointer className="h-4 w-4" />, label: "Select (V)" },
    { id: "pen", icon: <PenLine className="h-4 w-4" />, label: "Pen (P)" },
    { id: "eraser", icon: <Eraser className="h-4 w-4" />, label: "Eraser (E)" },
    { id: "text", icon: <Type className="h-4 w-4" />, label: "Text (T)" },
    { id: "sticky", icon: <StickyNote className="h-4 w-4" />, label: "Sticky (S)" },
    { id: "arrow", icon: <ArrowUpRight className="h-4 w-4" />, label: "Arrow (A)" },
    { id: "rect", icon: <Square className="h-4 w-4" />, label: "Rect (R)" },
    { id: "ellipse", icon: <Circle className="h-4 w-4" />, label: "Ellipse (O)" },
  ];

  const pts2path = (pts: number[][]): string =>
    pts.length < 2
      ? ""
      : pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

  const renderElement = (el: WhiteboardElement, eraseMode: boolean) => {
    const eraseProps = eraseMode
      ? {
          className: "cursor-cell hover:opacity-30 transition-opacity",
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            onErase(el.id);
          },
        }
      : {};

    if (el.type === "stroke" && el.points)
      return (
        <path
          key={el.id}
          d={pts2path(el.points)}
          fill="none"
          stroke={el.color}
          strokeWidth={el.strokeWidth ?? 3}
          strokeLinecap="round"
          strokeLinejoin="round"
          {...eraseProps}
        />
      );
    if (el.type === "rect" && el.x !== undefined)
      return (
        <rect
          key={el.id}
          x={el.x}
          y={el.y}
          width={el.width ?? 100}
          height={el.height ?? 80}
          fill="none"
          stroke={el.color}
          strokeWidth={el.strokeWidth ?? 3}
          rx={6}
          {...eraseProps}
        />
      );
    if (el.type === "ellipse" && el.x !== undefined) {
      const cx = el.x + (el.width ?? 100) / 2,
        cy = el.y + (el.height ?? 80) / 2;
      return (
        <ellipse
          key={el.id}
          cx={cx}
          cy={cy}
          rx={(el.width ?? 100) / 2}
          ry={(el.height ?? 80) / 2}
          fill="none"
          stroke={el.color}
          strokeWidth={el.strokeWidth ?? 3}
          {...eraseProps}
        />
      );
    }
    if (el.type === "arrow" && el.points?.length === 2) {
      const [s, e2] = el.points;
      const dx = e2[0] - s[0],
        dy = e2[1] - s[1];
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len,
        uy = dy / len,
        ah = 16,
        aw = 9;
      const lx = e2[0] - ah * ux,
        ly = e2[1] - ah * uy;
      return (
        <g key={el.id} {...eraseProps}>
          <line
            x1={s[0]}
            y1={s[1]}
            x2={e2[0]}
            y2={e2[1]}
            stroke={el.color}
            strokeWidth={el.strokeWidth ?? 3}
            strokeLinecap="round"
          />
          <polygon
            points={`${e2[0]},${e2[1]} ${lx - aw * uy},${ly + aw * ux} ${lx + aw * uy},${ly - aw * ux}`}
            fill={el.color}
          />
        </g>
      );
    }
    if (el.type === "sticky" && el.x !== undefined)
      return (
        <g key={el.id} transform={`translate(${el.x},${el.y})`} {...eraseProps}>
          <rect
            x={-70}
            y={-28}
            width={140}
            height={56}
            rx={10}
            fill={el.color}
            fillOpacity={0.18}
            stroke={el.color}
            strokeWidth={1.5}
          />
          <text
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={el.color}
            fontSize="13"
            fontFamily="system-ui"
            fontWeight="500"
          >
            {el.text}
          </text>
        </g>
      );
    if (el.type === "text" && el.x !== undefined)
      return (
        <g key={el.id} transform={`translate(${el.x},${el.y})`} {...eraseProps}>
          <text
            x={0}
            y={0}
            dominantBaseline="middle"
            fill={el.color}
            fontSize="14"
            fontFamily="system-ui"
            fontWeight="400"
          >
            {el.text}
          </text>
        </g>
      );
    return null;
  };

  const cursor =
    activeTool === "pen"
      ? "crosshair"
      : activeTool === "eraser"
        ? "cell"
        : activeTool === "sticky" || activeTool === "text"
          ? "text"
          : "default";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex select-none"
    >
      <div className="absolute inset-0 bg-[oklch(0.10_0.02_265/0.97)] backdrop-blur-sm" />
      <svg
        className="absolute inset-0 w-full h-full touch-none"
        viewBox={`0 0 ${WB_SCALE} ${WB_SCALE}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={onClick}
      >
        <defs>
          <pattern id="wbdots" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="1" fill="oklch(1 0 0 / 0.07)" />
          </pattern>
        </defs>
        <rect width={WB_SCALE} height={WB_SCALE} fill="url(#wbdots)" />
        {elements.map((el) => renderElement(el, activeTool === "eraser"))}
        {preview && renderElement(preview, false)}
        {currentPoints.length >= 2 && (
          <path
            d={pts2path(currentPoints)}
            fill="none"
            stroke={activeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.85}
          />
        )}
        {cursors.map((c) => (
          <g
            key={c.socketId}
            transform={`translate(${c.x * WB_SCALE},${c.y * WB_SCALE})`}
            style={{ pointerEvents: "none" }}
          >
            <circle r={6} fill={`oklch(0.75 0.18 ${hueForName(c.username)})`} opacity={0.85} />
            <rect
              x={9}
              y={-9}
              width={c.username.length * 7 + 10}
              height={18}
              rx={4}
              fill="oklch(0.12 0.02 265 / 0.8)"
            />
            <text
              x={14}
              y={0}
              fontSize="11"
              dominantBaseline="middle"
              fill={`oklch(0.75 0.18 ${hueForName(c.username)})`}
              fontFamily="system-ui"
            >
              {c.username}
            </text>
          </g>
        ))}
      </svg>

      {/* Left toolbar */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-0.5 glass-strong rounded-2xl border border-white/10 p-1.5 max-h-[90vh] overflow-y-auto scrollbar-hide">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => onToolChange(t.id)}
            title={t.label}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl transition text-sm font-bold",
              activeTool === t.id
                ? "bg-[var(--neon-primary)]/20 text-[var(--neon-primary)] ring-1 ring-[var(--neon-primary)]/40"
                : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
            )}
          >
            {t.icon}
          </button>
        ))}
        <div className="my-1 h-px bg-white/10 mx-1" />
        {WB_WIDTHS.map((w) => (
          <button
            key={w}
            onClick={() => onStrokeWidthChange(w)}
            title={`${w}px`}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl transition",
              strokeWidth === w ? "bg-[var(--neon-primary)]/20" : "hover:bg-white/10",
            )}
          >
            <div
              className="rounded-full"
              style={{
                width: Math.min(w * 2, 20),
                height: Math.min(w * 2, 20),
                background: strokeWidth === w ? activeColor : "rgba(255,255,255,0.4)",
              }}
            />
          </button>
        ))}
        <div className="my-1 h-px bg-white/10 mx-1" />
        {WB_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onColorChange(c)}
            title={c}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl transition",
              activeColor === c ? "ring-2 ring-white/60 scale-90" : "hover:scale-110",
            )}
          >
            <div
              className="w-5 h-5 rounded-full border border-white/20"
              style={{ background: c }}
            />
          </button>
        ))}
        <div className="my-1 h-px bg-white/10 mx-1" />
        <button
          onClick={onUndo}
          disabled={!undoAvailable}
          title="Undo (Ctrl+Z)"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl transition",
            undoAvailable
              ? "text-muted-foreground hover:bg-white/10 hover:text-foreground"
              : "text-muted-foreground/20 cursor-not-allowed",
          )}
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!redoAvailable}
          title="Redo (Ctrl+Shift+Z)"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl transition",
            redoAvailable
              ? "text-muted-foreground hover:bg-white/10 hover:text-foreground"
              : "text-muted-foreground/20 cursor-not-allowed",
          )}
        >
          <Redo2 className="h-4 w-4" />
        </button>
        {canManage && (
          <>
            <div className="my-1 h-px bg-white/10 mx-1" />
            <button
              onClick={onClear}
              title="Clear all"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[oklch(0.78_0.2_35)] hover:bg-[oklch(0.72_0.22_35)]/20 transition"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      <div className="absolute top-4 right-4 z-40 flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground bg-black/50 backdrop-blur rounded-full px-3 py-1">
          {elements.length} element{elements.length !== 1 ? "s" : ""} · shared with all
        </span>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-xl glass border border-white/10 text-muted-foreground hover:text-foreground transition"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 text-[11px] text-muted-foreground/50 pointer-events-none">
        {activeTool === "pen"
          ? "Click and drag to draw"
          : activeTool === "eraser"
            ? "Click any element to erase it"
            : activeTool === "sticky" || activeTool === "text"
              ? "Click anywhere to place"
              : activeTool === "select"
                ? "Select mode — drag to move (coming soon)"
                : "Click and drag to draw shape"}
      </div>
    </motion.div>
  );
}

// ─── Polls Panel ──────────────────────────────────────────────────────────────

function PollsPanel({
  currentPoll,
  isHost,
  showCreator,
  pollQuestion,
  pollOptions,
  onQuestionChange,
  onOptionsChange,
  onShowCreator,
  onHideCreator,
  onCreate,
  onVote,
  onClosePoll,
  onDismiss,
  onClose,
}: {
  currentPoll: Poll | null;
  isHost: boolean;
  showCreator: boolean;
  pollQuestion: string;
  pollOptions: string[];
  onQuestionChange: (q: string) => void;
  onOptionsChange: (o: string[]) => void;
  onShowCreator: () => void;
  onHideCreator: () => void;
  onCreate: () => void;
  onVote: (i: number) => void;
  onClosePoll: () => void;
  onDismiss: () => void;
  onClose: () => void;
}) {
  const maxVotes = currentPoll ? Math.max(...Object.values(currentPoll.votes), 1) : 1;
  return (
    <motion.aside
      initial={{ x: 340 }}
      animate={{ x: 0 }}
      exit={{ x: 340 }}
      transition={{ type: "spring", damping: 26, stiffness: 250 }}
      className="absolute right-0 top-0 bottom-0 w-80 max-w-full glass-strong border-l border-white/10 overflow-y-auto z-10 flex flex-col"
    >
      <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-[var(--neon-primary)]" /> Live Polls
        </h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isHost && !currentPoll && !showCreator && (
          <NeonButton className="w-full" onClick={onShowCreator}>
            <Plus className="h-4 w-4 mr-2" /> Create Poll
          </NeonButton>
        )}
        <AnimatePresence>
          {showCreator && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="glass rounded-2xl border border-white/10 p-4 space-y-3"
            >
              <h4 className="text-sm font-semibold">New Poll</h4>
              <input
                value={pollQuestion}
                onChange={(e) => onQuestionChange(e.target.value)}
                placeholder="Ask a question…"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--neon-primary)]/50 transition"
              />
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={opt}
                    onChange={(e) => {
                      const n = [...pollOptions];
                      n[i] = e.target.value;
                      onOptionsChange(n);
                    }}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--neon-primary)]/50 transition"
                  />
                  {i >= 2 && (
                    <button
                      onClick={() => onOptionsChange(pollOptions.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-[oklch(0.78_0.2_35)]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 6 && (
                <button
                  onClick={() => onOptionsChange([...pollOptions, ""])}
                  className="text-xs text-[var(--neon-primary)] hover:underline"
                >
                  + Add option
                </button>
              )}
              <div className="flex gap-2">
                <NeonButton className="flex-1" onClick={onCreate}>
                  Launch
                </NeonButton>
                <NeonButton variant="outline" className="flex-1" onClick={onHideCreator}>
                  Cancel
                </NeonButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {currentPoll && (
          <div className="glass rounded-2xl border border-white/10 p-4 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-semibold">{currentPoll.question}</h4>
              {currentPoll.closed && (
                <span className="text-[10px] rounded-md bg-white/10 px-2 py-0.5 text-muted-foreground shrink-0">
                  Closed
                </span>
              )}
            </div>
            <div className="space-y-2.5">
              {currentPoll.options.map((opt, i) => {
                const count = currentPoll.votes[i] ?? 0;
                const pct = currentPoll.totalVoters
                  ? Math.round((count / currentPoll.totalVoters) * 100)
                  : 0;
                const isLeading = count === maxVotes && count > 0;
                const isMyVote = currentPoll.myVote === i;
                return (
                  <button
                    key={i}
                    onClick={() =>
                      !currentPoll.closed && currentPoll.myVote === undefined && onVote(i)
                    }
                    disabled={currentPoll.closed || currentPoll.myVote !== undefined}
                    className={cn(
                      "w-full text-left rounded-xl border p-3 transition",
                      isMyVote
                        ? "border-[var(--neon-primary)]/50 bg-[var(--neon-primary)]/10"
                        : "border-white/10 bg-white/5 hover:bg-white/8 disabled:cursor-default",
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm">{opt}</span>
                      <div className="flex items-center gap-2">
                        {isLeading && !currentPoll.closed && (
                          <span className="text-[10px] text-[var(--neon-secondary)]">leading</span>
                        )}
                        <span className="text-xs font-medium tabular-nums">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <motion.div
                        className={cn(
                          "h-full rounded-full",
                          isLeading ? "bg-[var(--neon-primary)]" : "bg-white/30",
                        )}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {currentPoll.totalVoters} vote{currentPoll.totalVoters !== 1 ? "s" : ""}
            </p>
            {isHost && (
              <div className="flex gap-2">
                {!currentPoll.closed && (
                  <NeonButton variant="outline" className="flex-1 text-xs" onClick={onClosePoll}>
                    Close poll
                  </NeonButton>
                )}
                <NeonButton variant="outline" className="flex-1 text-xs" onClick={onDismiss}>
                  Dismiss
                </NeonButton>
              </div>
            )}
          </div>
        )}
        {!currentPoll && !showCreator && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <BarChart2 className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground text-center">
              No active poll.{isHost ? " Create one above." : ""}
            </p>
          </div>
        )}
      </div>
    </motion.aside>
  );
}

// ─── Agenda Panel ─────────────────────────────────────────────────────────────

function AgendaPanel({
  agenda,
  agendaTimeLeft,
  isHost,
  showCreator,
  agendaInput,
  onAgendaInputChange,
  onShowCreator,
  onHideCreator,
  onCreate,
  onNext,
  onPrev,
  onGoto,
  onTimerStart,
  onTimerPause,
  onClose,
}: {
  agenda: AgendaState | null;
  agendaTimeLeft: number | null;
  isHost: boolean;
  showCreator: boolean;
  agendaInput: Array<{ title: string; durationSec: number }>;
  onAgendaInputChange: (items: Array<{ title: string; durationSec: number }>) => void;
  onShowCreator: () => void;
  onHideCreator: () => void;
  onCreate: () => void;
  onNext: () => void;
  onPrev: () => void;
  onGoto: (i: number) => void;
  onTimerStart: () => void;
  onTimerPause: () => void;
  onClose: () => void;
}) {
  const isTimerRunning = agenda ? !agenda.timerPaused && agenda.timerEnd !== null : false;
  const progressPct = useMemo(() => {
    if (!agenda || agendaTimeLeft === null) return 0;
    const total = agenda.items[agenda.activeIdx].durationSec * 1000;
    return Math.max(0, Math.min(100, ((total - agendaTimeLeft) / total) * 100));
  }, [agenda, agendaTimeLeft]);

  return (
    <motion.aside
      initial={{ x: 340 }}
      animate={{ x: 0 }}
      exit={{ x: 340 }}
      transition={{ type: "spring", damping: 26, stiffness: 250 }}
      className="absolute right-0 top-0 bottom-0 w-80 max-w-full glass-strong border-l border-white/10 overflow-y-auto z-10 flex flex-col"
    >
      <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-[var(--neon-primary)]" /> Agenda
        </h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isHost && !agenda && !showCreator && (
          <NeonButton className="w-full" onClick={onShowCreator}>
            <Plus className="h-4 w-4 mr-2" /> Set Agenda
          </NeonButton>
        )}
        <AnimatePresence>
          {showCreator && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="glass rounded-2xl border border-white/10 p-4 space-y-3"
            >
              <h4 className="text-sm font-semibold">Meeting Agenda</h4>
              {agendaInput.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={item.title}
                    onChange={(e) => {
                      const n = [...agendaInput];
                      n[i] = { ...item, title: e.target.value };
                      onAgendaInputChange(n);
                    }}
                    placeholder={`Item ${i + 1}`}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--neon-primary)]/50 transition"
                  />
                  <input
                    type="number"
                    min={1}
                    value={Math.round(item.durationSec / 60)}
                    onChange={(e) => {
                      const n = [...agendaInput];
                      n[i] = { ...item, durationSec: Number(e.target.value) * 60 };
                      onAgendaInputChange(n);
                    }}
                    className="w-12 bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-sm outline-none text-center focus:border-[var(--neon-primary)]/50 transition"
                    title="Minutes"
                  />
                  <span className="text-[10px] text-muted-foreground shrink-0">m</span>
                  {agendaInput.length > 1 && (
                    <button
                      onClick={() => onAgendaInputChange(agendaInput.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-[oklch(0.78_0.2_35)]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {agendaInput.length < 10 && (
                <button
                  onClick={() =>
                    onAgendaInputChange([...agendaInput, { title: "", durationSec: 300 }])
                  }
                  className="text-xs text-[var(--neon-primary)] hover:underline"
                >
                  + Add item
                </button>
              )}
              <div className="flex gap-2">
                <NeonButton className="flex-1" onClick={onCreate}>
                  Set agenda
                </NeonButton>
                <NeonButton variant="outline" className="flex-1" onClick={onHideCreator}>
                  Cancel
                </NeonButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {agenda && (
          <div className="space-y-3">
            <div className="glass rounded-2xl border border-[var(--neon-primary)]/30 bg-[var(--neon-primary)]/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--neon-primary)] uppercase tracking-wider font-semibold">
                  Current
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {agenda.activeIdx + 1}/{agenda.items.length}
                </span>
              </div>
              <h4 className="text-sm font-semibold">{agenda.items[agenda.activeIdx]?.title}</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "font-mono text-2xl font-bold tabular-nums",
                      agendaTimeLeft !== null && agendaTimeLeft < 30000
                        ? "text-[oklch(0.78_0.2_35)]"
                        : "text-gradient",
                    )}
                  >
                    {agendaTimeLeft !== null ? formatDuration(agendaTimeLeft) : "--:--"}
                  </span>
                  {isHost && (
                    <button
                      onClick={isTimerRunning ? onTimerPause : onTimerStart}
                      className={cn(
                        "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition border",
                        isTimerRunning
                          ? "border-[oklch(0.72_0.22_35)/0.4] bg-[oklch(0.72_0.22_35)/0.15] text-[oklch(0.82_0.2_35)]"
                          : "border-[var(--neon-primary)]/40 bg-[var(--neon-primary)]/15 text-[var(--neon-primary)]",
                      )}
                    >
                      {isTimerRunning ? (
                        <>
                          <Pause className="h-3 w-3" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3" /> Start
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className={cn(
                      "h-full rounded-full",
                      progressPct > 85 ? "bg-[oklch(0.72_0.22_35)]" : "bg-[var(--neon-primary)]",
                    )}
                    style={{ width: `${progressPct}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
              {isHost && (
                <div className="flex gap-2">
                  <button
                    onClick={onPrev}
                    disabled={agenda.activeIdx === 0}
                    className="flex-1 flex items-center justify-center gap-1 rounded-xl border border-white/10 py-1.5 text-xs text-muted-foreground hover:bg-white/5 transition disabled:opacity-30"
                  >
                    <ChevronLeft className="h-3 w-3" /> Prev
                  </button>
                  <button
                    onClick={onNext}
                    className="flex-1 flex items-center justify-center gap-1 rounded-xl border border-white/10 py-1.5 text-xs text-muted-foreground hover:bg-white/5 transition"
                  >
                    Next <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              {agenda.items.map((item, i) => (
                <button
                  key={item.id}
                  onClick={() => isHost && onGoto(i)}
                  className={cn(
                    "w-full text-left flex items-center gap-3 rounded-xl p-2.5 transition border",
                    i === agenda.activeIdx
                      ? "border-[var(--neon-primary)]/30 bg-[var(--neon-primary)]/10"
                      : item.done
                        ? "border-white/5 bg-white/3 opacity-50"
                        : "border-white/5 bg-white/3 hover:bg-white/5",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                      item.done
                        ? "bg-[oklch(0.75_0.18_145)/0.3] text-[oklch(0.75_0.18_145)]"
                        : i === agenda.activeIdx
                          ? "bg-[var(--neon-primary)]/30 text-[var(--neon-primary)]"
                          : "bg-white/10 text-muted-foreground",
                    )}
                  >
                    {item.done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
                  </div>
                  <span className={cn("flex-1 text-sm truncate", item.done && "line-through")}>
                    {item.title}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {Math.round(item.durationSec / 60)}m
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {!agenda && !showCreator && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <ListChecks className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground text-center">
              No agenda set.{isHost ? " Add one above." : ""}
            </p>
          </div>
        )}
      </div>
    </motion.aside>
  );
}

// ─── Spatial Canvas ───────────────────────────────────────────────────────────

function SpatialCanvas({
  localStream,
  localSocketId,
  username,
  mic,
  cam,
  localStatus,
  localHandRaised,
  isHost,
  isSubHost,
  peers,
  onRemove,
  onLowerHand,
  isSpeaking,
  speakingPeerId,
  tilePositions,
  setTilePosition,
  spotlightId,
  setSpotlightId,
}: {
  localStream: MediaStream | null;
  localSocketId: string | null;
  username: string;
  mic: boolean;
  cam: boolean;
  localStatus: ParticipantStatus;
  localHandRaised: boolean;
  isHost: boolean;
  isSubHost: boolean;
  peers: RemotePeer[];
  onRemove: (id: string) => void;
  onLowerHand: (id: string) => void;
  isSpeaking: boolean;
  speakingPeerId: string | null;
  tilePositions: Map<string, TilePosition>;
  setTilePosition: (id: string, pos: TilePosition) => void;
  spotlightId: string | null;
  setSpotlightId: (id: string | null) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const getPos = (id: string): TilePosition =>
    tilePositions.get(id) ?? { x: Math.random() * 60 + 5, y: Math.random() * 60 + 5 };

  const allParticipants = [
    { id: "local", name: username },
    ...peers.map((p) => ({ id: p.socketId, name: p.username })),
  ];

  return (
    <div
      ref={canvasRef}
      className="relative w-full h-full overflow-hidden rounded-2xl border border-white/5"
      style={{ background: "oklch(0.12 0.02 265 / 0.5)" }}
      onPointerMove={(e) => {
        if (!dragging) return;
        const rect = canvasRef.current!.getBoundingClientRect();
        const x = Math.max(
          0,
          Math.min(90, ((e.clientX - rect.left - dragOffset.current.x) / rect.width) * 100),
        );
        const y = Math.max(
          0,
          Math.min(85, ((e.clientY - rect.top - dragOffset.current.y) / rect.height) * 100),
        );
        setTilePosition(dragging, { x, y });
      }}
      onPointerUp={() => setDragging(null)}
    >
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: "radial-gradient(circle, oklch(1 0 0 / 0.3) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      {allParticipants.map((participant, i) => {
        const pos = getPos(participant.id);
        const isLocal = participant.id === "local";
        const peer = isLocal ? null : peers.find((p) => p.socketId === participant.id);
        const speaking = isLocal ? isSpeaking : participant.id === speakingPeerId;
        return (
          <div
            key={participant.id}
            className="absolute"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              width: 200,
              height: 150,
              cursor: dragging === participant.id ? "grabbing" : "grab",
              zIndex: dragging === participant.id ? 20 : 10,
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const canvas = canvasRef.current;
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              dragOffset.current = {
                x: e.clientX - rect.left - (pos.x / 100) * rect.width,
                y: e.clientY - rect.top - (pos.y / 100) * rect.height,
              };
              setDragging(participant.id);
            }}
          >
            <div
              className={cn(
                "w-full h-full rounded-2xl overflow-hidden border transition-all",
                speaking
                  ? "border-[var(--neon-secondary)] shadow-[0_0_20px_oklch(0.82_0.16_210/0.5)]"
                  : "border-white/10",
              )}
            >
              {isLocal ? (
                <LocalVideoTile
                  stream={localStream}
                  username={username}
                  mic={mic}
                  cam={cam}
                  isHost={isHost}
                  isSubHost={isSubHost}
                  isSpeaking={isSpeaking}
                  status={localStatus}
                  handRaised={localHandRaised}
                />
              ) : peer ? (
                <RemoteVideoTile
                  peer={peer}
                  hue={hueForIndex(i - 1)}
                  onRemove={() => onRemove(peer.socketId)}
                  onLowerHand={() => onLowerHand(peer.socketId)}
                  isSpeaking={speaking}
                />
              ) : null}
            </div>
          </div>
        );
      })}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground/40 pointer-events-none">
        Drag tiles to rearrange · Spatial layout
      </div>
    </div>
  );
}

// ─── Video Grid ───────────────────────────────────────────────────────────────

function VideoGrid({
  localStream,
  localSocketId,
  username,
  mic,
  cam,
  localStatus,
  localHandRaised,
  isHost,
  isSubHost,
  peers,
  onRemove,
  onLowerHand,
  isSpeaking,
  speakingPeerId,
  cinemaMode,
  activeSpotlightId,
  spotlightId,
  setSpotlightId,
}: {
  localStream: MediaStream | null;
  localSocketId: string | null;
  username: string;
  mic: boolean;
  cam: boolean;
  localStatus: ParticipantStatus;
  localHandRaised: boolean;
  isHost: boolean;
  isSubHost: boolean;
  peers: RemotePeer[];
  onRemove: (id: string) => void;
  onLowerHand: (id: string) => void;
  isSpeaking: boolean;
  speakingPeerId: string | null;
  cinemaMode: boolean;
  activeSpotlightId: string | null;
  spotlightId: string | null;
  setSpotlightId: (id: string | null) => void;
}) {
  if (cinemaMode && activeSpotlightId) {
    const isLocalSpotlit = activeSpotlightId === "local" || activeSpotlightId === localSocketId;
    const spotlitPeer = isLocalSpotlit ? null : peers.find((p) => p.socketId === activeSpotlightId);
    const stripItems = isLocalSpotlit
      ? peers.map((p, i) => ({ type: "remote" as const, peer: p, hue: hueForIndex(i) }))
      : [
          { type: "local" as const },
          ...peers
            .filter((p) => p.socketId !== activeSpotlightId)
            .map((p, i) => ({ type: "remote" as const, peer: p, hue: hueForIndex(i) })),
        ];
    return (
      <div className="flex h-full gap-3">
        <div className="flex-1 relative overflow-hidden rounded-2xl">
          {isLocalSpotlit ? (
            <LocalVideoTile
              stream={localStream}
              username={username}
              mic={mic}
              cam={cam}
              isHost={isHost}
              isSubHost={isSubHost}
              isSpeaking={isSpeaking}
              status={localStatus}
              handRaised={localHandRaised}
            />
          ) : spotlitPeer ? (
            <RemoteVideoTile
              peer={spotlitPeer}
              hue={hueForIndex(peers.indexOf(spotlitPeer))}
              onRemove={() => onRemove(spotlitPeer.socketId)}
              onLowerHand={() => onLowerHand(spotlitPeer.socketId)}
              isSpeaking={spotlitPeer.socketId === speakingPeerId}
            />
          ) : null}
          {spotlightId && (
            <button
              onClick={() => setSpotlightId(null)}
              className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-xl bg-black/60 backdrop-blur border border-white/10 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition"
            >
              <PinOff className="h-3 w-3" /> Unpin
            </button>
          )}
        </div>
        {stripItems.length > 0 && (
          <div className="flex flex-col gap-2 w-40 overflow-y-auto">
            {stripItems.map((p, i) => (
              <div key={i} className="h-28 shrink-0">
                {p.type === "local" ? (
                  <LocalVideoTile
                    stream={localStream}
                    username={username}
                    mic={mic}
                    cam={cam}
                    isHost={isHost}
                    isSubHost={isSubHost}
                    isSpeaking={isSpeaking}
                  />
                ) : (
                  <RemoteVideoTile
                    peer={p.peer}
                    hue={p.hue}
                    onRemove={() => onRemove(p.peer.socketId)}
                    onLowerHand={() => onLowerHand(p.peer.socketId)}
                    isSpeaking={p.peer.socketId === speakingPeerId}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const total = peers.length + 1;
  const cols =
    total <= 1
      ? "grid-cols-1"
      : total <= 2
        ? "grid-cols-1 sm:grid-cols-2"
        : total <= 4
          ? "grid-cols-2"
          : total <= 6
            ? "grid-cols-2 md:grid-cols-3"
            : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";

  return (
    <div className={cn("grid h-full w-full gap-3", cols)}>
      <div className="relative group">
        <LocalVideoTile
          stream={localStream}
          username={username}
          mic={mic}
          cam={cam}
          isHost={isHost}
          isSubHost={isSubHost}
          isSpeaking={isSpeaking}
          status={localStatus}
          handRaised={localHandRaised}
        />
        <button
          onClick={() => setSpotlightId(spotlightId === "local" ? null : "local")}
          className="absolute top-2 left-1/2 -translate-x-1/2 z-20 opacity-0 group-hover:opacity-100 transition flex items-center gap-1 rounded-full bg-black/60 backdrop-blur border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground"
        >
          {spotlightId === "local" ? (
            <>
              <PinOff className="h-3 w-3" /> Unpin
            </>
          ) : (
            <>
              <Pin className="h-3 w-3" /> Pin
            </>
          )}
        </button>
      </div>
      {peers.map((p, i) => (
        <div key={p.socketId} className="relative group">
          <RemoteVideoTile
            peer={p}
            hue={hueForIndex(i)}
            onRemove={() => onRemove(p.socketId)}
            onLowerHand={() => onLowerHand(p.socketId)}
            isSpeaking={p.socketId === speakingPeerId}
          />
          <button
            onClick={() => setSpotlightId(spotlightId === p.socketId ? null : p.socketId)}
            className="absolute top-2 left-1/2 -translate-x-1/2 z-20 opacity-0 group-hover:opacity-100 transition flex items-center gap-1 rounded-full bg-black/60 backdrop-blur border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground"
          >
            {spotlightId === p.socketId ? (
              <>
                <PinOff className="h-3 w-3" /> Unpin
              </>
            ) : (
              <>
                <Pin className="h-3 w-3" /> Pin
              </>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Local Video Tile ─────────────────────────────────────────────────────────

function LocalVideoTile({
  stream,
  username,
  mic,
  cam,
  isHost,
  isSubHost,
  isSpeaking = false,
  status,
  handRaised,
}: {
  stream: MediaStream | null;
  username: string;
  mic: boolean;
  cam: boolean;
  isHost?: boolean;
  isSubHost?: boolean;
  isSpeaking?: boolean;
  status?: ParticipantStatus;
  handRaised?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);
  const hasLiveVideo =
    cam && stream != null && stream.getVideoTracks().some((t) => t.readyState === "live");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-black/60 h-full transition-all duration-300",
        isSpeaking
          ? "border-[var(--neon-secondary)] shadow-[0_0_24px_4px_oklch(0.82_0.16_210/0.4)]"
          : "border-white/10",
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cn(
          "absolute inset-0 h-full w-full object-cover scale-x-[-1] transition-opacity duration-300",
          hasLiveVideo ? "opacity-100" : "opacity-0",
        )}
      />
      {!hasLiveVideo && <TileGenerativeAvatar username={username} speaking={isSpeaking} />}
      {status && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-2 py-0.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: STATUS_CONFIG[status].color,
              boxShadow: `0 0 6px ${STATUS_CONFIG[status].color}`,
            }}
          />
          <span className="text-[10px] text-muted-foreground">{STATUS_CONFIG[status].label}</span>
        </div>
      )}
      <AnimatePresence>
        {handRaised && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 text-4xl drop-shadow-[0_0_20px_oklch(0.9_0.18_80)]"
          >
            <motion.span
              animate={{ rotate: [0, 20, -10, 20, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1 }}
            >
              ✋
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-black/60 backdrop-blur px-2 py-1 text-xs z-10">
        {isSpeaking && <AudioBars color="var(--neon-secondary)" small />}
        <span className="truncate max-w-[140px]">{username} (you)</span>
        {!mic && <MicOff className="h-3 w-3 text-[oklch(0.78_0.2_35)]" />}
      </div>
      {isHost && (
        <span className="absolute top-2 left-2 z-10 rounded-md bg-[var(--neon-primary)]/20 px-1.5 py-0.5 text-[10px] text-[var(--neon-primary)] border border-[var(--neon-primary)]/30">
          Host
        </span>
      )}
      {!isHost && isSubHost && (
        <span className="absolute top-2 left-2 z-10 rounded-md bg-[var(--neon-secondary)]/20 px-1.5 py-0.5 text-[10px] text-[var(--neon-secondary)] border border-[var(--neon-secondary)]/30">
          Co-Host
        </span>
      )}
      {isSpeaking && (
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          animate={{
            boxShadow: [
              "inset 0 0 0 2px oklch(0.82 0.16 210 / 0.4)",
              "inset 0 0 0 4px oklch(0.82 0.16 210 / 0.7)",
              "inset 0 0 0 2px oklch(0.82 0.16 210 / 0.4)",
            ],
          }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
}

// ─── Remote Video Tile ────────────────────────────────────────────────────────

function RemoteVideoTile({
  peer,
  hue,
  onRemove,
  onLowerHand,
  isSpeaking = false,
}: {
  peer: RemotePeer;
  hue: number;
  onRemove: () => void;
  onLowerHand: () => void;
  isSpeaking?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && peer.stream) videoRef.current.srcObject = peer.stream;
  }, [peer.stream]);
  const hasVideo = peer.cam && peer.stream && peer.stream.getVideoTracks().length > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-black/40 h-full transition-all duration-300",
        isSpeaking
          ? "border-[var(--neon-secondary)] shadow-[0_0_24px_4px_oklch(0.82_0.16_210/0.4)]"
          : "border-white/10",
      )}
    >
      {/* FIX C: muted — audio rendered by dedicated <audio> element in useWebRTC */}
      {peer.stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
            hasVideo ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      {!hasVideo && <TileGenerativeAvatar username={peer.username} speaking={isSpeaking} />}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-2 py-0.5">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: STATUS_CONFIG[peer.status]?.color ?? "oklch(0.75 0.18 145)",
            boxShadow: `0 0 6px ${STATUS_CONFIG[peer.status]?.color ?? "oklch(0.75 0.18 145)"}`,
          }}
        />
        <span className="text-[10px] text-muted-foreground">
          {STATUS_CONFIG[peer.status]?.label ?? "Available"}
        </span>
      </div>
      <AnimatePresence>
        {peer.handRaised && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 text-4xl drop-shadow-[0_0_20px_oklch(0.9_0.18_80)] cursor-pointer"
            onClick={onLowerHand}
            title="Lower hand"
          >
            <motion.span
              animate={{ rotate: [0, 20, -10, 20, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1 }}
            >
              ✋
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-black/60 backdrop-blur px-2 py-1 text-xs z-10">
        {isSpeaking && <AudioBars color="var(--neon-secondary)" small />}
        <span className="truncate max-w-[140px]">{peer.username}</span>
        {!peer.mic && <MicOff className="h-3 w-3 text-[oklch(0.78_0.2_35)]" />}
      </div>
      {peer.isHost && (
        <span className="absolute top-2 left-2 z-10 rounded-md bg-[var(--neon-primary)]/20 px-1.5 py-0.5 text-[10px] text-[var(--neon-primary)] border border-[var(--neon-primary)]/30">
          Host
        </span>
      )}
      {!peer.isHost && peer.isSubHost && (
        <span className="absolute top-2 left-2 z-10 rounded-md bg-[var(--neon-secondary)]/20 px-1.5 py-0.5 text-[10px] text-[var(--neon-secondary)] border border-[var(--neon-secondary)]/30">
          Co-Host
        </span>
      )}
      <button
        onClick={onRemove}
        className="absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition rounded-md bg-black/60 p-1 text-muted-foreground hover:text-[oklch(0.78_0.2_35)]"
        title="Remove"
      >
        <X className="h-3 w-3" />
      </button>
      {isSpeaking && (
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          animate={{
            boxShadow: [
              "inset 0 0 0 2px oklch(0.82 0.16 210 / 0.4)",
              "inset 0 0 0 4px oklch(0.82 0.16 210 / 0.7)",
              "inset 0 0 0 2px oklch(0.82 0.16 210 / 0.4)",
            ],
          }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
}

// ─── Screen Share View ────────────────────────────────────────────────────────

function ScreenShareView({
  localStream,
  localCameraStream,
  peers,
  username,
  mic,
  cam,
  isSpeaking,
  speakingPeerId,
}: {
  localStream: MediaStream | null;
  localCameraStream: MediaStream | null;
  peers: RemotePeer[];
  username: string;
  mic: boolean;
  cam: boolean;
  isSpeaking: boolean;
  speakingPeerId: string | null;
}) {
  const screenRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (screenRef.current && localStream) screenRef.current.srcObject = localStream;
  }, [localStream]);
  return (
    <div className="flex h-full flex-col gap-3 lg:flex-row">
      <div className="relative flex-1 overflow-hidden rounded-2xl border border-[var(--neon-primary)]/40 bg-black/60">
        <video
          ref={screenRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-contain"
        />
        <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur px-3 py-1 text-xs z-10">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon-secondary)] animate-pulse" />{" "}
          {username} is sharing
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-y-auto">
        <div className="h-24 w-32 shrink-0 lg:h-32 lg:w-full">
          <LocalVideoTile
            stream={localCameraStream}
            username={username}
            mic={mic}
            cam={cam}
            isSpeaking={isSpeaking}
          />
        </div>
        {peers.map((p, i) => (
          <div key={p.socketId} className="h-24 w-32 shrink-0 lg:h-32 lg:w-full">
            <RemoteVideoTile
              peer={p}
              hue={hueForIndex(i)}
              onRemove={() => {}}
              onLowerHand={() => {}}
              isSpeaking={p.socketId === speakingPeerId}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Participants Panel ───────────────────────────────────────────────────────

function ParticipantsPanel({
  username,
  localStatus,
  localHandRaised,
  mic,
  cam,
  isHost,
  isSubHost,
  peers,
  raisedHands,
  onLowerHand,
  onRemove,
  onMuteAll,
  onCamOffAll,
  onTransferHost,
  onRequestMicOn,
  onRequestCamOn,
  onClose,
}: {
  username: string;
  localStatus: ParticipantStatus;
  localHandRaised: boolean;
  mic: boolean;
  cam: boolean;
  isHost: boolean;
  isSubHost: boolean;
  peers: RemotePeer[];
  raisedHands: Array<{ socketId: string; username: string; handRaisedAt: number }>;
  onLowerHand: (id: string) => void;
  onRemove: (id: string) => void;
  onMuteAll: () => void;
  onCamOffAll: () => void;
  onTransferHost: (peer: RemotePeer) => void;
  /** PATCH 4: request participant to unmute */
  onRequestMicOn: (socketId: string) => void;
  /** PATCH 4: request participant to turn camera on */
  onRequestCamOn: (socketId: string) => void;
  onClose: () => void;
}) {
  const canManage = isHost || isSubHost;
  return (
    <motion.aside
      initial={{ x: 340 }}
      animate={{ x: 0 }}
      exit={{ x: 340 }}
      transition={{ type: "spring", damping: 26, stiffness: 250 }}
      className="absolute right-0 top-0 bottom-0 w-80 max-w-full glass-strong border-l border-white/10 overflow-y-auto z-10 flex flex-col"
    >
      <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--neon-primary)]" /> Participants{" "}
          <span className="text-muted-foreground">({peers.length + 1})</span>
        </h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence>
          {raisedHands.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-2xl border border-[oklch(0.8_0.18_80)/0.3] bg-[oklch(0.8_0.18_80)/0.06] p-3"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[oklch(0.9_0.18_80)] mb-2 flex items-center gap-1.5">
                ✋ Raised hands
              </p>
              <div className="space-y-1.5">
                {raisedHands.map((h) => (
                  <div key={h.socketId} className="flex items-center justify-between">
                    <span className="text-sm text-[oklch(0.9_0.18_80)]">{h.username}</span>
                    <button
                      onClick={() => onLowerHand(h.socketId)}
                      className="text-[10px] rounded-md px-2 py-0.5 border border-white/10 text-muted-foreground hover:text-foreground transition"
                    >
                      Lower
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {canManage && (
          <div className="flex gap-2">
            <NeonButton variant="outline" className="flex-1 text-xs" onClick={onMuteAll}>
              Mute all
            </NeonButton>
            <NeonButton variant="outline" className="flex-1 text-xs" onClick={onCamOffAll}>
              Cam off all
            </NeonButton>
          </div>
        )}
        <ul className="space-y-2">
          {/* Local user row */}
          <li className="flex items-center gap-3 rounded-xl border border-[var(--neon-primary)]/20 bg-[var(--neon-primary)]/5 p-2.5">
            <div className="relative">
              <Avatar name={username} hue={280} size={32} />
              <StatusDot status={localStatus} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm">{username}</p>
                {localHandRaised && <span className="text-sm">✋</span>}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isHost ? "Host · You" : isSubHost ? "Co-Host · You" : "You"}
              </p>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              {mic ? (
                <Mic className="h-3.5 w-3.5" />
              ) : (
                <MicOff className="h-3.5 w-3.5 text-[oklch(0.72_0.22_35)]" />
              )}
              {cam ? (
                <VideoIcon className="h-3.5 w-3.5" />
              ) : (
                <VideoOff className="h-3.5 w-3.5 text-[oklch(0.72_0.22_35)]" />
              )}
            </div>
          </li>

          {/* Remote peer rows */}
          {peers.map((p, i) => (
            <motion.li
              key={p.socketId}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex items-center gap-3 rounded-xl border border-white/5 p-2.5 hover:border-white/10 transition"
            >
              <div className="relative">
                <Avatar name={p.username} hue={hueForIndex(i)} size={32} />
                <StatusDot status={p.status} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="truncate text-sm">{p.username}</p>
                  {p.handRaised && (
                    <motion.span
                      animate={{ rotate: [0, 15, -10, 15, 0] }}
                      transition={{ duration: 1, repeat: Infinity, repeatDelay: 1.5 }}
                      className="text-sm"
                    >
                      ✋
                    </motion.span>
                  )}
                  {p.speaking && <AudioBars color="var(--neon-secondary)" small />}
                  {p.isHost && (
                    <span className="text-[10px] rounded bg-[var(--neon-primary)]/20 px-1.5 py-0.5 text-[var(--neon-primary)] border border-[var(--neon-primary)]/30">
                      Host
                    </span>
                  )}
                  {p.isSubHost && (
                    <span className="text-[10px] rounded bg-[var(--neon-secondary)]/20 px-1.5 py-0.5 text-[var(--neon-secondary)] border border-[var(--neon-secondary)]/30">
                      Co-Host
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {STATUS_CONFIG[p.status]?.label ?? "Participant"}
                </p>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                {p.mic ? (
                  <Mic className="h-3.5 w-3.5" />
                ) : (
                  <MicOff className="h-3.5 w-3.5 text-[oklch(0.72_0.22_35)]" />
                )}
                {p.cam ? (
                  <VideoIcon className="h-3.5 w-3.5" />
                ) : (
                  <VideoOff className="h-3.5 w-3.5 text-[oklch(0.72_0.22_35)]" />
                )}

                {/* ── PATCH 4: Ask to unmute / turn camera on ────────────────── */}
                {canManage && !p.isHost && (
                  <>
                    {!p.mic && (
                      <button
                        onClick={() => onRequestMicOn(p.socketId)}
                        className="ml-1 text-muted-foreground hover:text-[var(--neon-secondary)] transition"
                        title="Ask to unmute"
                      >
                        <Mic className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {!p.cam && (
                      <button
                        onClick={() => onRequestCamOn(p.socketId)}
                        className="ml-1 text-muted-foreground hover:text-[var(--neon-secondary)] transition"
                        title="Ask to turn camera on"
                      >
                        <VideoIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}

                {/* Host-only: transfer + remove */}
                {isHost && !p.isHost && (
                  <>
                    <button
                      onClick={() => onTransferHost(p)}
                      className="ml-1 text-muted-foreground hover:text-[var(--neon-primary)] transition"
                      title="Transfer host"
                    >
                      <Crown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onRemove(p.socketId)}
                      className="ml-1 text-muted-foreground hover:text-[oklch(0.78_0.2_35)] transition"
                      title="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                {/* Sub-host can remove non-hosts */}
                {isSubHost && !p.isHost && !p.isSubHost && (
                  <button
                    onClick={() => onRemove(p.socketId)}
                    className="ml-1 text-muted-foreground hover:text-[oklch(0.78_0.2_35)] transition"
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </motion.aside>
  );
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({
  localSocketId,
  username,
  messages,
  typingPeers,
  peers,
  onSend,
  onReact,
  onTyping,
  onClose,
}: {
  localSocketId: string | null;
  username: string;
  messages: ChatMessage[];
  typingPeers: Array<{ socketId: string; username: string }>;
  peers: RemotePeer[];
  onSend: (text: string, replyTo?: ChatMessage | null, recipients?: string[] | null) => void;
  onReact: (messageId: string, emoji: string) => void;
  onTyping: (isTyping: boolean) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [emojiPickerForMsg, setEmojiPickerForMsg] = useState<string | null>(null);
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string> | null>(null);
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const recipientBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!emojiPickerForMsg) return;
    const h = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-emoji-picker],[data-emoji-trigger]"))
        setEmojiPickerForMsg(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [emojiPickerForMsg]);

  useEffect(() => {
    if (!recipientPickerOpen) return;
    const h = (e: MouseEvent) => {
      if (recipientBtnRef.current?.contains(e.target as Node)) return;
      if ((e.target as HTMLElement).closest("[data-recipient-picker]")) return;
      setRecipientPickerOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [recipientPickerOpen]);

  const handleSend = () => {
    if (!input.trim()) return;
    const recipientsArray =
      selectedRecipients && selectedRecipients.size > 0 ? Array.from(selectedRecipients) : null;
    onSend(input.trim(), replyTo, recipientsArray);
    setInput("");
    setReplyTo(null);
    onTyping(false);
  };

  const toggleRecipient = (socketId: string) => {
    setSelectedRecipients((prev) => {
      const next = new Set(prev ?? []);
      next.has(socketId) ? next.delete(socketId) : next.add(socketId);
      return next.size === 0 ? null : next;
    });
  };

  const isPrivateMode = !!(selectedRecipients && selectedRecipients.size > 0);
  const recipientLabel = !isPrivateMode
    ? "Everyone"
    : selectedRecipients!.size === 1
      ? (peers.find((p) => selectedRecipients!.has(p.socketId))?.username ?? "1 person")
      : `${selectedRecipients!.size} people`;

  const grouped = messages.map((msg, i) => ({
    ...msg,
    isFirst: i === 0 || messages[i - 1].socketId !== msg.socketId,
    isLast: i === messages.length - 1 || messages[i + 1].socketId !== msg.socketId,
    isSelf: msg.socketId === localSocketId,
  }));

  return (
    <motion.aside
      initial={{ x: 340 }}
      animate={{ x: 0 }}
      exit={{ x: 340 }}
      transition={{ type: "spring", damping: 26, stiffness: 250 }}
      className="absolute right-0 top-0 bottom-0 w-80 max-w-full glass-strong border-l border-white/10 z-10 flex flex-col"
    >
      <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[var(--neon-primary)]" /> Meeting Chat
          {messages.length > 0 && (
            <span className="text-[11px] text-muted-foreground font-normal">
              · {messages.length}
            </span>
          )}
        </h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-0.5 scrollbar-hide">
        {grouped.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
            <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl">
              💬
            </div>
            <p className="text-xs text-muted-foreground text-center">
              No messages yet.
              <br />
              Start the conversation!
            </p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {grouped.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("relative", msg.isFirst ? "mt-4 first:mt-0" : "mt-0.5")}
              onMouseEnter={() => setHoveredMsgId(msg.id)}
              onMouseLeave={() => setHoveredMsgId(null)}
            >
              {msg.isFirst && (
                <div
                  className={cn(
                    "flex items-center gap-1.5 mb-1.5 px-1",
                    msg.isSelf ? "flex-row-reverse" : "flex-row",
                  )}
                >
                  <Avatar
                    name={msg.username}
                    hue={msg.isSelf ? 280 : hueForName(msg.username)}
                    size={20}
                  />
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {msg.isSelf ? "You" : msg.username}
                  </span>
                  <span className="text-[10px] text-muted-foreground/40">
                    {formatTime(msg.timestamp)}
                  </span>
                  {(msg as any).isPrivate && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--neon-accent)]/15 border border-[var(--neon-accent)]/30 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--neon-accent)] uppercase tracking-wide">
                      <Lock className="h-2.5 w-2.5" /> Private
                    </span>
                  )}
                </div>
              )}
              {(msg as any).isPrivate && msg.isFirst && msg.isSelf && (msg as any).recipients && (
                <div className={cn("flex mb-1 px-1", msg.isSelf ? "justify-end" : "justify-start")}>
                  <span className="text-[10px] text-muted-foreground/50">
                    Visible to:{" "}
                    {(msg as any).recipients
                      .filter((sid: string) => sid !== localSocketId)
                      .map(
                        (sid: string) =>
                          peers.find((p) => p.socketId === sid)?.username ?? "unknown",
                      )
                      .join(", ")}
                  </span>
                </div>
              )}
              <div className={cn("flex", msg.isSelf ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "relative max-w-[85%] flex flex-col gap-0.5",
                    msg.isSelf ? "items-end" : "items-start",
                  )}
                >
                  {msg.replyTo && (
                    <div className="text-[11px] text-muted-foreground rounded-lg px-2.5 py-1.5 border-l-2 border-[var(--neon-primary)]/50 bg-white/3 mb-0.5 max-w-full">
                      <span className="font-semibold text-[var(--neon-primary)] block">
                        ↩ {msg.replyTo.username}
                      </span>
                      <span className="opacity-70 line-clamp-1">
                        {msg.replyTo.text.slice(0, 60)}
                        {msg.replyTo.text.length > 60 ? "…" : ""}
                      </span>
                    </div>
                  )}
                  <div
                    className={cn(
                      "relative px-3.5 py-2 text-sm leading-relaxed rounded-2xl",
                      msg.isSelf
                        ? (msg as any).isPrivate
                          ? "bg-gradient-to-br from-[oklch(0.55_0.22_305)] to-[oklch(0.65_0.18_330)] text-white shadow-[0_4px_24px_-4px_oklch(0.65_0.22_305/0.4)]"
                          : "bg-gradient-to-br from-[oklch(0.55_0.22_280)] to-[oklch(0.65_0.18_305)] text-white shadow-[0_4px_24px_-4px_oklch(0.65_0.22_280/0.4)]"
                        : (msg as any).isPrivate
                          ? "bg-[var(--neon-accent)]/10 border border-[var(--neon-accent)]/20 text-foreground"
                          : "bg-white/8 border border-white/8 text-foreground",
                      msg.isFirst ? (msg.isSelf ? "rounded-tr-sm" : "rounded-tl-sm") : "",
                      msg.isLast
                        ? msg.isSelf
                          ? "rounded-br-2xl"
                          : "rounded-bl-2xl"
                        : msg.isSelf
                          ? "rounded-br-sm"
                          : "rounded-bl-sm",
                    )}
                  >
                    {msg.text}
                  </div>
                  {Object.keys(msg.reactions).length > 0 && (
                    <div
                      className={cn(
                        "flex flex-wrap gap-1 mt-0.5",
                        msg.isSelf ? "justify-end" : "justify-start",
                      )}
                    >
                      {Object.entries(msg.reactions).map(([emoji, sids]) =>
                        sids.size > 0 ? (
                          <button
                            key={emoji}
                            onClick={() => onReact(msg.id, emoji)}
                            className={cn(
                              "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition hover:scale-105",
                              sids.has(localSocketId ?? "")
                                ? "border-[var(--neon-primary)]/50 bg-[var(--neon-primary)]/15"
                                : "border-white/10 bg-white/5 hover:bg-white/10",
                            )}
                          >
                            <span>{emoji}</span>
                            <span className="text-muted-foreground">{sids.size}</span>
                          </button>
                        ) : null,
                      )}
                    </div>
                  )}
                  <AnimatePresence>
                    {hoveredMsgId === msg.id && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className={cn(
                          "flex items-center gap-0.5 mt-0.5",
                          msg.isSelf ? "justify-end" : "justify-start",
                        )}
                      >
                        <div className="relative">
                          <div className="flex items-center gap-0.5 glass rounded-xl border border-white/10 p-0.5 shadow-lg">
                            <button
                              onClick={() => setReplyTo(msg)}
                              className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition"
                              title="Reply"
                            >
                              <Reply className="h-3 w-3" />
                            </button>
                            <button
                              data-emoji-trigger
                              onClick={() =>
                                setEmojiPickerForMsg(emojiPickerForMsg === msg.id ? null : msg.id)
                              }
                              className={cn(
                                "p-1.5 rounded-lg transition",
                                emojiPickerForMsg === msg.id
                                  ? "bg-[var(--neon-primary)]/20 text-[var(--neon-primary)]"
                                  : "hover:bg-white/10 text-muted-foreground hover:text-foreground",
                              )}
                              title="React"
                            >
                              <SmilePlus className="h-3 w-3" />
                            </button>
                          </div>
                          <AnimatePresence>
                            {emojiPickerForMsg === msg.id && (
                              <motion.div
                                data-emoji-picker
                                initial={{ opacity: 0, y: 6, scale: 0.92 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 6, scale: 0.92 }}
                                className={cn(
                                  "absolute bottom-full mb-2 z-30 glass-strong rounded-2xl border border-white/10 p-1.5 shadow-2xl",
                                  msg.isSelf ? "right-0" : "left-0",
                                )}
                              >
                                <div className="flex gap-0.5">
                                  {REACTIONS.map((emoji) => (
                                    <motion.button
                                      key={emoji}
                                      whileHover={{ scale: 1.35, y: -3 }}
                                      whileTap={{ scale: 0.9 }}
                                      onClick={() => {
                                        onReact(msg.id, emoji);
                                        setEmojiPickerForMsg(null);
                                      }}
                                      className="text-lg p-1 rounded-lg hover:bg-white/10"
                                    >
                                      {emoji}
                                    </motion.button>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <AnimatePresence>
          {typingPeers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="flex items-center gap-2 pl-1 mt-3"
            >
              <div className="flex gap-0.5 items-end h-4">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-1 rounded-full bg-[var(--neon-secondary)]"
                    animate={{ height: ["4px", "10px", "4px"] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
              <span className="text-[11px] text-muted-foreground">
                {typingPeers.map((p) => p.username).join(", ")}{" "}
                {typingPeers.length === 1 ? "is" : "are"} typing…
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Reply bar */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-white/5 px-4 py-2 bg-white/3 flex items-start gap-2 shrink-0"
          >
            <CornerDownLeft className="h-3.5 w-3.5 mt-0.5 text-[var(--neon-primary)] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-[var(--neon-primary)]">
                Replying to {replyTo.username}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {replyTo.text.slice(0, 60)}
                {replyTo.text.length > 60 ? "…" : ""}
              </p>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="border-t border-white/5 p-3 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] text-muted-foreground shrink-0">To:</span>
          <div className="relative flex-1">
            <button
              ref={recipientBtnRef}
              onClick={() => setRecipientPickerOpen((v) => !v)}
              className={cn(
                "w-full flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-[11px] transition",
                isPrivateMode
                  ? "border-[var(--neon-accent)]/50 bg-[var(--neon-accent)]/10 text-[var(--neon-accent)]"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/8",
              )}
            >
              <span className="flex items-center gap-1.5">
                {isPrivateMode ? <Lock className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                {recipientLabel}
              </span>
              <ChevronDown
                className={cn("h-3 w-3 transition-transform", recipientPickerOpen && "rotate-180")}
              />
            </button>
            <AnimatePresence>
              {recipientPickerOpen && (
                <motion.div
                  data-recipient-picker
                  initial={{ opacity: 0, y: 4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.97 }}
                  transition={{ type: "spring", damping: 24, stiffness: 320 }}
                  className="absolute bottom-full mb-2 left-0 right-0 z-40 glass-strong rounded-2xl border border-white/10 p-1.5 shadow-2xl"
                >
                  <button
                    onClick={() => {
                      setSelectedRecipients(null);
                      setRecipientPickerOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-left transition",
                      !isPrivateMode
                        ? "bg-[var(--neon-primary)]/15 text-[var(--neon-primary)]"
                        : "hover:bg-white/5 text-muted-foreground",
                    )}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10">
                      <Users className="h-3 w-3" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Everyone</p>
                      <p className="text-[10px] opacity-60">Visible to all participants</p>
                    </div>
                    {!isPrivateMode && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--neon-primary)]" />
                    )}
                  </button>
                  {peers.length > 0 && <div className="my-1 border-t border-white/5" />}
                  {peers.map((peer, i) => {
                    const checked = selectedRecipients?.has(peer.socketId) ?? false;
                    return (
                      <button
                        key={peer.socketId}
                        onClick={() => toggleRecipient(peer.socketId)}
                        className={cn(
                          "w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-left transition",
                          checked
                            ? "bg-[var(--neon-accent)]/10 text-[var(--neon-accent)]"
                            : "hover:bg-white/5 text-muted-foreground",
                        )}
                      >
                        <Avatar name={peer.username} hue={hueForIndex(i)} size={24} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{peer.username}</p>
                          {peer.isHost && <p className="text-[10px] opacity-60">Host</p>}
                        </div>
                        <div
                          className={cn(
                            "h-3.5 w-3.5 rounded border shrink-0 flex items-center justify-center transition",
                            checked
                              ? "bg-[var(--neon-accent)] border-[var(--neon-accent)]"
                              : "border-white/20 bg-transparent",
                          )}
                        >
                          {checked && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                        </div>
                      </button>
                    );
                  })}
                  {isPrivateMode && (
                    <div className="mt-1 pt-1 border-t border-white/5 px-2 pb-1">
                      <p className="text-[10px] text-[var(--neon-accent)]/70 flex items-center gap-1">
                        <Lock className="h-2.5 w-2.5" /> Only selected people will see this message
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div
          className={cn(
            "flex items-center gap-2 rounded-2xl border pl-4 pr-2 py-2 transition focus-within:border-opacity-60",
            isPrivateMode
              ? "border-[var(--neon-accent)]/30 bg-[var(--neon-accent)]/5 focus-within:border-[var(--neon-accent)]/50"
              : "border-white/10 bg-white/5 focus-within:border-[var(--neon-primary)]/40",
          )}
        >
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              onTyping(e.target.value.length > 0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={isPrivateMode ? `Private to ${recipientLabel}…` : "Send a message…"}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSend}
            disabled={!input.trim()}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl transition",
              input.trim()
                ? isPrivateMode
                  ? "bg-gradient-to-br from-[oklch(0.55_0.22_305)] to-[oklch(0.65_0.18_330)] text-white"
                  : "bg-gradient-to-br from-[oklch(0.55_0.22_280)] to-[oklch(0.65_0.18_305)] text-white"
                : "bg-white/5 text-muted-foreground/40 cursor-not-allowed",
            )}
          >
            <Send className="h-3.5 w-3.5" />
          </motion.button>
        </div>
        <p className="mt-1.5 text-[10px] text-center text-muted-foreground/40">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </motion.aside>
  );
}

// ─── Post-meeting modals ──────────────────────────────────────────────────────

function MeetingEndedByHostModal({
  hostUsername,
  onDismiss,
}: {
  hostUsername: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-xl"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[500px] rounded-full opacity-25"
          style={{ background: "radial-gradient(circle, oklch(0.82 0.16 210), transparent 70%)" }}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 32 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 20 }}
        transition={{ type: "spring", damping: 20, stiffness: 280 }}
        className="relative mx-4 w-full max-w-lg"
      >
        <div className="absolute -inset-2 rounded-[2.5rem] bg-gradient-to-br from-[var(--neon-secondary)]/40 via-[var(--neon-primary)]/20 to-[var(--neon-accent)]/30 blur-2xl" />
        <div className="relative overflow-hidden glass-strong rounded-[2rem] border border-[var(--neon-secondary)]/25">
          <div className="h-1 bg-gradient-to-r from-[var(--neon-primary)] via-[var(--neon-secondary)] to-[var(--neon-accent)]" />
          <div className="px-10 pt-10 pb-8 text-center">
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", damping: 14, stiffness: 260, delay: 0.1 }}
              className="mx-auto mb-7 relative flex h-24 w-24 items-center justify-center"
            >
              <div className="relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[oklch(0.55_0.22_210)] to-[oklch(0.45_0.18_260)] shadow-[0_0_50px_-8px_oklch(0.82_0.16_210/0.7)]">
                <PhoneOff className="h-11 w-11 text-white" />
              </div>
            </motion.div>
            <h2 className="text-3xl font-bold text-gradient mb-3 leading-tight">Meeting ended</h2>
            <p className="text-base text-muted-foreground mb-1">This meeting was ended by</p>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--neon-primary)]/30 bg-[var(--neon-primary)]/10 px-5 py-2 mb-8">
              <Crown className="h-4 w-4 text-[var(--neon-primary)]" />
              <span className="text-lg font-semibold text-[var(--neon-primary)]">
                {hostUsername}
              </span>
            </div>
            <div className="mb-8 rounded-2xl border border-white/8 bg-white/4 px-5 py-4 text-sm text-muted-foreground leading-relaxed">
              The host has closed this session for all participants. You can always start or join a
              new meeting from your dashboard.
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onDismiss}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[oklch(0.55_0.22_280)] to-[oklch(0.65_0.18_305)] py-3.5 text-base font-semibold text-white hover:opacity-95 transition"
            >
              Go to dashboard
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function MeetingEndedByYouModal({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-xl"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.82, y: 28 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.88, y: 16 }}
        transition={{ type: "spring", damping: 20, stiffness: 280 }}
        className="relative mx-4 w-full max-w-lg"
      >
        <div className="absolute -inset-2 rounded-[2.5rem] bg-gradient-to-br from-[oklch(0.72_0.22_35)]/35 via-[var(--neon-primary)]/15 to-[var(--neon-accent)]/25 blur-2xl" />
        <div className="relative overflow-hidden glass-strong rounded-[2rem] border border-white/10">
          <div className="h-1 bg-gradient-to-r from-[oklch(0.72_0.22_35)] via-[var(--neon-primary)] to-[var(--neon-accent)] shimmer" />
          <div className="px-10 pt-10 pb-8 text-center">
            <motion.div
              initial={{ scale: 0, y: -20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", damping: 13, stiffness: 280, delay: 0.1 }}
              className="mx-auto mb-7 relative flex h-24 w-24 items-center justify-center"
            >
              <div className="relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[var(--neon-primary)] to-[var(--neon-accent)] shadow-[0_0_60px_-8px_oklch(0.65_0.22_280/0.8)]">
                <CheckCircle2 className="h-11 w-11 text-white" />
              </div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 400 }}
                className="absolute -top-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[oklch(0.72_0.22_35)] border-2 border-[#0b0f19]"
              >
                <Crown className="h-4 w-4 text-white" />
              </motion.div>
            </motion.div>
            <h2 className="text-3xl font-bold text-gradient mb-3">Meeting ended</h2>
            <p className="text-base text-muted-foreground mb-8">
              You have successfully ended this meeting for all participants.
              <br />
              Everyone has been disconnected.
            </p>
            <div className="mb-8 flex items-center justify-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-5 py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-[oklch(0.75_0.18_145)]" />{" "}
                <span>Session closed</span>
              </div>
              <div className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-[var(--neon-secondary)]" />{" "}
                <span>Data secured</span>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onDismiss}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--neon-primary)] to-[var(--neon-accent)] py-3.5 text-base font-semibold text-white hover:opacity-95 transition"
            >
              Go to dashboard
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function YouLeftModal({ onDismiss, onRejoin }: { onDismiss: () => void; onRejoin: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 12000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-xl"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.84, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 12 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        className="relative mx-4 w-full max-w-lg"
      >
        <div className="absolute -inset-2 rounded-[2.5rem] bg-gradient-to-br from-[var(--neon-accent)]/30 via-[var(--neon-primary)]/10 to-[var(--neon-secondary)]/20 blur-2xl" />
        <div className="relative overflow-hidden glass-strong rounded-[2rem] border border-white/10">
          <div className="h-1 bg-gradient-to-r from-[var(--neon-accent)] via-[var(--neon-primary)] to-[var(--neon-secondary)]" />
          <div className="px-10 pt-10 pb-8 text-center">
            <motion.div
              initial={{ scale: 0, rotate: 20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", damping: 14, stiffness: 260, delay: 0.1 }}
              className="mx-auto mb-7 relative flex h-24 w-24 items-center justify-center"
            >
              <div className="relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[var(--neon-accent)] to-[var(--neon-primary)]">
                <motion.span
                  className="text-4xl select-none"
                  animate={{ rotate: [0, 18, -12, 18, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 1.5 }}
                >
                  👋
                </motion.span>
              </div>
            </motion.div>
            <h2 className="text-3xl font-bold text-gradient mb-3">You left the meeting</h2>
            <p className="text-base text-muted-foreground mb-8 leading-relaxed">
              No worries — the meeting is still in progress.
              <br />
              You can rejoin anytime using the same link.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onDismiss}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-semibold text-foreground hover:bg-white/10 transition"
              >
                Dashboard
              </button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={onRejoin}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--neon-accent)] to-[var(--neon-primary)] py-3.5 text-sm font-semibold text-white hover:opacity-95 transition"
              >
                <LogIn className="h-4 w-4" /> Rejoin meeting
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

// ─── Leave Modal ──────────────────────────────────────────────────────────────

function LeaveModal({
  isHost,
  onConfirm,
  onCancel,
}: {
  isHost: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 20 }}
        transition={{ type: "spring", damping: 22, stiffness: 300 }}
        className="relative mx-4 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-r from-[var(--neon-primary)] via-[var(--neon-accent)] to-[var(--neon-danger)] opacity-30 blur-xl" />
        <div className="relative glass-strong rounded-3xl border border-white/10 p-8 text-center">
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[oklch(0.72_0.22_35)] to-[oklch(0.6_0.28_20)] shadow-[0_0_40px_-10px_oklch(0.72_0.22_35/0.8)]"
          >
            <PhoneOff className="h-10 w-10 text-white" />
          </motion.div>
          <h2 className="text-2xl font-bold text-gradient mb-2">
            {isHost ? "End meeting for all?" : "Leave meeting?"}
          </h2>
          <p className="text-sm text-muted-foreground mb-8 max-w-xs mx-auto">
            {isHost
              ? "You are the host. Leaving ends the meeting for everyone."
              : "You can rejoin anytime using the same link."}
          </p>
          <div className="flex gap-3 justify-center">
            <NeonButton variant="outline" onClick={onCancel} className="px-6">
              Stay
            </NeonButton>
            <button
              onClick={onConfirm}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[oklch(0.65_0.25_25)] to-[oklch(0.72_0.22_35)] px-6 py-3 text-sm font-semibold text-white hover:opacity-95 transition"
            >
              <PhoneOff className="h-4 w-4" /> {isHost ? "End meeting" : "Leave"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Host Transfer Modal ──────────────────────────────────────────────────────

function HostTransferModal({
  peer,
  onTransfer,
  onClose,
}: {
  peer: RemotePeer;
  onTransfer: (mode: "full" | "sub") => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: "spring", damping: 24, stiffness: 300 }}
        className="relative mx-4 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative glass-strong rounded-3xl border border-white/10 p-8">
          <div className="flex items-center gap-3 mb-5">
            <Avatar name={peer.username} hue={hueForName(peer.username)} size={48} />
            <div>
              <h2 className="text-xl font-bold text-gradient">Transfer Host</h2>
              <p className="text-xs text-muted-foreground">
                Privileges for <span className="text-foreground font-medium">{peer.username}</span>
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => onTransfer("sub")}
              className="w-full glass rounded-2xl p-4 text-left hover:bg-white/5 transition border border-white/10 hover:border-[var(--neon-secondary)]/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--neon-secondary)]/15 text-[var(--neon-secondary)]">
                  <UserCog className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--neon-secondary)]">Make Co-Host</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Can admit, mute & remove. You keep full control.
                  </p>
                </div>
              </div>
            </button>
            <button
              onClick={() => onTransfer("full")}
              className="w-full glass rounded-2xl p-4 text-left hover:bg-white/5 transition border border-white/10 hover:border-[var(--neon-primary)]/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--neon-primary)]/15 text-[var(--neon-primary)]">
                  <Crown className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--neon-primary)]">Transfer Full Host</h3>
                  <p className="text-[11px] text-muted-foreground">
                    They become sole host. You become a participant.
                  </p>
                </div>
              </div>
            </button>
          </div>
          <NeonButton variant="ghost" className="mt-5 w-full" onClick={onClose}>
            Cancel
          </NeonButton>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Reaction Burst Layer ─────────────────────────────────────────────────────

function ReactionBurstLayer({
  reactions,
}: {
  reactions: Array<{ id: string; emoji: string; username: string; socketId: string }>;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <AnimatePresence>
        {reactions.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 0, scale: 0.4 }}
            animate={{
              opacity: [0, 1, 1, 0],
              y: [0, -120 - Math.random() * 80],
              x: [0, (Math.random() - 0.5) * 60],
              scale: [0.4, 1.2, 1, 0.8],
            }}
            transition={{ duration: 3.5, ease: "easeOut" }}
            className="absolute"
            style={{ bottom: "100px", left: `${20 + (i % 8) * 10}%` }}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl drop-shadow-[0_0_12px_oklch(0.8_0.2_280)]">{r.emoji}</span>
              <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur whitespace-nowrap">
                {r.username}
              </span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function ControlBtn({
  active,
  onClick,
  on,
  off,
  label,
  highlightOn,
  highlightColor,
}: {
  active: boolean;
  onClick: () => void;
  on: React.ReactNode;
  off: React.ReactNode;
  label: string;
  highlightOn?: boolean;
  highlightColor?: string;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      title={label}
      className={cn(
        "flex h-10 w-10 sm:h-12 sm:w-auto sm:px-4 items-center justify-center gap-2 rounded-2xl border transition shrink-0",
        active && !highlightOn && "border-white/10 bg-white/5 text-foreground hover:bg-white/10",
        highlightOn &&
          "border-[var(--neon-primary)] bg-[var(--neon-primary)]/15 text-[var(--neon-primary)] animate-pulse-glow",
        !active &&
          !highlightOn &&
          "border-[oklch(0.72_0.22_35)]/40 bg-[oklch(0.72_0.22_35)]/15 text-[oklch(0.78_0.2_35)]",
      )}
      style={
        highlightOn && highlightColor
          ? {
              borderColor: `${highlightColor}80`,
              backgroundColor: `${highlightColor}18`,
              color: highlightColor,
              boxShadow: `0 0 20px ${highlightColor}40`,
            }
          : undefined
      }
    >
      {active ? on : off}
      <span className="hidden sm:inline text-xs font-medium">{label}</span>
    </motion.button>
  );
}

function AudioBars({ color, small }: { color: string; small?: boolean }) {
  return (
    <span className={cn("flex items-end gap-[2px]", small ? "h-3" : "h-4")}>
      {[0.6, 1, 0.7, 1, 0.5].map((h, i) => (
        <motion.span
          key={i}
          className="rounded-full"
          style={{ width: small ? "2px" : "3px", backgroundColor: color }}
          animate={{ scaleY: [h, 1, h * 0.5, 1, h] }}
          transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.1 }}
        />
      ))}
    </span>
  );
}

function StatusDot({ status }: { status: ParticipantStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.available;
  return (
    <span
      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0B0F19]"
      style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }}
    />
  );
}

function Avatar({ hue, name, size = 40 }: { hue: number; name: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, oklch(0.65 0.22 ${hue}), oklch(0.75 0.18 ${hue + 40}))`,
        boxShadow: `0 0 ${size / 2}px oklch(0.65 0.22 ${hue} / 0.4)`,
        fontSize: size * 0.4,
      }}
    >
      {name
        .split(" ")
        .map((s) => s[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()}
    </div>
  );
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function hueForIndex(i: number): number {
  return [210, 305, 160, 35, 60, 130, 260, 20][i % 8];
}
function hueForName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatDuration(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
