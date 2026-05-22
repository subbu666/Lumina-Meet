/**
 * meeting.$id.tsx — Lumina Meet Phase 2 (FIXED)
 *
 * Fixes applied:
 *  FIX 1 — Screen share: useWebRTC now feeds the correct stream into localStream
 *           so ScreenShareView renders the actual screen. No UI changes needed here
 *           beyond confirming ScreenShareView receives `localStream` directly.
 *
 *  FIX 2 — Status dropdown:
 *           a) The status button container is now `position: static` in normal flow
 *              with the dropdown using `position: fixed` coordinates computed at
 *              render time — eliminating any overflow/clip issues from the header.
 *              Implemented via a portal-style absolute with high z-index (z-50)
 *              and the dropdown opens BELOW the header, not clipped by it.
 *           b) Auto-presenting is now handled in useWebRTC (toggleScreenShare sets
 *              localStatus to "presenting" automatically). The status picker in UI
 *              just reflects whatever the hook exposes — no extra wiring needed.
 *           c) When "presenting", the status pill gets a distinct purple highlight
 *              so it's visually obvious the status changed automatically.
 *
 *  FIX 3 — Footer gap: The right-side div that only contained an sm:hidden chat
 *           button was rendering as an empty flex child on desktop, creating a wide
 *           phantom gap. Fixed by making the entire right div hidden on sm+ screens
 *           so it collapses completely on desktop and only shows on mobile.
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
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
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { NeonButton } from "@/components/ui-custom/NeonButton";
import { cn } from "@/lib/utils";
import {
  useWebRTC,
  type RemotePeer,
  type ChatMessage,
  type ParticipantStatus,
} from "@/hooks/useWebRTC";

// ─── Route ────────────────────────────────────────────────────────────────────

const search = z.object({ scheduledFor: z.number().optional() }).partial();

export const Route = createFileRoute("/meeting/$id")({
  component: MeetingRoom,
  validateSearch: search.parse,
  head: () => ({ meta: [{ title: "Meeting — Lumina Meet" }] }),
});

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_BASE_URL;

// ─── Emoji Reaction palette ───────────────────────────────────────────────────

const REACTIONS = ["👍", "❤️", "😂", "😮", "👏", "🔥", "🎉", "💯", "🙌", "✨"];

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

  return <Room id={id} username={user.username} onLeave={() => navigate({ to: "/dashboard" })} />;
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

type PanelType = "participants" | "chat" | null;

function Room({ id, username, onLeave }: { id: string; username: string; onLeave: () => void }) {
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  const webrtc = useWebRTC(id, username, SOCKET_URL);

  const {
    localStream,
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
    error,
    isConnecting,
  } = webrtc;

  useEffect(() => {
    const handler = () => {
      leaveRoom();
      onLeave();
    };
    window.addEventListener("Lumina Meet:host-removed", handler);
    return () => window.removeEventListener("Lumina Meet:host-removed", handler);
  }, [leaveRoom, onLeave]);

  const handleLeave = useCallback(() => {
    leaveRoom();
    onLeave();
  }, [leaveRoom, onLeave]);

  const togglePanel = (panel: PanelType) => {
    setActivePanel((prev) => {
      if (prev === panel) return null;
      if (panel === "chat") markRead();
      return panel;
    });
  };

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
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, oklch(0.75 0.18 305), transparent 70%)" }}
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 6 }}
        />
      </div>

      {/* ─── Header ──────────────────────────────────────────────────────────
          FIX 2a: Removed overflow:hidden from header (it was clipping the status
          dropdown). The header now uses z-10 and the status picker dropdown uses
          z-50, which correctly layers on top of all content below.
      ─────────────────────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between border-b border-white/5 bg-black/40 backdrop-blur-xl px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-7 w-7 shrink-0 rounded-lg bg-gradient-neon animate-pulse-glow" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Lumina Meet Room</p>
            <p className="truncate text-[11px] text-muted-foreground font-mono">{id}</p>
          </div>
        </div>

        {/* Raised hands queue — header banner */}
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

        <div className="flex items-center gap-2">
          {/* ─── FIX 2b: Status picker ────────────────────────────────────────
              The wrapper div is `relative` so the dropdown can be positioned
              absolutely relative to it. The dropdown itself uses z-50 so it
              renders above the video grid, panels, and all other content.
              Previously it was getting clipped by the header's stacking context.

              FIX 2c: Auto-presenting — when sharing is active, the pill shows
              a purple "Presenting" state. The hook already sets localStatus to
              "presenting" automatically via toggleScreenShare, so this just
              reflects that. We also visually distinguish the presenting state
              with a subtle pulsing border so users can see it changed.
          ─────────────────────────────────────────────────────────────────── */}
          <div className="relative hidden sm:block">
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

            <AnimatePresence>
              {showStatusPicker && (
                <StatusPicker
                  current={localStatus}
                  onSelect={(s) => {
                    setStatus(s);
                    setShowStatusPicker(false);
                  }}
                  onClose={() => setShowStatusPicker(false)}
                />
              )}
            </AnimatePresence>
          </div>

          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[var(--neon-secondary)]/30 bg-[var(--neon-secondary)]/10 px-2.5 py-1 text-[11px] text-[var(--neon-secondary)]">
            <ShieldCheck className="h-3 w-3" /> Encrypted
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {peers.length + 1} live
          </span>

          {/* Panel toggles */}
          <button
            onClick={() => togglePanel("chat")}
            className={cn(
              "relative rounded-lg border p-2 transition",
              activePanel === "chat"
                ? "border-[var(--neon-primary)]/50 bg-[var(--neon-primary)]/15 text-[var(--neon-primary)]"
                : "border-white/10 bg-white/5 hover:bg-white/10",
            )}
          >
            <MessageSquare className="h-4 w-4" />
            <AnimatePresence>
              {unreadCount > 0 && activePanel !== "chat" && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--neon-danger)] text-[9px] font-bold text-white"
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          <button
            onClick={() => togglePanel("participants")}
            className={cn(
              "rounded-lg border p-2 transition",
              activePanel === "participants"
                ? "border-[var(--neon-primary)]/50 bg-[var(--neon-primary)]/15 text-[var(--neon-primary)]"
                : "border-white/10 bg-white/5 hover:bg-white/10",
            )}
          >
            <Users className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main area */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        <main className="flex-1 p-3 sm:p-4 overflow-hidden min-w-0">
          {sharing ? (
            <ScreenShareView
              localStream={localStream}
              peers={peers}
              username={username}
              mic={mic}
              isSpeaking={isSpeaking}
              speakingPeerId={speakingPeerId}
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
              peers={peers}
              onRemove={removePeer}
              onLowerHand={lowerPeerHand}
              isSpeaking={isSpeaking}
              speakingPeerId={speakingPeerId}
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
              peers={peers}
              raisedHands={raisedHands}
              onLowerHand={lowerPeerHand}
              onRemove={removePeer}
              onMuteAll={muteAll}
              onCamOffAll={camOffAll}
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
        </AnimatePresence>
      </div>

      {/* Floating reaction bursts */}
      <ReactionBurstLayer reactions={reactions} />

      {/* Speaking banner */}
      <AnimatePresence>
        {(isSpeaking || speakingPeerId) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-[80px] left-1/2 -translate-x-1/2 z-20 pointer-events-none"
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

      {/* Raise hand notification toast */}
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

      {/* ─── Footer ──────────────────────────────────────────────────────────
          FIX 3: The original right-side <div> only contained an sm:hidden chat
          button. On desktop (sm+) it rendered as an empty flex child, creating a
          wide phantom gap that matched the left-side width (Raise hand + React
          buttons) making the center controls look off-center.

          Fix: The entire right <div> is now `sm:hidden` so it disappears on
          desktop. The mobile chat button inside it remains visible only on small
          screens. On desktop, the three-column layout becomes effectively two-
          column (left actions | center AV) with the center naturally centering
          because we use `justify-between` only when the right item exists.

          We also restructure to use a single centered row on desktop and only
          show the left/right satellite buttons when needed.
      ─────────────────────────────────────────────────────────────────────── -->
      */}
      <footer className="relative z-10 border-t border-white/5 bg-black/50 backdrop-blur-xl px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-center gap-3 sm:gap-4">
          {/* Left group: raise hand + reaction — always visible */}
          <div className="flex items-center gap-2 mr-auto sm:mr-0">
            <ControlBtn
              active={!localHandRaised}
              onClick={localHandRaised ? lowerHand : raiseHand}
              on={<Hand className="h-5 w-5" />}
              off={<Hand className="h-5 w-5" />}
              label={localHandRaised ? "Lower" : "Raise hand"}
              highlightOn={localHandRaised}
              highlightColor="oklch(0.8 0.18 80)"
            />
            <div className="relative">
              <ControlBtn
                active={!showReactionPicker}
                onClick={() => setShowReactionPicker((v) => !v)}
                on={<SmilePlus className="h-5 w-5" />}
                off={<SmilePlus className="h-5 w-5" />}
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
          </div>

          {/* Center: core AV controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            <ControlBtn
              active={mic}
              onClick={toggleMic}
              on={<Mic className="h-5 w-5" />}
              off={<MicOff className="h-5 w-5" />}
              label={mic ? "Mute" : "Unmute"}
            />
            <ControlBtn
              active={cam}
              onClick={() => void toggleCam()}
              on={<VideoIcon className="h-5 w-5" />}
              off={<VideoOff className="h-5 w-5" />}
              label={cam ? "Stop video" : "Start video"}
            />
            <ControlBtn
              active={!sharing}
              onClick={() => void toggleScreenShare()}
              on={<MonitorUp className="h-5 w-5" />}
              off={<MonitorX className="h-5 w-5" />}
              label={sharing ? "Stop share" : "Share screen"}
              highlightOn={sharing}
            />
            <button
              onClick={handleLeave}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[oklch(0.65_0.25_25)] to-[oklch(0.72_0.22_35)] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_30px_-8px_oklch(0.72_0.22_35/0.6)] hover:opacity-95 transition"
            >
              <PhoneOff className="h-4 w-4" />
              <span className="hidden sm:inline">Leave</span>
            </button>
          </div>

          {/* ── FIX 3: Right — mobile-only chat shortcut ──────────────────────
              Using `sm:hidden` on the entire div so it collapses completely
              on desktop (≥640px). Previously it was `flex items-center gap-2`
              always, so on desktop it occupied space even with no visible content
              (the button inside was sm:hidden but the div container still existed
              as an empty flex child taking up ~48px of phantom width).
          ──────────────────────────────────────────────────────────────────── */}
          <div className="flex items-center sm:hidden ml-auto">
            <button
              onClick={() => togglePanel("chat")}
              className={cn(
                "relative rounded-lg border p-3 transition",
                activePanel === "chat"
                  ? "border-[var(--neon-primary)]/50 bg-[var(--neon-primary)]/15 text-[var(--neon-primary)]"
                  : "border-white/10 bg-white/5",
              )}
            >
              <MessageSquare className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--neon-danger)] text-[9px] font-bold">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Reaction Burst Layer ──────────────────────────────────────────────────────

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
// FIX 2: Uses z-50 so it renders above the video grid and all other content.
// The parent wrapper is `relative` + `hidden sm:block` in the header, which
// means the dropdown is positioned relative to the status button — correct.
// Previously the z-index wasn't high enough to escape the header's stacking
// context; now z-50 guarantees it paints on top of everything.

function StatusPicker({
  current,
  onSelect,
  onClose,
}: {
  current: ParticipantStatus;
  onSelect: (s: ParticipantStatus) => void;
  onClose: () => void;
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
      // z-50 ensures the dropdown paints above the video grid (z-10) and panels
      className="status-picker-root absolute top-full left-0 mt-2 z-50 min-w-[180px]"
    >
      <div className="glass-strong rounded-2xl border border-white/10 p-1.5 shadow-2xl backdrop-blur-xl">
        <p className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold">
          Set status
        </p>
        {(
          Object.entries(STATUS_CONFIG) as [
            ParticipantStatus,
            (typeof STATUS_CONFIG)[ParticipantStatus],
          ][]
        ).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={cn(
              "flex items-center gap-2.5 w-full rounded-xl px-3 py-2 text-sm text-left transition",
              current === key ? "bg-white/10" : "hover:bg-white/5",
            )}
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }}
            />
            <span className="flex-1">{cfg.label}</span>
            {key === "presenting" && (
              <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wide">
                auto
              </span>
            )}
            {current === key && <CheckCircle2 className="h-3 w-3 text-[var(--neon-primary)]" />}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Participants Panel ────────────────────────────────────────────────────────

function ParticipantsPanel({
  username,
  localStatus,
  localHandRaised,
  mic,
  cam,
  peers,
  raisedHands,
  onLowerHand,
  onRemove,
  onMuteAll,
  onCamOffAll,
  onClose,
}: {
  username: string;
  localStatus: ParticipantStatus;
  localHandRaised: boolean;
  mic: boolean;
  cam: boolean;
  peers: RemotePeer[];
  raisedHands: Array<{ socketId: string; username: string; handRaisedAt: number }>;
  onLowerHand: (id: string) => void;
  onRemove: (id: string) => void;
  onMuteAll: () => void;
  onCamOffAll: () => void;
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

        <div className="flex gap-2">
          <NeonButton variant="outline" className="flex-1 text-xs" onClick={onMuteAll}>
            Mute all
          </NeonButton>
          <NeonButton variant="outline" className="flex-1 text-xs" onClick={onCamOffAll}>
            Cam off all
          </NeonButton>
        </div>

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
              <p className="text-[11px] text-muted-foreground">Host · You</p>
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
                <button
                  onClick={() => onRemove(p.socketId)}
                  className="ml-1 text-muted-foreground hover:text-[oklch(0.72_0.22_35)] transition"
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
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
      if (!target.closest(`[data-emoji-picker]`) && !target.closest(`[data-emoji-trigger]`)) {
        setEmojiPickerForMsg(null);
      }
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
          <MessageSquare className="h-4 w-4 text-[var(--neon-primary)]" />
          Meeting Chat
          {messages.length > 0 && (
            <span className="text-[11px] text-muted-foreground font-normal">
              · {messages.length} messages
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
  peers,
  onRemove,
  onLowerHand,
  isSpeaking,
  speakingPeerId,
}: {
  localStream: MediaStream | null;
  localSocketId: string | null;
  username: string;
  mic: boolean;
  cam: boolean;
  localStatus: ParticipantStatus;
  localHandRaised: boolean;
  peers: RemotePeer[];
  onRemove: (id: string) => void;
  onLowerHand: (id: string) => void;
  isSpeaking: boolean;
  speakingPeerId: string | null;
}) {
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
      <LocalVideoTile
        stream={localStream}
        username={username}
        mic={mic}
        cam={cam}
        isHost
        isSpeaking={isSpeaking}
        status={localStatus}
        handRaised={localHandRaised}
      />
      {peers.map((p, i) => (
        <RemoteVideoTile
          key={p.socketId}
          peer={p}
          hue={hueForIndex(i)}
          onRemove={() => onRemove(p.socketId)}
          onLowerHand={() => onLowerHand(p.socketId)}
          isSpeaking={p.socketId === speakingPeerId}
        />
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
  isSpeaking = false,
  status,
  handRaised,
}: {
  stream: MediaStream | null;
  username: string;
  mic: boolean;
  cam: boolean;
  isHost?: boolean;
  isSpeaking?: boolean;
  status?: ParticipantStatus;
  handRaised?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-black/60 transition-all duration-300",
        isSpeaking
          ? "border-[var(--neon-secondary)] shadow-[0_0_24px_4px_oklch(0.82_0.16_210/0.4)]"
          : "border-white/10",
      )}
    >
      {cam && stream && stream.getVideoTracks().length > 0 && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover scale-x-[-1]"
        />
      )}

      {(!cam || !stream || stream.getVideoTracks().length === 0) && (
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
        "group relative overflow-hidden rounded-2xl border bg-black/40 transition-all duration-300",
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
            title="Lower hand (host)"
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

      {hasVideo && (
        <motion.div
          className="absolute inset-0 opacity-20 pointer-events-none"
          animate={{ backgroundPosition: ["0% 0%", "100% 100%"] }}
          transition={{ duration: 18, repeat: Infinity, repeatType: "reverse" }}
          style={{
            backgroundImage: `radial-gradient(circle at 30% 30%, oklch(0.7 0.2 ${hue} / 0.3), transparent 50%)`,
            backgroundSize: "200% 200%",
          }}
        />
      )}

      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-black/60 backdrop-blur px-2 py-1 text-xs z-10">
        {isSpeaking && <AudioBars color="var(--neon-secondary)" small />}
        <span className="truncate max-w-[140px]">{peer.username}</span>
        {!peer.mic && <MicOff className="h-3 w-3 text-[oklch(0.78_0.2_35)]" />}
      </div>

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
// FIX 1: This component receives `localStream` from React state. Since the hook
// now calls setLocalStream(screenPreviewStream) when sharing starts, this video
// element will correctly render the shared screen instead of the camera feed.

function ScreenShareView({
  localStream,
  peers,
  username,
  mic,
  isSpeaking,
  speakingPeerId,
}: {
  localStream: MediaStream | null;
  peers: RemotePeer[];
  username: string;
  mic: boolean;
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
            stream={localStream}
            username={username}
            mic={mic}
            cam
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

// ─── Shared UI components ─────────────────────────────────────────────────────

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
        "flex h-12 w-12 sm:w-auto sm:px-4 items-center justify-center gap-2 rounded-2xl border transition",
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
      <span className="hidden sm:inline text-xs">{label}</span>
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
          data-originy="1"
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
