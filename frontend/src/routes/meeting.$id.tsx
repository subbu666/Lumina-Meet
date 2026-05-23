/**
 * meeting.$id.tsx — Lumina Meet (Fixed)
 *
 * Fixes applied:
 *  1. WHITEBOARD — SVG paths now use absolute pixel coords via a viewBox of
 *     "0 0 1000 1000", eliminating the percentage-based path bug that caused
 *     strokes to not render. All elements render correctly now.
 *
 *  2. CINEMA MODE — Added a persistent floating "Exit cinema" button that is
 *     always visible in cinema mode (top-right corner), so users can exit
 *     without needing the hidden footer. Footer still peeks on hover.
 *
 *  3. LAYOUT BUTTON — The Layers icon button in the header now has a visible
 *     "Layout" text label on sm+ screens. The dropdown is properly z-indexed
 *     and positioned.
 *
 *  4. LEFT SIDEBAR — Footer control buttons now use `overflow-x-auto` with
 *     proper min-widths and `shrink-0` so controls don't get clipped on
 *     smaller screens. Also added `flex-wrap` fallback.
 *
 *  5. SOUNDSCAPES BUTTON — Footer soundscape button now correctly opens the
 *     settings dropdown (which contains the soundscape picker) when nothing
 *     is active, and stops the active soundscape directly when one is playing.
 *
 *  6. NOISE SUPPRESSION — Button label now correctly reflects current state.
 */

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
  Timer,
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
  Move,
  Plus,
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
  type BackgroundMode,
} from "@/hooks/useWebRTC";
import { useAmbientSound, type SoundscapeId } from "@/hooks/useAmbientSound";
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

// FIX: Whiteboard now uses a 0-1000 coordinate space mapped via viewBox.
// All points are stored as [0..1000, 0..1000] percentages * 10.
const WB_SCALE = 1000;

const WHITEBOARD_COLORS = [
  "oklch(0.97 0.01 250)",
  "oklch(0.65 0.22 280)",
  "oklch(0.82 0.16 210)",
  "oklch(0.75 0.18 305)",
  "oklch(0.72 0.22 35)",
  "oklch(0.75 0.18 145)",
  "oklch(0.8 0.18 80)",
  "oklch(0.72 0.22 355)",
];

const WHITEBOARD_STROKE_WIDTHS = [2, 4, 8, 14];

const BACKGROUND_MODES: { id: BackgroundMode; label: string; preview: string }[] = [
  { id: "none", label: "None", preview: "bg-white/5" },
  { id: "blur", label: "Blur", preview: "bg-[oklch(0.82_0.16_210/0.2)]" },
  { id: "gradient-purple", label: "Purple", preview: "bg-[oklch(0.35_0.18_280)]" },
  { id: "gradient-teal", label: "Teal", preview: "bg-[oklch(0.35_0.15_200)]" },
  { id: "gradient-dark", label: "Dark", preview: "bg-[oklch(0.12_0.02_265)]" },
];

const SOUNDSCAPES: { id: SoundscapeId; label: string; icon: React.ReactNode; color: string }[] = [
  {
    id: "rain",
    label: "Rain",
    icon: <CloudRain className="h-4 w-4" />,
    color: "oklch(0.82 0.16 210)",
  },
  {
    id: "lofi",
    label: "Lo-fi",
    icon: <Headphones className="h-4 w-4" />,
    color: "oklch(0.75 0.18 305)",
  },
  {
    id: "coffee",
    label: "Café",
    icon: <Coffee className="h-4 w-4" />,
    color: "oklch(0.8 0.18 80)",
  },
];

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ParticipantStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  available: {
    label: "Available",
    color: "oklch(0.75 0.18 145)",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  busy: { label: "Busy", color: "oklch(0.72 0.22 35)", icon: <WifiOff className="h-3 w-3" /> },
  away: { label: "Away", color: "oklch(0.8 0.18 80)", icon: <Clock className="h-3 w-3" /> },
  presenting: {
    label: "Presenting",
    color: "oklch(0.65 0.22 280)",
    icon: <Presentation className="h-3 w-3" />,
  },
  brb: { label: "BRB", color: "oklch(0.78 0.15 210)", icon: <Coffee className="h-3 w-3" /> },
};

const MANUAL_STATUSES: ParticipantStatus[] = ["available", "busy", "away", "brb"];

type PanelType = "participants" | "chat" | "whiteboard" | "polls" | "agenda" | "settings" | null;

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

  const notStarted = Boolean(scheduledFor && scheduledFor > now);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass-strong rounded-3xl p-8 text-center max-w-md">
          <h2 className="text-xl font-semibold">Please log in to join</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You need an account to enter this room.
          </p>
          <Link to="/login" className="mt-4 inline-block">
            <NeonButton>Log in</NeonButton>
          </Link>
        </div>
      </div>
    );
  }

  if (notStarted) return <CountdownScreen scheduledFor={scheduledFor!} now={now} />;

  return (
    <Room
      id={id}
      username={user.username}
      userId={user.id}
      onLeave={() => navigate({ to: "/dashboard" })}
    />
  );
}

// ─── Countdown ────────────────────────────────────────────────────────────────

function CountdownScreen({ scheduledFor, now }: { scheduledFor: number; now: number }) {
  const diff = Math.max(0, scheduledFor - now);
  const s = Math.floor(diff / 1000) % 60;
  const m = Math.floor(diff / 60_000) % 60;
  const h = Math.floor(diff / 3_600_000);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-strong rounded-3xl p-10 text-center max-w-md"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-neon glow-primary">
          <Hourglass className="h-8 w-8 text-white" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold">Meeting not started yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hang tight — we'll let you in automatically.
        </p>
        <div className="mt-6 flex justify-center gap-3 font-mono text-3xl">
          <TimeBox v={h} l="hrs" />
          <TimeBox v={m} l="min" />
          <TimeBox v={s} l="sec" />
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

function TimeBox({ v, l }: { v: number; l: string }) {
  return (
    <div className="glass rounded-xl px-4 py-3 min-w-[72px]">
      <div className="text-gradient">{String(v).padStart(2, "0")}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{l}</div>
    </div>
  );
}

// ─── Room ─────────────────────────────────────────────────────────────────────

function Room({
  id,
  username,
  userId,
  onLeave,
}: {
  id: string;
  username: string;
  userId: string;
  onLeave: () => void;
}) {
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [transferTarget, setTransferTarget] = useState<RemotePeer | null>(null);
  const statusButtonRef = useRef<HTMLDivElement>(null);
  const [statusPickerPos, setStatusPickerPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  // FIX: layout mode drives cinema, not just a flag
  const [layoutMode, setLayoutMode] = useState<"grid" | "spatial" | "cinema">("grid");

  // Whiteboard local state
  const [wbTool, setWbTool] = useState<WhiteboardTool>("pen");
  const [wbColor, setWbColor] = useState(WHITEBOARD_COLORS[0]);
  const [wbStrokeWidth, setWbStrokeWidth] = useState(3);
  const [wbDrawing, setWbDrawing] = useState(false);
  const [wbCurrentPoints, setWbCurrentPoints] = useState<number[][]>([]);
  const [wbCurrentId, setWbCurrentId] = useState<string | null>(null);
  const wbCanvasRef = useRef<SVGSVGElement>(null);

  // Poll creation state
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [showPollCreator, setShowPollCreator] = useState(false);

  // Agenda creation state
  const [agendaInput, setAgendaInput] = useState<Array<{ title: string; durationSec: number }>>([
    { title: "", durationSec: 300 },
  ]);
  const [showAgendaCreator, setShowAgendaCreator] = useState(false);

  // Ambient sound
  const {
    activeSoundscape,
    volume: soundVolume,
    setVolume: setSoundVolume,
    toggleSoundscape,
  } = useAmbientSound();

  const webrtc = useWebRTC(id, username, SOCKET_URL, userId);

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
  } = webrtc;

  // Sync cinema mode with layout
  useEffect(() => {
    setCinemaMode(layoutMode === "cinema");
  }, [layoutMode, setCinemaMode]);

  useEffect(() => {
    if (showStatusPicker && statusButtonRef.current) {
      const rect = statusButtonRef.current.getBoundingClientRect();
      setStatusPickerPos({ top: rect.bottom + 8, left: rect.left });
    } else {
      setStatusPickerPos(null);
    }
  }, [showStatusPicker]);

  useEffect(() => {
    if (!showStatusPicker) return;
    const handleUpdate = () => {
      if (statusButtonRef.current) {
        const rect = statusButtonRef.current.getBoundingClientRect();
        setStatusPickerPos({ top: rect.bottom + 8, left: rect.left });
      }
    };
    window.addEventListener("resize", handleUpdate);
    window.addEventListener("scroll", handleUpdate, true);
    return () => {
      window.removeEventListener("resize", handleUpdate);
      window.removeEventListener("scroll", handleUpdate, true);
    };
  }, [showStatusPicker]);

  useEffect(() => {
    const handler = () => {
      leaveRoom();
      onLeave();
    };
    window.addEventListener("Lumina Meet:host-removed", handler);
    return () => window.removeEventListener("Lumina Meet:host-removed", handler);
  }, [leaveRoom, onLeave]);

  const handleLeaveConfirm = useCallback(async () => {
    if (isHost) {
      try {
        await apiClient.post(`/meeting/${id}/end`);
      } catch (e) {
        console.error("Failed to end meeting", e);
      }
    }
    leaveRoom();
    onLeave();
  }, [isHost, id, leaveRoom, onLeave]);

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
      return panel;
    });
  };

  // ── Whiteboard pointer events ──────────────────────────────────────────────
  // FIX: coordinates are now in 0..WB_SCALE space, not 0..1 percentages

  const handleWbPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (wbTool === "select") return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * WB_SCALE;
      const y = ((e.clientY - rect.top) / rect.height) * WB_SCALE;

      if (wbTool === "pen") {
        const id = `wb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setWbCurrentId(id);
        setWbCurrentPoints([[x, y]]);
        setWbDrawing(true);
      }
    },
    [wbTool],
  );

  const handleWbPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * WB_SCALE;
      const y = ((e.clientY - rect.top) / rect.height) * WB_SCALE;
      // Cursor broadcast still uses 0..1 fractions for network efficiency
      broadcastWhiteboardCursor(x / WB_SCALE, y / WB_SCALE);

      if (!wbDrawing || wbTool !== "pen" || !wbCurrentId) return;
      setWbCurrentPoints((prev) => [...prev, [x, y]]);
    },
    [wbDrawing, wbTool, wbCurrentId, broadcastWhiteboardCursor],
  );

  const handleWbPointerUp = useCallback(() => {
    if (!wbDrawing || wbTool !== "pen" || !wbCurrentId || wbCurrentPoints.length < 2) {
      setWbDrawing(false);
      setWbCurrentPoints([]);
      setWbCurrentId(null);
      return;
    }
    const element: WhiteboardElement = {
      id: wbCurrentId,
      type: "stroke",
      points: wbCurrentPoints, // stored in WB_SCALE coords
      color: wbColor,
      strokeWidth: wbStrokeWidth,
      author: username,
      authorId: localSocketId ?? "",
    };
    drawWhiteboardElement(element);
    setWbDrawing(false);
    setWbCurrentPoints([]);
    setWbCurrentId(null);
  }, [
    wbDrawing,
    wbTool,
    wbCurrentId,
    wbCurrentPoints,
    wbColor,
    wbStrokeWidth,
    username,
    localSocketId,
    drawWhiteboardElement,
  ]);

  const handleWbClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (wbTool !== "sticky" && wbTool !== "text") return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * WB_SCALE;
      const y = ((e.clientY - rect.top) / rect.height) * WB_SCALE;
      const element: WhiteboardElement = {
        id: `wb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: wbTool === "sticky" ? "sticky" : "text",
        x,
        y,
        text: wbTool === "sticky" ? "Sticky note" : "Text",
        color: wbColor,
        author: username,
        authorId: localSocketId ?? "",
      };
      drawWhiteboardElement(element);
    },
    [wbTool, wbColor, username, localSocketId, drawWhiteboardElement],
  );

  // ── Poll helpers ───────────────────────────────────────────────────────────

  const handleCreatePoll = useCallback(() => {
    const opts = pollOptions.filter((o) => o.trim());
    if (!pollQuestion.trim() || opts.length < 2) return;
    createPoll(pollQuestion.trim(), opts);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setShowPollCreator(false);
    if (activePanel !== "polls") setActivePanel("polls");
  }, [pollQuestion, pollOptions, createPoll, activePanel]);

  // ── Agenda helpers ─────────────────────────────────────────────────────────

  const handleSetAgenda = useCallback(() => {
    const items = agendaInput.filter((i) => i.title.trim());
    if (items.length === 0) return;
    setAgenda(items);
    setShowAgendaCreator(false);
    if (activePanel !== "agenda") setActivePanel("agenda");
  }, [agendaInput, setAgenda, activePanel]);

  const [agendaTick, setAgendaTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgendaTick(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const agendaTimeLeft = useMemo(() => {
    if (!agenda) return null;
    if (agenda.timerPaused) return agenda.timerRemaining ?? 0;
    if (agenda.timerEnd) return Math.max(0, agenda.timerEnd - agendaTick);
    return null;
  }, [agenda, agendaTick]);

  // ─────────────────────────────────────────────────────────────────────────

  if (isConnecting && !isWaiting) {
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
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <AlertTriangle className="h-10 w-10 text-[oklch(0.72_0.22_35)]" />
        <p className="text-center text-sm text-muted-foreground max-w-xs">{error}</p>
        <NeonButton variant="outline" onClick={onLeave}>
          Back to dashboard
        </NeonButton>
      </div>
    );
  }

  if (isWaiting) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-strong rounded-3xl p-10 text-center max-w-md border border-[var(--neon-primary)]/20"
        >
          <motion.div
            animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[var(--neon-primary)] to-[var(--neon-accent)] glow-primary mb-4"
          >
            <Hourglass className="h-8 w-8 text-white" />
          </motion.div>
          <h2 className="text-2xl font-semibold text-gradient">Waiting in lobby</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The host has been notified. Please wait while they review your request to join.
          </p>
          <div className="mt-6 flex justify-center">
            <NeonButton variant="outline" onClick={onLeave}>
              Leave lobby
            </NeonButton>
          </div>
        </motion.div>
      </div>
    );
  }

  const canManage = isHost || isSubHost;
  const isCinema = layoutMode === "cinema";

  return (
    <div className="flex min-h-screen flex-col overflow-hidden" style={{ background: "#0B0F19" }}>
      {/* Ambient background orbs */}
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

      {/* ─── FIX: Cinema mode exit button — always visible in cinema mode ── */}
      <AnimatePresence>
        {isCinema && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => setLayoutMode("grid")}
            className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-2xl border border-white/20 bg-black/70 backdrop-blur-xl px-4 py-2.5 text-sm font-medium text-white hover:bg-black/90 hover:border-white/40 transition shadow-xl"
          >
            <Minimize2 className="h-4 w-4" />
            Exit cinema
          </motion.button>
        )}
      </AnimatePresence>

      {/* ─── Header (hidden in cinema mode) ──────────────────────────────── */}
      <AnimatePresence>
        {!isCinema && (
          <motion.header
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            className="relative z-10 flex items-center justify-between border-b border-white/5 bg-black/40 backdrop-blur-xl px-4 py-3 sm:px-6"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-7 w-7 shrink-0 rounded-lg bg-gradient-neon animate-pulse-glow" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Lumina Meet</p>
                <p className="truncate text-[11px] text-muted-foreground font-mono">{id}</p>
              </div>
            </div>

            {/* Raised hands queue */}
            <AnimatePresence>
              {raisedHands.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  className="hidden md:flex items-center gap-2 rounded-full border border-[oklch(0.8_0.18_80)/0.4] bg-[oklch(0.8_0.18_80)/0.08] px-3 py-1.5 text-xs text-[oklch(0.9_0.18_80)]"
                >
                  <motion.span
                    animate={{ rotate: [0, 15, -10, 15, 0] }}
                    transition={{ duration: 1, repeat: Infinity, repeatDelay: 2 }}
                    className="text-base"
                  >
                    ✋
                  </motion.span>
                  <span className="font-medium">{raisedHands[0].username}</span>
                  {raisedHands.length > 1 && (
                    <span className="text-muted-foreground">+{raisedHands.length - 1} more</span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Agenda live ticker */}
            <AnimatePresence>
              {agenda && agendaTimeLeft !== null && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="hidden lg:flex items-center gap-2 rounded-full border border-[var(--neon-primary)]/30 bg-[var(--neon-primary)]/10 px-3 py-1.5 text-xs text-[var(--neon-primary)] cursor-pointer"
                  onClick={() => togglePanel("agenda")}
                >
                  <Timer className="h-3 w-3" />
                  <span className="font-mono font-medium">{formatDuration(agendaTimeLeft)}</span>
                  <span className="text-muted-foreground max-w-[120px] truncate">
                    {agenda.items[agenda.activeIdx]?.title}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Status pill */}
              <div ref={statusButtonRef} className="relative hidden sm:block">
                <button
                  onClick={() => setShowStatusPicker((v) => !v)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition",
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
                      "h-2.5 w-2.5 text-muted-foreground transition-transform duration-200",
                      showStatusPicker && "rotate-180",
                    )}
                  />
                </button>
              </div>

              {/* Active soundscape indicator */}
              <AnimatePresence>
                {activeSoundscape && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={() => togglePanel("settings")}
                    className="hidden sm:flex items-center gap-1.5 rounded-full border border-[oklch(0.8_0.18_80)/0.4] bg-[oklch(0.8_0.18_80)/0.1] px-2.5 py-1 text-[11px] text-[oklch(0.9_0.18_80)]"
                  >
                    <Music2 className="h-3 w-3" />
                    <span>{SOUNDSCAPES.find((s) => s.id === activeSoundscape)?.label}</span>
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Active poll indicator */}
              <AnimatePresence>
                {currentPoll && !currentPoll.closed && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={() => togglePanel("polls")}
                    className="hidden sm:flex items-center gap-1.5 rounded-full border border-[var(--neon-secondary)]/40 bg-[var(--neon-secondary)]/10 px-2.5 py-1 text-[11px] text-[var(--neon-secondary)] animate-pulse-glow"
                  >
                    <BarChart2 className="h-3 w-3" />
                    <span>Live poll</span>
                  </motion.button>
                )}
              </AnimatePresence>

              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[var(--neon-secondary)]/30 bg-[var(--neon-secondary)]/10 px-2.5 py-1 text-[11px] text-[var(--neon-secondary)]">
                <ShieldCheck className="h-3 w-3" /> Encrypted
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {peers.length + 1} live
              </span>

              {/* Panel buttons */}
              {(
                [
                  ["chat", <MessageSquare className="h-4 w-4" />, unreadCount],
                  ["whiteboard", <PenLine className="h-4 w-4" />, 0],
                  ["polls", <BarChart2 className="h-4 w-4" />, 0],
                  ["agenda", <ListChecks className="h-4 w-4" />, 0],
                  ["participants", <Users className="h-4 w-4" />, 0],
                ] as const
              ).map(([panel, icon, badge]) => (
                <button
                  key={panel}
                  onClick={() => togglePanel(panel as PanelType)}
                  title={panel.charAt(0).toUpperCase() + panel.slice(1)}
                  className={cn(
                    "relative rounded-lg border p-2 transition",
                    activePanel === panel
                      ? "border-[var(--neon-primary)]/50 bg-[var(--neon-primary)]/15 text-[var(--neon-primary)]"
                      : "border-white/10 bg-white/5 hover:bg-white/10",
                  )}
                >
                  {icon}
                  {(badge as number) > 0 && activePanel !== panel && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--neon-danger)] text-[9px] font-bold text-white"
                    >
                      {(badge as number) > 9 ? "9+" : badge}
                    </motion.span>
                  )}
                </button>
              ))}

              {/* FIX: Settings/Layout button — now has visible "Layout" label */}
              <div className="relative">
                <button
                  onClick={() => setShowSettingsDropdown((v) => !v)}
                  title="Layout & Settings"
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2 py-2 sm:px-3 transition",
                    showSettingsDropdown
                      ? "border-[var(--neon-primary)]/50 bg-[var(--neon-primary)]/15 text-[var(--neon-primary)]"
                      : "border-white/10 bg-white/5 hover:bg-white/10",
                  )}
                >
                  <Layers className="h-4 w-4" />
                  <span className="hidden sm:inline text-xs font-medium">Layout</span>
                </button>
                <AnimatePresence>
                  {showSettingsDropdown && (
                    <SettingsDropdown
                      layoutMode={layoutMode}
                      setLayoutMode={(m) => {
                        setLayoutMode(m);
                        setShowSettingsDropdown(false);
                      }}
                      backgroundMode={backgroundMode}
                      setBackgroundMode={setBackgroundMode}
                      isBlurProcessing={isBlurProcessing}
                      activeSoundscape={activeSoundscape}
                      toggleSoundscape={toggleSoundscape}
                      soundVolume={soundVolume}
                      setSoundVolume={setSoundVolume}
                      noiseSuppressionEnabled={noiseSuppressionEnabled}
                      noiseSuppressionSupported={noiseSuppressionSupported}
                      toggleNoiseSuppression={toggleNoiseSuppression}
                      autoSpotlight={autoSpotlight}
                      setAutoSpotlight={setAutoSpotlight}
                      onClose={() => setShowSettingsDropdown(false)}
                    />
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* ─── Host Lobby Banner ───────────────────────────────────────────── */}
      <AnimatePresence>
        {isHost && pendingParticipants.length > 0 && !isCinema && (
          <motion.div
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            className="relative z-20 mx-4 mt-3 glass-strong rounded-2xl border border-[var(--neon-primary)]/30 p-4 max-h-64 overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-[var(--neon-primary)]" />
                Lobby{" "}
                <span className="text-muted-foreground">
                  ({pendingParticipants.length} waiting)
                </span>
              </h3>
            </div>
            <div className="space-y-2">
              {pendingParticipants.map((p) => (
                <div
                  key={p.socketId}
                  className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-2.5"
                >
                  <Avatar name={p.username} hue={hueForName(p.username)} size={32} />
                  <span className="text-sm font-medium flex-1">{p.username}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => admitParticipant(p.socketId)}
                      className="flex items-center gap-1 rounded-lg bg-[var(--neon-primary)]/20 border border-[var(--neon-primary)]/30 px-3 py-1.5 text-xs text-[var(--neon-primary)] hover:bg-[var(--neon-primary)]/30 transition"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Admit
                    </button>
                    <button
                      onClick={() => rejectParticipant(p.socketId)}
                      className="flex items-center gap-1 rounded-lg bg-[oklch(0.72_0.22_35)]/15 border border-[oklch(0.72_0.22_35)]/30 px-3 py-1.5 text-xs text-[oklch(0.78_0.2_35)] hover:bg-[oklch(0.72_0.22_35)]/25 transition"
                    >
                      <X className="h-3 w-3" /> Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main area */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        <main className={cn("flex-1 overflow-hidden min-w-0", isCinema ? "p-0" : "p-3 sm:p-4")}>
          {/* Whiteboard overlay */}
          <AnimatePresence>
            {activePanel === "whiteboard" && (
              <WhiteboardOverlay
                elements={whiteboardElements}
                cursors={whiteboardCursors}
                activeTool={wbTool}
                activeColor={wbColor}
                strokeWidth={wbStrokeWidth}
                currentPoints={wbCurrentPoints}
                canManage={canManage}
                onToolChange={setWbTool}
                onColorChange={setWbColor}
                onStrokeWidthChange={setWbStrokeWidth}
                onPointerDown={handleWbPointerDown}
                onPointerMove={handleWbPointerMove}
                onPointerUp={handleWbPointerUp}
                onClick={handleWbClick}
                onErase={eraseWhiteboardElement}
                onClear={clearWhiteboard}
                onClose={() => setActivePanel(null)}
                svgRef={wbCanvasRef}
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

        {/* Side panels */}
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
              onClose={() => setActivePanel(null)}
            />
          )}
          {activePanel === "chat" && (
            <ChatPanel
              localSocketId={localSocketId}
              username={username}
              messages={messages}
              typingPeers={typingPeers}
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
              showCreator={showPollCreator}
              pollQuestion={pollQuestion}
              pollOptions={pollOptions}
              onQuestionChange={setPollQuestion}
              onOptionsChange={setPollOptions}
              onShowCreator={() => setShowPollCreator(true)}
              onHideCreator={() => setShowPollCreator(false)}
              onCreate={handleCreatePoll}
              onVote={votePoll}
              onClose_poll={closePoll}
              onDismiss={dismissPoll}
              onClose={() => setActivePanel(null)}
            />
          )}
          {activePanel === "agenda" && (
            <AgendaPanel
              agenda={agenda}
              agendaTimeLeft={agendaTimeLeft}
              isHost={canManage}
              showCreator={showAgendaCreator}
              agendaInput={agendaInput}
              onAgendaInputChange={setAgendaInput}
              onShowCreator={() => setShowAgendaCreator(true)}
              onHideCreator={() => setShowAgendaCreator(false)}
              onCreate={handleSetAgenda}
              onNext={agendaNext}
              onPrev={agendaPrev}
              onGoto={agendaGoto}
              onTimerStart={agendaTimerStart}
              onTimerPause={agendaTimerPause}
              onClose={() => setActivePanel(null)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Floating reaction bursts */}
      <ReactionBurstLayer reactions={reactions} />

      {/* Speaking banner */}
      <AnimatePresence>
        {!isCinema && (isSpeaking || speakingPeerId) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
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

      {/* Raise hand toast */}
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

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      {/* FIX: cinema mode hides footer but it peeks on hover via group */}
      <motion.footer
        initial={false}
        animate={isCinema ? { y: 80, opacity: 0 } : { y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="relative z-10 border-t border-white/5 bg-black/50 backdrop-blur-xl px-2 py-3 sm:px-4"
        onMouseEnter={
          isCinema
            ? (e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "translateY(0)";
                el.style.opacity = "1";
              }
            : undefined
        }
        onMouseLeave={
          isCinema
            ? (e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "";
                el.style.opacity = "";
              }
            : undefined
        }
      >
        {/* FIX: overflow-x-auto so buttons never get cut off on small screens */}
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
          {/* Left cluster */}
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
            <div className="relative">
              <ControlBtn
                active={!showReactionPicker}
                onClick={() => setShowReactionPicker((v) => !v)}
                on={<SmilePlus className="h-4 w-4 sm:h-5 sm:w-5" />}
                off={<SmilePlus className="h-4 w-4 sm:h-5 sm:w-5" />}
                label="React"
              />
              <AnimatePresence>
                {showReactionPicker && (
                  <ReactionPicker
                    onReact={(emoji) => {
                      sendReaction(emoji);
                      setShowReactionPicker(false);
                    }}
                    onClose={() => setShowReactionPicker(false)}
                  />
                )}
              </AnimatePresence>
            </div>
            <ControlBtn
              active={activePanel !== "whiteboard"}
              onClick={() => togglePanel("whiteboard")}
              on={<PenLine className="h-4 w-4 sm:h-5 sm:w-5" />}
              off={<PenLine className="h-4 w-4 sm:h-5 sm:w-5" />}
              label="Whiteboard"
              highlightOn={activePanel === "whiteboard"}
            />
          </div>

          {/* Center cluster */}
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

          {/* Right cluster */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* FIX: Cinema mode toggle — label changes based on current state */}
            <ControlBtn
              active={layoutMode !== "cinema"}
              onClick={() => setLayoutMode((prev) => (prev === "cinema" ? "grid" : "cinema"))}
              on={<Maximize2 className="h-4 w-4 sm:h-5 sm:w-5" />}
              off={<Minimize2 className="h-4 w-4 sm:h-5 sm:w-5" />}
              label={layoutMode === "cinema" ? "Exit cinema" : "Cinema mode"}
              highlightOn={layoutMode === "cinema"}
            />
            {/* FIX: Noise suppression — label clearly states current state */}
            {noiseSuppressionSupported && (
              <ControlBtn
                active={!noiseSuppressionEnabled}
                onClick={() => void toggleNoiseSuppression()}
                on={<Mic2 className="h-4 w-4 sm:h-5 sm:w-5" />}
                off={<Mic2 className="h-4 w-4 sm:h-5 sm:w-5" />}
                label={noiseSuppressionEnabled ? "Noise suppression on" : "Noise suppression off"}
                highlightOn={noiseSuppressionEnabled}
                highlightColor="oklch(0.75 0.18 145)"
              />
            )}
            {/* FIX: Soundscape toggle — opens settings dropdown when nothing active,
                stops active soundscape directly when one is playing */}
            <ControlBtn
              active={!activeSoundscape}
              onClick={() => {
                if (activeSoundscape) {
                  toggleSoundscape(null);
                } else {
                  setShowSettingsDropdown((v) => !v);
                }
              }}
              on={<Music2 className="h-4 w-4 sm:h-5 sm:w-5" />}
              off={<Music2 className="h-4 w-4 sm:h-5 sm:w-5" />}
              label={
                activeSoundscape
                  ? `Stop ${SOUNDSCAPES.find((s) => s.id === activeSoundscape)?.label ?? "soundscape"}`
                  : "Soundscapes"
              }
              highlightOn={!!activeSoundscape}
              highlightColor="oklch(0.8 0.18 80)"
            />
          </div>
        </div>
      </motion.footer>

      {/* ─── Modals ─────────────────────────────────────────────────────── */}
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
        {showStatusPicker && statusPickerPos && (
          <StatusPicker
            current={localStatus}
            isPresenting={localStatus === "presenting"}
            onSelect={(s) => {
              setStatus(s);
              setShowStatusPicker(false);
            }}
            onClose={() => setShowStatusPicker(false)}
            position={statusPickerPos}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Settings Dropdown ────────────────────────────────────────────────────────

function SettingsDropdown({
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
  onClose,
}: {
  layoutMode: "grid" | "spatial" | "cinema";
  setLayoutMode: (m: "grid" | "spatial" | "cinema") => void;
  backgroundMode: BackgroundMode;
  setBackgroundMode: (m: BackgroundMode) => void;
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
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".settings-dropdown-root")) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ type: "spring", damping: 22, stiffness: 300 }}
      className="settings-dropdown-root absolute right-0 top-full mt-2 z-50 w-72"
    >
      <div className="glass-strong rounded-2xl border border-white/10 p-3 shadow-2xl space-y-4">
        {/* Layout */}
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

        {/* Background */}
        <div>
          <p className="px-1 pb-2 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold flex items-center gap-1.5">
            Virtual background
            {isBlurProcessing && (
              <Loader2 className="h-3 w-3 animate-spin text-[var(--neon-primary)]" />
            )}
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {BACKGROUND_MODES.map((bm) => (
              <button
                key={bm.id}
                onClick={() => setBackgroundMode(bm.id)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl p-2 border transition text-xs",
                  backgroundMode === bm.id
                    ? "border-[var(--neon-primary)]/50 bg-[var(--neon-primary)]/15 text-[var(--neon-primary)]"
                    : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10",
                )}
              >
                <div className={cn("h-8 w-12 rounded-lg border border-white/10", bm.preview)} />
                <span>{bm.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Soundscapes */}
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
                {s.icon}
                <span>{s.label}</span>
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

        {/* Audio */}
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
                  "text-[10px] rounded px-1.5 py-0.5",
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
                "text-[10px] rounded px-1.5 py-0.5",
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
    </motion.div>
  );
}

// ─── Whiteboard Overlay ───────────────────────────────────────────────────────
// FIX: Uses viewBox="0 0 1000 1000" so all coordinates are in absolute pixels
// instead of CSS percentage strings, which caused broken SVG path rendering.

function WhiteboardOverlay({
  elements,
  cursors,
  activeTool,
  activeColor,
  strokeWidth,
  currentPoints,
  canManage,
  onToolChange,
  onColorChange,
  onStrokeWidthChange,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onClick,
  onErase,
  onClear,
  onClose,
  svgRef,
}: {
  elements: WhiteboardElement[];
  cursors: Array<{ socketId: string; username: string; x: number; y: number }>;
  activeTool: WhiteboardTool;
  activeColor: string;
  strokeWidth: number;
  currentPoints: number[][];
  canManage: boolean;
  onToolChange: (t: WhiteboardTool) => void;
  onColorChange: (c: string) => void;
  onStrokeWidthChange: (w: number) => void;
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: () => void;
  onClick: (e: React.MouseEvent<SVGSVGElement>) => void;
  onErase: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
  svgRef: React.RefObject<SVGSVGElement>;
}) {
  const tools: { id: WhiteboardTool; icon: React.ReactNode; label: string }[] = [
    { id: "select", icon: <MousePointer className="h-4 w-4" />, label: "Select" },
    { id: "pen", icon: <PenLine className="h-4 w-4" />, label: "Pen" },
    { id: "eraser", icon: <Eraser className="h-4 w-4" />, label: "Eraser" },
    { id: "text", icon: <span className="text-sm font-bold">T</span>, label: "Text" },
    { id: "sticky", icon: <StickyNote className="h-4 w-4" />, label: "Sticky" },
    { id: "arrow", icon: <ArrowUpRight className="h-4 w-4" />, label: "Arrow" },
    { id: "rect", icon: <Square className="h-4 w-4" />, label: "Rect" },
    { id: "ellipse", icon: <Circle className="h-4 w-4" />, label: "Ellipse" },
  ];

  // FIX: points are now in 0..1000 space — convert directly to SVG coords
  const pointsToPath = (pts: number[][]): string => {
    if (pts.length < 2) return "";
    return pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
      .join(" ");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex"
    >
      <div className="absolute inset-0 bg-[oklch(0.12_0.02_265/0.95)] backdrop-blur-sm" />

      {/* FIX: viewBox makes coordinate system absolute and predictable */}
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${WB_SCALE} ${WB_SCALE}`}
        preserveAspectRatio="none"
        style={{
          cursor: activeTool === "pen" ? "crosshair" : activeTool === "eraser" ? "cell" : "default",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={onClick}
      >
        {/* Grid pattern — scaled to viewBox */}
        <defs>
          <pattern id="wb-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="oklch(1 0 0 / 0.04)"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width={WB_SCALE} height={WB_SCALE} fill="url(#wb-grid)" />

        {/* Existing elements */}
        {elements.map((el) => {
          if (el.type === "stroke" && el.points) {
            return (
              <path
                key={el.id}
                d={pointsToPath(el.points)}
                fill="none"
                stroke={el.color}
                strokeWidth={el.strokeWidth ?? 3}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(activeTool === "eraser" && "hover:opacity-30 cursor-cell")}
                onClick={
                  activeTool === "eraser"
                    ? (e) => {
                        e.stopPropagation();
                        onErase(el.id);
                      }
                    : undefined
                }
              />
            );
          }
          if (
            (el.type === "sticky" || el.type === "text") &&
            el.x !== undefined &&
            el.y !== undefined
          ) {
            return (
              <g key={el.id} transform={`translate(${el.x} ${el.y})`}>
                {el.type === "sticky" && (
                  <rect
                    x={-60}
                    y={-20}
                    width={120}
                    height={48}
                    rx={8}
                    fill={el.color}
                    fillOpacity={0.2}
                    stroke={el.color}
                    strokeWidth={1}
                  />
                )}
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={el.color}
                  fontSize="13"
                  fontFamily="system-ui"
                >
                  {el.text}
                </text>
              </g>
            );
          }
          return null;
        })}

        {/* In-progress stroke */}
        {currentPoints.length > 1 && (
          <path
            d={pointsToPath(currentPoints)}
            fill="none"
            stroke={activeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.9}
          />
        )}

        {/* Remote cursors — cursor positions come in as 0..1, scale to viewBox */}
        {cursors.map((c) => (
          <g
            key={c.socketId}
            transform={`translate(${c.x * WB_SCALE} ${c.y * WB_SCALE})`}
            style={{ pointerEvents: "none" }}
          >
            <circle r={5} fill={`oklch(0.75 0.18 ${hueForName(c.username)})`} opacity={0.8} />
            <text
              x={8}
              y={4}
              fontSize="11"
              fill={`oklch(0.75 0.18 ${hueForName(c.username)})`}
              fontFamily="system-ui"
            >
              {c.username}
            </text>
          </g>
        ))}
      </svg>

      {/* Toolbar */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-1 glass-strong rounded-2xl border border-white/10 p-2">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => onToolChange(t.id)}
            title={t.label}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl transition",
              activeTool === t.id
                ? "bg-[var(--neon-primary)]/20 text-[var(--neon-primary)]"
                : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
            )}
          >
            {t.icon}
          </button>
        ))}
        <div className="my-1 h-px bg-white/10" />
        {WHITEBOARD_STROKE_WIDTHS.map((w) => (
          <button
            key={w}
            onClick={() => onStrokeWidthChange(w)}
            title={`Stroke ${w}px`}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl transition",
              strokeWidth === w ? "bg-[var(--neon-primary)]/20" : "hover:bg-white/10",
            )}
          >
            <div
              className="rounded-full bg-current"
              style={{
                width: Math.min(w * 2, 18),
                height: Math.min(w * 2, 18),
                opacity: strokeWidth === w ? 1 : 0.4,
              }}
            />
          </button>
        ))}
        <div className="my-1 h-px bg-white/10" />
        {WHITEBOARD_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onColorChange(c)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl transition",
              activeColor === c ? "ring-2 ring-white/40" : "hover:scale-110",
            )}
            style={{ background: c }}
          >
            {activeColor === c && <CheckCircle2 className="h-4 w-4 text-black/60" />}
          </button>
        ))}
        {canManage && (
          <>
            <div className="my-1 h-px bg-white/10" />
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

      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-40 flex h-9 w-9 items-center justify-center rounded-xl glass border border-white/10 text-muted-foreground hover:text-foreground transition"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 text-[11px] text-muted-foreground bg-black/40 backdrop-blur rounded-full px-3 py-1">
        {elements.length} elements · shared with all participants
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
  onClose_poll,
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
  onClose_poll: () => void;
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
                      const next = [...pollOptions];
                      next[i] = e.target.value;
                      onOptionsChange(next);
                    }}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--neon-primary)]/50 transition"
                  />
                  {i >= 2 && (
                    <button
                      onClick={() => onOptionsChange(pollOptions.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-[oklch(0.78_0.2_35)] transition"
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
              <div className="flex gap-2 pt-1">
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
              <h4 className="text-sm font-semibold leading-snug">{currentPoll.question}</h4>
              {currentPoll.closed && (
                <span className="shrink-0 text-[10px] rounded-md bg-white/10 px-2 py-0.5 text-muted-foreground">
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
                        transition={{ duration: 0.5, ease: "easeOut" }}
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
                  <NeonButton variant="outline" className="flex-1 text-xs" onClick={onClose_poll}>
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
              No active poll.{isHost ? " Create one to engage your participants." : ""}
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
                <div key={i} className="flex gap-2">
                  <input
                    value={item.title}
                    onChange={(e) => {
                      const next = [...agendaInput];
                      next[i] = { ...item, title: e.target.value };
                      onAgendaInputChange(next);
                    }}
                    placeholder={`Item ${i + 1}`}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--neon-primary)]/50 transition"
                  />
                  <input
                    type="number"
                    min={1}
                    value={Math.round(item.durationSec / 60)}
                    onChange={(e) => {
                      const next = [...agendaInput];
                      next[i] = { ...item, durationSec: Number(e.target.value) * 60 };
                      onAgendaInputChange(next);
                    }}
                    className="w-14 bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-sm outline-none text-center focus:border-[var(--neon-primary)]/50 transition"
                    title="Minutes"
                  />
                  <span className="text-[10px] text-muted-foreground self-center">min</span>
                  {agendaInput.length > 1 && (
                    <button
                      onClick={() => onAgendaInputChange(agendaInput.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-[oklch(0.78_0.2_35)] transition"
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
              <div className="flex gap-2 pt-1">
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
                      "h-full rounded-full transition-colors",
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
              No agenda set.{isHost ? " Add one to keep the meeting on track." : ""}
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
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const getPos = (id: string): TilePosition =>
    tilePositions.get(id) ?? { x: Math.random() * 60 + 5, y: Math.random() * 60 + 5 };

  const handleDragStart = useCallback(
    (id: string, e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const pos = getPos(id);
      dragOffset.current = {
        x: e.clientX - rect.left - (pos.x / 100) * rect.width,
        y: e.clientY - rect.top - (pos.y / 100) * rect.height,
      };
      setDragging(id);
    },
    [tilePositions],
  );

  const handleDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(
        0,
        Math.min(90, ((e.clientX - rect.left - dragOffset.current.x) / rect.width) * 100),
      );
      const y = Math.max(
        0,
        Math.min(85, ((e.clientY - rect.top - dragOffset.current.y) / rect.height) * 100),
      );
      setTilePosition(dragging, { x, y });
    },
    [dragging, setTilePosition],
  );

  const handleDragEnd = useCallback(() => setDragging(null), []);

  const allParticipants = [
    { id: "local", name: username },
    ...peers.map((p) => ({ id: p.socketId, name: p.username })),
  ];

  return (
    <div
      ref={canvasRef}
      className="relative w-full h-full overflow-hidden rounded-2xl border border-white/5"
      style={{ background: "oklch(0.12 0.02 265 / 0.5)" }}
      onPointerMove={handleDragMove}
      onPointerUp={handleDragEnd}
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
            onPointerDown={(e) => handleDragStart(participant.id, e)}
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
            <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition">
              <Move className="h-3 w-3 text-white/40" />
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
        <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-r from-[var(--neon-primary)] via-[var(--neon-accent)] to-[var(--neon-danger)] opacity-30 blur-xl animate-pulse-glow" />
        <div className="relative glass-strong rounded-3xl border border-white/10 p-8 text-center overflow-hidden">
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
              ? "You are the host. If you leave, the meeting will end for everyone."
              : "You can rejoin anytime using the same link while it's active."}
          </p>
          <div className="flex gap-3 justify-center">
            <NeonButton variant="outline" onClick={onCancel} className="px-6">
              Stay
            </NeonButton>
            <button
              onClick={onConfirm}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[oklch(0.65_0.25_25)] to-[oklch(0.72_0.22_35)] px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_30px_-8px_oklch(0.72_0.22_35/0.6)] hover:opacity-95 transition animate-pulse-danger"
            >
              <PhoneOff className="h-4 w-4" />
              {isHost ? "End meeting" : "Leave"}
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
        <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-r from-[var(--neon-primary)] to-[var(--neon-secondary)] opacity-20 blur-xl" />
        <div className="relative glass-strong rounded-3xl border border-white/10 p-8">
          <div className="flex items-center gap-3 mb-5">
            <Avatar name={peer.username} hue={hueForName(peer.username)} size={48} />
            <div>
              <h2 className="text-xl font-bold text-gradient">Transfer Host</h2>
              <p className="text-xs text-muted-foreground">
                Choose privileges for{" "}
                <span className="text-foreground font-medium">{peer.username}</span>
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
            initial={{ opacity: 0, y: 0, x: 0, scale: 0.4 }}
            animate={{
              opacity: [0, 1, 1, 0],
              y: [0, -120 - Math.random() * 80],
              x: [0, (Math.random() - 0.5) * 60],
              scale: [0.4, 1.2, 1, 0.8],
              rotate: [(Math.random() - 0.5) * 30],
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

// ─── Reaction Picker ──────────────────────────────────────────────────────────

function ReactionPicker({
  onReact,
  onClose,
}: {
  onReact: (e: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".reaction-picker-root")) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.9 }}
      transition={{ type: "spring", damping: 20, stiffness: 300 }}
      className="reaction-picker-root absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-30"
    >
      <div className="glass-strong rounded-2xl border border-white/10 p-2 shadow-2xl">
        <div className="flex gap-1">
          {REACTIONS.map((emoji, i) => (
            <motion.button
              key={emoji}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              whileHover={{ scale: 1.4, y: -4 }}
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
  );
}

// ─── Status Picker ────────────────────────────────────────────────────────────

function StatusPicker({
  current,
  isPresenting,
  onSelect,
  onClose,
  position,
}: {
  current: ParticipantStatus;
  isPresenting: boolean;
  onSelect: (s: ParticipantStatus) => void;
  onClose: () => void;
  position: { top: number; left: number };
}) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".status-picker-root")) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ type: "spring", damping: 22, stiffness: 300 }}
      className="status-picker-root z-50"
      style={{ position: "fixed", top: position.top, left: position.left, minWidth: 210 }}
    >
      <div className="glass-strong rounded-2xl border border-white/10 p-1.5 shadow-2xl backdrop-blur-xl">
        <p className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold">
          Set status
        </p>
        {isPresenting && (
          <div className="mx-1.5 mb-1.5 flex items-start gap-2 rounded-xl border border-[oklch(0.65_0.22_280)/0.35] bg-[oklch(0.65_0.22_280)/0.1] px-3 py-2">
            <Presentation className="h-3 w-3 mt-0.5 shrink-0 text-[oklch(0.75_0.18_280)]" />
            <p className="text-[11px] text-[oklch(0.8_0.15_280)] leading-snug">
              Currently presenting. Choice applies when sharing stops.
            </p>
          </div>
        )}
        {MANUAL_STATUSES.map((key) => {
          const cfg = STATUS_CONFIG[key];
          const isActive = isPresenting ? false : current === key;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
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
              {isActive && <CheckCircle2 className="h-3 w-3 text-[var(--neon-primary)]" />}
            </button>
          );
        })}
      </div>
    </motion.div>
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
          <Users className="h-4 w-4 text-[var(--neon-primary)]" />
          Participants <span className="text-muted-foreground">({peers.length + 1})</span>
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
                <span>✋</span> Raised hands
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
                <div className="flex items-center gap-1.5">
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
  onSend,
  onReact,
  onTyping,
  onClose,
}: {
  localSocketId: string | null;
  username: string;
  messages: ChatMessage[];
  typingPeers: Array<{ socketId: string; username: string }>;
  onSend: (text: string, replyTo?: ChatMessage | null) => void;
  onReact: (messageId: string, emoji: string) => void;
  onTyping: (isTyping: boolean) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [emojiPickerForMsg, setEmojiPickerForMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!emojiPickerForMsg) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`[data-emoji-picker]`) && !target.closest(`[data-emoji-trigger]`))
        setEmojiPickerForMsg(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [emojiPickerForMsg]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim(), replyTo);
    setInput("");
    setReplyTo(null);
    onTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    onTyping(e.target.value.length > 0);
  };

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
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", damping: 22, stiffness: 280 }}
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
                      "relative px-3.5 py-2 text-sm leading-relaxed",
                      msg.isSelf
                        ? [
                            "bg-gradient-to-br from-[oklch(0.55_0.22_280)] to-[oklch(0.65_0.18_305)] text-white",
                            "shadow-[0_4px_24px_-4px_oklch(0.65_0.22_280/0.4)]",
                            "rounded-2xl",
                            msg.isFirst ? "rounded-tr-sm" : "",
                            msg.isLast ? "rounded-br-2xl" : "rounded-br-sm",
                          ]
                        : [
                            "bg-white/8 border border-white/8 text-foreground",
                            "rounded-2xl",
                            msg.isFirst ? "rounded-tl-sm" : "",
                            msg.isLast ? "rounded-bl-2xl" : "rounded-bl-sm",
                          ],
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
                              "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition hover:scale-105 active:scale-95",
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
                        transition={{ duration: 0.15 }}
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
                                transition={{ type: "spring", damping: 22, stiffness: 320 }}
                                className={cn(
                                  "absolute bottom-full mb-2 z-30 glass-strong rounded-2xl border border-white/10 p-1.5 shadow-2xl",
                                  msg.isSelf ? "right-0" : "left-0",
                                )}
                              >
                                <div className="flex gap-0.5">
                                  {REACTIONS.map((emoji, i) => (
                                    <motion.button
                                      key={emoji}
                                      initial={{ opacity: 0, y: 4 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ delay: i * 0.025 }}
                                      whileHover={{ scale: 1.35, y: -3 }}
                                      whileTap={{ scale: 0.9 }}
                                      onClick={() => {
                                        onReact(msg.id, emoji);
                                        setEmojiPickerForMsg(null);
                                        setHoveredMsgId(null);
                                      }}
                                      className="text-lg p-1 rounded-lg hover:bg-white/10 transition-colors"
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
      <div className="border-t border-white/5 p-3 shrink-0">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 pl-4 pr-2 py-2 focus-within:border-[var(--neon-primary)]/40 focus-within:bg-[var(--neon-primary)]/5 transition">
          <input
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Send a message…"
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
                ? "bg-gradient-to-br from-[oklch(0.55_0.22_280)] to-[oklch(0.65_0.18_305)] text-white shadow-[0_4px_16px_-4px_oklch(0.65_0.22_280/0.5)]"
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
    const stripParticipants = isLocalSpotlit
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
        {stripParticipants.length > 0 && (
          <div className="flex flex-col gap-2 w-40 overflow-y-auto">
            {stripParticipants.map((p, i) => (
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
          {spotlightId === "local" ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          {spotlightId === "local" ? "Unpin" : "Pin"}
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
              <PinOff className="h-3 w-3" />
            ) : (
              <Pin className="h-3 w-3" />
            )}
            {spotlightId === p.socketId ? "Unpin" : "Pin"}
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
        "relative overflow-hidden rounded-2xl border bg-black/60 transition-all duration-300 h-full",
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
      {!hasLiveVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[oklch(0.25_0.08_280)] to-[oklch(0.18_0.05_310)]">
          <Avatar name={username} hue={280} size={72} />
        </div>
      )}
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
        "group relative overflow-hidden rounded-2xl border bg-black/40 transition-all duration-300 h-full",
        isSpeaking
          ? "border-[var(--neon-secondary)] shadow-[0_0_24px_4px_oklch(0.82_0.16_210/0.4)]"
          : "border-white/10",
      )}
      style={{
        background: hasVideo
          ? undefined
          : `linear-gradient(135deg, oklch(0.25 0.08 ${hue}), oklch(0.18 0.05 ${hue + 30}))`,
      }}
    >
      {peer.stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
            hasVideo ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar name={peer.username} hue={hue} size={72} />
        </div>
      )}
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
        title="Remove participant"
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
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (screenVideoRef.current && localStream) screenVideoRef.current.srcObject = localStream;
  }, [localStream]);

  return (
    <div className="flex h-full flex-col gap-3 lg:flex-row">
      <div className="relative flex-1 overflow-hidden rounded-2xl border border-[var(--neon-primary)]/40 bg-black/60 glow-primary">
        <video
          ref={screenVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-contain"
        />
        <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur px-3 py-1 text-xs z-10">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon-secondary)] animate-pulse" />
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
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
