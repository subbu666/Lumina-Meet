/**
 * useWebRTC — Lumina Meet
 *
 * CHANGES IN THIS VERSION (PreJoinLobby integration):
 *
 * NEW — Pre-acquired stream support:
 *   Accepts three new optional parameters:
 *     initialStream?: MediaStream | null
 *     initialMic?: boolean
 *     initialCam?: boolean
 *
 *   When initialStream is provided (from PreJoinLobby), the hook skips the
 *   getUserMedia call entirely and uses the handed-off stream directly.
 *   This means the camera LED never flashes twice and device permissions are
 *   only requested once — in the pre-join screen.
 *
 *   initialMic / initialCam seed the mic/cam state so the footer controls
 *   already reflect whatever the user set in the pre-join lobby.
 *
 * All other behaviour is unchanged from the previous version.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useNoiseSuppression } from "./useNoiseSuppression";
import { useBackgroundBlur, type BackgroundMode } from "./useBackgroundBlur";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ParticipantStatus = "available" | "busy" | "away" | "presenting" | "brb";

export interface RemotePeer {
  socketId: string;
  username: string;
  stream: MediaStream | null;
  audioStream: MediaStream | null;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  speaking: boolean;
  status: ParticipantStatus;
  handRaised: boolean;
  handRaisedAt: number | null;
  isHost: boolean;
  isSubHost: boolean;
}

export interface ChatMessage {
  id: string;
  socketId: string;
  username: string;
  text: string;
  timestamp: number;
  replyTo: { id: string; username: string; text: string } | null;
  reactions: Record<string, Set<string>>;
  recipients: string[] | null;
  isPrivate: boolean;
}

export interface ReactionEvent {
  id: string;
  socketId: string;
  username: string;
  emoji: string;
  timestamp: number;
}

export interface TypingPeer {
  socketId: string;
  username: string;
}

export interface PendingParticipant {
  socketId: string;
  username: string;
  userId?: string;
}

export type WhiteboardTool =
  | "pen"
  | "eraser"
  | "text"
  | "sticky"
  | "arrow"
  | "rect"
  | "ellipse"
  | "select";
export type WhiteboardColor = string;

export interface WhiteboardElement {
  id: string;
  type: "stroke" | "text" | "sticky" | "arrow" | "rect" | "ellipse";
  points?: number[][];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  color: string;
  strokeWidth?: number;
  author: string;
  authorId: string;
}

export interface WhiteboardCursor {
  socketId: string;
  username: string;
  x: number;
  y: number;
}

export interface Poll {
  id: string;
  question: string;
  options: string[];
  votes: Record<number, number>;
  totalVoters: number;
  closed: boolean;
  myVote?: number;
}

export interface AgendaItem {
  id: string;
  title: string;
  durationSec: number;
  done: boolean;
}

export interface AgendaState {
  items: AgendaItem[];
  activeIdx: number;
  timerEnd: number | null;
  timerPaused: boolean;
  timerRemaining: number | null;
}

export interface TilePosition {
  x: number;
  y: number;
}

export interface MeetingEndedInfo {
  hostUsername: string;
}

export interface HostPermissionRequest {
  type: "mic" | "cam" | "both";
  fromSocketId: string;
  fromUsername: string;
}

export interface UseWebRTCReturn {
  localStream: MediaStream | null;
  localCameraStream: MediaStream | null;
  localSocketId: string | null;
  mic: boolean;
  cam: boolean;
  sharing: boolean;
  peers: RemotePeer[];
  toggleMic: () => void;
  toggleCam: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  leaveRoom: () => void;
  endMeetingForAll: () => void;
  muteAll: () => void;
  camOffAll: () => void;
  removePeer: (socketId: string) => void;
  isSpeaking: boolean;
  speakingPeerId: string | null;
  messages: ChatMessage[];
  typingPeers: TypingPeer[];
  sendChatMessage: (
    text: string,
    replyTo?: ChatMessage | null,
    recipients?: string[] | null,
  ) => void;
  sendChatReaction: (messageId: string, emoji: string) => void;
  setTyping: (isTyping: boolean) => void;
  unreadCount: number;
  markRead: () => void;
  localStatus: ParticipantStatus;
  setStatus: (status: ParticipantStatus) => void;
  localHandRaised: boolean;
  raiseHand: () => void;
  lowerHand: () => void;
  lowerPeerHand: (socketId: string) => void;
  raisedHands: Array<{ socketId: string; username: string; handRaisedAt: number }>;
  reactions: ReactionEvent[];
  sendReaction: (emoji: string) => void;
  isHost: boolean;
  isSubHost: boolean;
  isWaiting: boolean;
  pendingParticipants: PendingParticipant[];
  admitParticipant: (socketId: string) => void;
  rejectParticipant: (socketId: string) => void;
  transferHost: (socketId: string, mode: "full" | "sub") => void;
  error: string | null;
  isConnecting: boolean;
  whiteboardElements: WhiteboardElement[];
  whiteboardCursors: WhiteboardCursor[];
  drawWhiteboardElement: (element: WhiteboardElement) => void;
  eraseWhiteboardElement: (elementId: string) => void;
  clearWhiteboard: () => void;
  syncWhiteboardElements: (elements: WhiteboardElement[]) => void;
  broadcastWhiteboardCursor: (x: number, y: number) => void;
  currentPoll: Poll | null;
  createPoll: (question: string, options: string[]) => void;
  votePoll: (optionIndex: number) => void;
  closePoll: () => void;
  dismissPoll: () => void;
  agenda: AgendaState | null;
  setAgenda: (items: Array<{ title: string; durationSec: number }>) => void;
  agendaNext: () => void;
  agendaPrev: () => void;
  agendaGoto: (index: number) => void;
  agendaTimerStart: () => void;
  agendaTimerPause: () => void;
  noiseSuppressionEnabled: boolean;
  noiseSuppressionSupported: boolean;
  toggleNoiseSuppression: () => Promise<void>;
  backgroundMode: BackgroundMode;
  setBackgroundMode: (mode: BackgroundMode) => void;
  isBlurProcessing: boolean;
  tilePositions: Map<string, TilePosition>;
  setTilePosition: (id: string, pos: TilePosition) => void;
  cinemaMode: boolean;
  setCinemaMode: (v: boolean) => void;
  spotlightId: string | null;
  setSpotlightId: (id: string | null) => void;
  autoSpotlight: boolean;
  setAutoSpotlight: (v: boolean) => void;
  activeSpotlightId: string | null;
  lobbyKnockCount: number;
  clearLobbyKnockCount: () => void;
  socketRef: React.MutableRefObject<Socket | null>;
  requestMicOn: (socketId: string) => void;
  requestCamOn: (socketId: string) => void;
  requestMicCamOn: (socketId: string) => void;
  hostPermissionRequest: HostPermissionRequest | null;
  respondToPermissionRequest: (accepted: boolean) => void;
}

// ─── ICE servers ──────────────────────────────────────────────────────────────

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const VAD_THRESHOLD = 18;
const VAD_POLL_MS = 80;
const VAD_SILENCE_MS = 600;
const REACTION_LIFETIME_MS = 4000;
const TYPING_DEBOUNCE_MS = 1500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createBlackVideoTrack(width = 640, height = 480): MediaStreamTrack {
  const canvas = Object.assign(document.createElement("canvas"), { width, height });
  canvas.getContext("2d")?.fillRect(0, 0, width, height);
  const stream: MediaStream = (canvas as any).captureStream(0);
  return stream.getVideoTracks()[0];
}

function getRmsVolume(analyser: AnalyserNode): number {
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length) * 255;
}

function buildAnalyser(ctx: AudioContext, stream: MediaStream): AnalyserNode | null {
  const tracks = stream.getAudioTracks();
  if (!tracks.length) return null;
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.3;
  source.connect(analyser);
  return analyser;
}

function playLobbyKnockSound(): void {
  try {
    const ctx = new AudioContext();
    [0, 0.18].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 440;
      osc.type = "sine";
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.35, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.2);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {
    // AudioContext not available
  }
}

// ─── Audio element pool ───────────────────────────────────────────────────────

const audioElements = new Map<string, HTMLAudioElement>();

function createAudioElement(socketId: string, stream: MediaStream): HTMLAudioElement {
  if (audioElements.has(socketId)) {
    const el = audioElements.get(socketId)!;
    el.srcObject = stream;
    return el;
  }
  const audio = document.createElement("audio");
  audio.autoplay = true;
  audio.setAttribute("playsinline", "");
  audio.muted = false;
  audio.style.cssText = "position:absolute;width:0;height:0;opacity:0;pointer-events:none;";
  audio.srcObject = stream;
  document.body.appendChild(audio);
  audioElements.set(socketId, audio);

  audio.play().catch(() => {
    const retry = () => {
      audio.play().catch(() => {});
      document.removeEventListener("click", retry);
      document.removeEventListener("touchstart", retry);
    };
    document.addEventListener("click", retry, { once: true });
    document.addEventListener("touchstart", retry, { once: true });
  });
  return audio;
}

function removeAudioElement(socketId: string) {
  const el = audioElements.get(socketId);
  if (el) {
    el.srcObject = null;
    el.pause();
    el.remove();
    audioElements.delete(socketId);
  }
}

function cleanupAllAudioElements() {
  audioElements.forEach((el) => {
    el.srcObject = null;
    el.pause();
    el.remove();
  });
  audioElements.clear();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWebRTC(
  roomId: string,
  username: string,
  socketUrl: string,
  userId?: string,
  onMeetingEndedWithInfo?: (info: MeetingEndedInfo) => void,
  onYouLeft?: () => void,
  /**
   * NEW — Pre-acquired stream from PreJoinLobby.
   * When provided, useWebRTC skips getUserMedia entirely.
   */
  initialStream?: MediaStream | null,
  /**
   * NEW — Initial mic state from PreJoinLobby toggle.
   * Seeds the mic state so the footer reflects the user's pre-join choice.
   */
  initialMic?: boolean,
  /**
   * NEW — Initial cam state from PreJoinLobby toggle.
   * Seeds the cam state so the footer reflects the user's pre-join choice.
   */
  initialCam?: boolean,
): UseWebRTCReturn {
  // ── Core state ─────────────────────────────────────────────────────────────
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<RemotePeer[]>([]);
  // ▼ CHANGED: seed mic/cam from initialMic / initialCam (default true)
  const [mic, setMic] = useState(initialMic ?? true);
  const [cam, setCam] = useState(initialCam ?? true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [localSocketId, setLocalSocketId] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingPeerId, setSpeakingPeerId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingPeers, setTypingPeers] = useState<TypingPeer[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [localStatus, setLocalStatus] = useState<ParticipantStatus>("available");
  const [localHandRaised, setLocalHandRaised] = useState(false);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);

  const [isHost, setIsHost] = useState(false);
  const [isSubHost, setIsSubHost] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [pendingParticipants, setPendingParticipants] = useState<PendingParticipant[]>([]);
  const [lobbyKnockCount, setLobbyKnockCount] = useState(0);

  const [whiteboardElements, setWhiteboardElements] = useState<WhiteboardElement[]>([]);
  const [whiteboardCursors, setWhiteboardCursors] = useState<WhiteboardCursor[]>([]);
  const [currentPoll, setCurrentPoll] = useState<Poll | null>(null);
  const [agenda, setAgendaState] = useState<AgendaState | null>(null);
  const [tilePositions, setTilePositionsState] = useState<Map<string, TilePosition>>(new Map());
  const [cinemaMode, setCinemaMode] = useState(false);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [autoSpotlight, setAutoSpotlight] = useState(false);

  const [hostPermissionRequest, setHostPermissionRequest] = useState<HostPermissionRequest | null>(
    null,
  );
  const pendingPermissionRef = useRef<HostPermissionRequest | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const socketRef = useRef<Socket | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remoteAnalysers = useRef<Map<string, AnalyserNode>>(new Map());
  const localSpeakingDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const chatOpenRef = useRef(false);
  const prevStatusRef = useRef<ParticipantStatus>("available");
  const sharingRef = useRef(false);
  const myVoteRef = useRef<number | undefined>(undefined);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const onMeetingEndedWithInfoRef = useRef(onMeetingEndedWithInfo);
  const onYouLeftRef = useRef(onYouLeft);
  useEffect(() => {
    onMeetingEndedWithInfoRef.current = onMeetingEndedWithInfo;
  }, [onMeetingEndedWithInfo]);
  useEffect(() => {
    onYouLeftRef.current = onYouLeft;
  }, [onYouLeft]);

  useEffect(() => {
    sharingRef.current = sharing;
  }, [sharing]);

  const { noiseSuppressionEnabled, noiseSuppressionSupported, toggleNoiseSuppression } =
    useNoiseSuppression(cameraStreamRef, pcsRef);

  const {
    backgroundMode,
    setBackgroundMode,
    isProcessing: isBlurProcessing,
  } = useBackgroundBlur(cameraStreamRef, pcsRef, localVideoRef);

  const updatePeer = useCallback((socketId: string, patch: Partial<RemotePeer>) => {
    setPeers((prev) => prev.map((p) => (p.socketId === socketId ? { ...p, ...patch } : p)));
  }, []);

  const createPC = useCallback(
    (remoteSocketId: string, remoteUsername: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        sdpSemantics: "unified-plan" as any,
      });

      const stream = cameraStreamRef.current;
      if (stream) stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = ({ candidate }) => {
        if (candidate && socketRef.current)
          socketRef.current.emit("ice-candidate", { to: remoteSocketId, candidate });
      };

      const videoStream = new MediaStream();
      const audioStream = new MediaStream();

      pc.ontrack = ({ track }) => {
        if (track.kind === "video") {
          videoStream.addTrack(track);
          updatePeer(remoteSocketId, { stream: videoStream });
        } else if (track.kind === "audio") {
          audioStream.addTrack(track);
          updatePeer(remoteSocketId, { audioStream });
          createAudioElement(remoteSocketId, audioStream);
          if (audioCtxRef.current) {
            const analyser = buildAnalyser(audioCtxRef.current, audioStream);
            if (analyser) remoteAnalysers.current.set(remoteSocketId, analyser);
          }
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") pc.restartIce();
      };

      pcsRef.current.set(remoteSocketId, pc);

      setPeers((prev) => {
        if (prev.some((p) => p.socketId === remoteSocketId)) return prev;
        return [
          ...prev,
          {
            socketId: remoteSocketId,
            username: remoteUsername,
            stream: null,
            audioStream: null,
            mic: true,
            cam: true,
            screen: false,
            speaking: false,
            status: "available",
            handRaised: false,
            handRaisedAt: null,
            isHost: false,
            isSubHost: false,
          },
        ];
      });

      return pc;
    },
    [updatePeer],
  );

  const closePC = useCallback((socketId: string) => {
    const pc = pcsRef.current.get(socketId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      pcsRef.current.delete(socketId);
    }
    remoteAnalysers.current.delete(socketId);
    removeAudioElement(socketId);
    setPeers((prev) => prev.filter((p) => p.socketId !== socketId));
  }, []);

  // ── Main effect ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !username) return;
    let cancelled = false;

    const init = async () => {
      let stream: MediaStream;

      // ▼ CHANGED: use pre-acquired stream if provided, otherwise getUserMedia
      if (initialStream) {
        stream = initialStream;
        // Honour mic/cam state set in the pre-join lobby
        stream.getAudioTracks().forEach((t) => {
          t.enabled = initialMic ?? true;
        });
        // If cam was disabled in pre-join, video tracks were already stopped;
        // if enabled, they are live. Nothing extra needed.
      } else {
        // Original acquisition path (unchanged)
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000,
              channelCount: 1,
            },
          });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
              video: false,
            });
          } catch {
            stream = new MediaStream();
          }
        }
      }

      if (cancelled) {
        // Only stop if we acquired the stream ourselves
        if (!initialStream) stream.getTracks().forEach((t) => t.stop());
        return;
      }

      cameraStreamRef.current = stream;
      localStreamRef.current = stream;
      setLocalStream(stream);
      setLocalCameraStream(stream);

      // ── VAD ──
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const localAnalyser = buildAnalyser(audioCtx, stream);
      localAnalyserRef.current = localAnalyser;

      if (localAnalyser) {
        let silenceTimer: ReturnType<typeof setTimeout> | null = null;
        vadTimerRef.current = setInterval(() => {
          const vol = getRmsVolume(localAnalyser);
          if (vol > VAD_THRESHOLD) {
            setIsSpeaking(true);
            if (silenceTimer) {
              clearTimeout(silenceTimer);
              silenceTimer = null;
            }
          } else if (!silenceTimer) {
            silenceTimer = setTimeout(() => {
              setIsSpeaking(false);
              silenceTimer = null;
            }, VAD_SILENCE_MS);
          }
        }, VAD_POLL_MS);
      }

      const socket = io(socketUrl, {
        transports: ["websocket", "polling"],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
      socketRef.current = socket;

      // Expose for recording module
      (window as any).__luminaSocket = socket;

      socket.on("connect", () => {
        if (cancelled) return;
        setLocalSocketId(socket.id ?? null);
        socket.emit("join-room", { roomId, username, userId });
      });

      socket.on("connect_error", (err) => {
        setError(`Connection failed: ${err.message}`);
        setIsConnecting(false);
      });

      socket.on("join-error", ({ message }: { message: string }) => {
        setError(message);
        setIsConnecting(false);
        setIsWaiting(false);
      });

      const remoteVadTimer = setInterval(() => {
        let loudestId: string | null = null;
        let loudestVol = VAD_THRESHOLD;
        remoteAnalysers.current.forEach((analyser, sid) => {
          const vol = getRmsVolume(analyser);
          if (vol > loudestVol) {
            loudestVol = vol;
            loudestId = sid;
          }
        });
        setSpeakingPeerId(loudestId);
        setPeers((prev) => prev.map((p) => ({ ...p, speaking: p.socketId === loudestId })));
      }, VAD_POLL_MS);

      // ── Signaling ──────────────────────────────────────────────────────────

      socket.on("room-peers", async (existingPeers: any[]) => {
        setIsConnecting(false);
        for (const peer of existingPeers) {
          const pc = createPC(peer.socketId, peer.username);
          updatePeer(peer.socketId, {
            status: peer.status ?? "available",
            handRaised: peer.handRaised ?? false,
            handRaisedAt: peer.handRaisedAt ?? null,
            isHost: peer.isHost ?? false,
            isSubHost: peer.isSubHost ?? false,
          });
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("offer", { to: peer.socketId, offer });
        }
      });

      socket.on("user-joined", (data: any) => {
        setPeers((prev) => {
          if (prev.some((p) => p.socketId === data.socketId)) return prev;
          return [
            ...prev,
            {
              socketId: data.socketId,
              username: data.username,
              stream: null,
              audioStream: null,
              mic: data.mic ?? true,
              cam: data.cam ?? true,
              screen: false,
              speaking: false,
              status: data.status ?? "available",
              handRaised: data.handRaised ?? false,
              handRaisedAt: null,
              isHost: data.isHost ?? false,
              isSubHost: data.isSubHost ?? false,
            },
          ];
        });
      });

      socket.on("offer", async ({ from, username: uname, offer }: any) => {
        const pc = createPC(from, uname);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { to: from, answer });
      });

      socket.on("answer", async ({ from, answer }: any) => {
        const pc = pcsRef.current.get(from);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
      });

      socket.on("ice-candidate", async ({ from, candidate }: any) => {
        const pc = pcsRef.current.get(from);
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.warn("[ICE] Failed", e);
          }
        }
      });

      socket.on("peer-media-state", ({ socketId, mic: pMic, cam: pCam, screen: pScreen }: any) => {
        updatePeer(socketId, {
          ...(pMic !== undefined && { mic: pMic }),
          ...(pCam !== undefined && { cam: pCam }),
          ...(pScreen !== undefined && { screen: pScreen }),
          ...(pScreen === true && { status: "presenting" as ParticipantStatus }),
          ...(pScreen === false && { status: "available" as ParticipantStatus }),
        });
      });

      socket.on("user-left", ({ socketId }: any) => {
        closePC(socketId);
        setTypingPeers((prev) => prev.filter((p) => p.socketId !== socketId));
        setTilePositionsState((prev) => {
          const next = new Map(prev);
          next.delete(socketId);
          return next;
        });
        setWhiteboardCursors((prev) => prev.filter((c) => c.socketId !== socketId));
        setPendingParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
      });

      socket.on(
        "meeting-ended",
        ({ reason, hostUsername }: { reason: string; hostUsername: string }) => {
          cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
          screenStreamRef.current?.getTracks().forEach((t) => t.stop());
          pcsRef.current.forEach((pc) => pc.close());
          pcsRef.current.clear();
          cleanupAllAudioElements();
          socket.disconnect();
          onMeetingEndedWithInfoRef.current?.({ hostUsername });
          window.dispatchEvent(
            new CustomEvent("LuminaMeet:meeting-ended", { detail: { reason, hostUsername } }),
          );
        },
      );

      socket.on("you-left", () => {
        cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        pcsRef.current.forEach((pc) => pc.close());
        pcsRef.current.clear();
        cleanupAllAudioElements();
        onYouLeftRef.current?.();
      });

      socket.on("host-action", ({ action }: any) => {
        const camStream = cameraStreamRef.current;
        if (action === "mute") {
          camStream?.getAudioTracks().forEach((t) => {
            t.enabled = false;
          });
          setMic(false);
          socket.emit("media-state", { mic: false });
        }
        if (action === "cam-off") {
          camStream?.getVideoTracks().forEach((t) => {
            t.enabled = false;
          });
          setCam(false);
          socket.emit("media-state", { cam: false });
        }
        if (action === "lower-hand") setLocalHandRaised(false);
        if (action === "remove") window.dispatchEvent(new CustomEvent("Lumina Meet:host-removed"));
      });

      socket.on("host-permission-request", (req: HostPermissionRequest) => {
        pendingPermissionRef.current = req;
        setHostPermissionRequest(req);
      });

      socket.on(
        "permission-response-result",
        ({ fromSocketId, fromUsername, type, accepted }: any) => {
          window.dispatchEvent(
            new CustomEvent("LuminaMeet:permission-result", {
              detail: { fromSocketId, fromUsername, type, accepted },
            }),
          );
        },
      );

      socket.on("waiting", () => {
        setIsConnecting(false);
        setIsWaiting(true);
      });
      socket.on("admitted", () => {
        setIsWaiting(false);
        setIsConnecting(false);
      });

      socket.on("join-request", (data: PendingParticipant) => {
        setPendingParticipants((prev) => {
          if (prev.some((p) => p.socketId === data.socketId)) return prev;
          return [...prev, data];
        });
      });

      socket.on("lobby-knock", ({ username: knocker }: { socketId: string; username: string }) => {
        playLobbyKnockSound();
        setLobbyKnockCount((n) => n + 1);
      });

      socket.on("lobby-admitted", ({ socketId: admittedId }: { socketId: string }) => {
        setPendingParticipants((prev) => prev.filter((p) => p.socketId !== admittedId));
      });

      socket.on("lobby-rejected", ({ socketId: rejectedId }: { socketId: string }) => {
        setPendingParticipants((prev) => prev.filter((p) => p.socketId !== rejectedId));
      });

      socket.on("join-rejected", ({ reason }: any) => {
        setError(reason ?? "Your request to join was declined.");
        setIsWaiting(false);
        setIsConnecting(false);
      });

      socket.on("you-are-host", () => {
        setIsHost(true);
        setIsSubHost(false);
        setIsConnecting(false);
      });
      socket.on("you-are-subhost", () => {
        setIsSubHost(true);
        setIsConnecting(false);
      });
      socket.on("you-are-participant", () => {
        setIsHost(false);
        setIsSubHost(false);
      });

      socket.on("host-transferred", (data: any) => {
        if (data.mode === "full") {
          if (data.newHostSocketId === socket.id) {
            setIsHost(true);
            setIsSubHost(false);
          } else if (data.oldHostSocketId === socket.id) {
            setIsHost(false);
            setIsSubHost(false);
          }
          setPeers((prev) =>
            prev.map((p) => ({
              ...p,
              isHost: p.socketId === data.newHostSocketId,
              isSubHost: p.socketId === data.newHostSocketId ? false : p.isSubHost,
            })),
          );
        } else if (data.mode === "sub" && data.targetSocketId) {
          if (data.targetSocketId === socket.id) setIsSubHost(true);
          setPeers((prev) =>
            prev.map((p) => (p.socketId === data.targetSocketId ? { ...p, isSubHost: true } : p)),
          );
        }
      });

      socket.on("chat-history", (history: any[]) => {
        setMessages(history.map((m) => ({ ...m, reactions: {} })));
      });

      socket.on("chat-message", (msg: any) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [
            ...prev,
            {
              ...msg,
              reactions: {},
              isPrivate: msg.isPrivate ?? false,
              recipients: msg.recipients ?? null,
            },
          ];
        });
        if (!chatOpenRef.current && msg.socketId !== socket.id) {
          setUnreadCount((n) => n + 1);
        }
        setTypingPeers((prev) => prev.filter((p) => p.socketId !== msg.socketId));
      });

      socket.on("chat-reaction", ({ messageId, emoji, socketId: sid }: any) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            const newReactions = { ...m.reactions };
            if (!newReactions[emoji]) newReactions[emoji] = new Set();
            const clone = new Set(newReactions[emoji]);
            if (clone.has(sid)) clone.delete(sid);
            else clone.add(sid);
            newReactions[emoji] = clone;
            return { ...m, reactions: newReactions };
          }),
        );
      });

      socket.on("chat-typing", ({ socketId: sid, username: uname, isTyping }: any) => {
        setTypingPeers((prev) => {
          if (isTyping) {
            if (prev.some((p) => p.socketId === sid)) return prev;
            return [...prev, { socketId: sid, username: uname }];
          }
          return prev.filter((p) => p.socketId !== sid);
        });
      });

      socket.on("peer-status", ({ socketId: sid, status }: any) => updatePeer(sid, { status }));
      socket.on("hand-raised", ({ socketId: sid, handRaisedAt }: any) =>
        updatePeer(sid, { handRaised: true, handRaisedAt }),
      );
      socket.on("hand-lowered", ({ socketId: sid }: any) =>
        updatePeer(sid, { handRaised: false, handRaisedAt: null }),
      );

      socket.on("reaction", (event: ReactionEvent) => {
        setReactions((prev) => [...prev, event]);
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== event.id));
        }, REACTION_LIFETIME_MS);
      });

      // ── Whiteboard ─────────────────────────────────────────────────────────
      socket.on("whiteboard-state", (elements: WhiteboardElement[]) => {
        setWhiteboardElements(elements ?? []);
      });
      socket.on("whiteboard-draw", ({ element }: any) => {
        setWhiteboardElements((prev) => {
          const idx = prev.findIndex((e) => e.id === element.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = element;
            return next;
          }
          return [...prev, element];
        });
      });
      socket.on("whiteboard-erase", ({ elementId }: any) => {
        setWhiteboardElements((prev) => prev.filter((e) => e.id !== elementId));
      });
      socket.on("whiteboard-clear", () => setWhiteboardElements([]));
      socket.on("whiteboard-cursor", (cursor: WhiteboardCursor) => {
        setWhiteboardCursors((prev) => {
          const idx = prev.findIndex((c) => c.socketId === cursor.socketId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = cursor;
            return next;
          }
          return [...prev, cursor];
        });
        setTimeout(() => {
          setWhiteboardCursors((prev) =>
            prev.filter(
              (c) => c.socketId !== cursor.socketId || c.x !== cursor.x || c.y !== cursor.y,
            ),
          );
        }, 3000);
      });

      // ── Polls ──────────────────────────────────────────────────────────────
      socket.on("poll-state", (poll: any) => {
        setCurrentPoll({ ...poll, myVote: myVoteRef.current });
      });
      socket.on("poll-update", ({ id, votes, totalVoters }: any) => {
        setCurrentPoll((prev) => (prev && prev.id === id ? { ...prev, votes, totalVoters } : prev));
      });
      socket.on("poll-closed", ({ id, votes }: any) => {
        setCurrentPoll((prev) =>
          prev && prev.id === id ? { ...prev, closed: true, votes } : prev,
        );
      });
      socket.on("poll-dismissed", () => {
        setCurrentPoll(null);
        myVoteRef.current = undefined;
      });

      // ── Agenda ─────────────────────────────────────────────────────────────
      socket.on("agenda-state", (state: AgendaState) => setAgendaState(state));
      socket.on("agenda-tick", (state: AgendaState) => setAgendaState(state));
      socket.on("agenda-complete", () => setAgendaState(null));

      return () => {
        clearInterval(remoteVadTimer);
      };
    };

    let cleanupFn: (() => void) | undefined;
    init()
      .then((fn) => {
        cleanupFn = fn;
      })
      .catch((err) => {
        console.error("[WebRTC] init error", err);
        setError("Failed to start video. Please check browser permissions.");
        setIsConnecting(false);
      });

    return () => {
      cancelled = true;
      cleanupFn?.();
      pcsRef.current.forEach((pc) => pc.close());
      pcsRef.current.clear();
      // ▼ CHANGED: only stop tracks if we own the stream (no initialStream hand-off)
      if (!initialStream) {
        cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      }
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      socketRef.current?.disconnect();
      cleanupAllAudioElements();
      if (vadTimerRef.current) clearInterval(vadTimerRef.current);
      if (localSpeakingDebounce.current) clearTimeout(localSpeakingDebounce.current);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      remoteAnalysers.current.clear();
      audioCtxRef.current?.close();
      (window as any).__luminaSocket = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, username, socketUrl, userId]);

  // ── Controls ───────────────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    const stream = cameraStreamRef.current;
    if (!stream) return;
    const next = !mic;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
    setMic(next);
    socketRef.current?.emit("media-state", { mic: next });
  }, [mic]);

  const toggleCam = useCallback(async () => {
    const stream = cameraStreamRef.current;
    if (!stream) return;

    if (cam) {
      stream.getVideoTracks().forEach((t) => {
        t.stop();
        stream.removeTrack(t);
      });
      pcsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) sender.replaceTrack(createBlackVideoTrack());
      });
      const updatedCamStream = new MediaStream(stream.getTracks());
      cameraStreamRef.current = updatedCamStream;
      setLocalCameraStream(updatedCamStream);
      if (!sharingRef.current) {
        localStreamRef.current = updatedCamStream;
        setLocalStream(updatedCamStream);
      }
      setCam(false);
      socketRef.current?.emit("media-state", { cam: false });
    } else {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        });
        const newVideoTrack = newStream.getVideoTracks()[0];
        if (!newVideoTrack) return;
        stream.getVideoTracks().forEach((t) => {
          t.stop();
          stream.removeTrack(t);
        });
        stream.addTrack(newVideoTrack);
        if (!sharingRef.current) {
          pcsRef.current.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === "video");
            if (sender) sender.replaceTrack(newVideoTrack);
            else pc.addTrack(newVideoTrack, stream);
          });
        }
        const updatedCamStream = new MediaStream(stream.getTracks());
        cameraStreamRef.current = updatedCamStream;
        setLocalCameraStream(updatedCamStream);
        if (!sharingRef.current) {
          localStreamRef.current = updatedCamStream;
          setLocalStream(updatedCamStream);
        }
        setCam(true);
        socketRef.current?.emit("media-state", { cam: true });
      } catch (err) {
        console.error("[WebRTC] Failed to re-acquire camera", err);
      }
    }
  }, [cam]);

  const _stopSharingCleanup = useCallback(() => {
    const socket = socketRef.current;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    const camTrack = cameraStreamRef.current?.getVideoTracks()[0];
    if (camTrack) {
      pcsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) sender.replaceTrack(camTrack);
      });
    }
    if (cameraStreamRef.current) {
      const restoredStream = new MediaStream(cameraStreamRef.current.getTracks());
      localStreamRef.current = restoredStream;
      setLocalStream(restoredStream);
    }
    setSharing(false);
    socket?.emit("media-state", { screen: false });
    const restored = prevStatusRef.current;
    setLocalStatus(restored);
    socket?.emit("status-update", { status: restored });
  }, []);

  const toggleScreenShare = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) return;
    if (sharingRef.current) {
      _stopSharingCleanup();
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30, max: 60 } },
          audio: false,
        });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        pcsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) sender.replaceTrack(screenTrack);
        });
        const audioTracks = cameraStreamRef.current?.getAudioTracks() ?? [];
        const screenPreviewStream = new MediaStream([screenTrack, ...audioTracks]);
        localStreamRef.current = screenPreviewStream;
        setLocalStream(screenPreviewStream);
        setSharing(true);
        socket.emit("media-state", { screen: true });
        setLocalStatus((currentStatus) => {
          if (currentStatus !== "presenting") prevStatusRef.current = currentStatus;
          return "presenting";
        });
        socket.emit("status-update", { status: "presenting" });
        screenTrack.onended = () => {
          _stopSharingCleanup();
        };
      } catch (err) {
        console.warn("[WebRTC] Screen share cancelled or denied", err);
      }
    }
  }, [_stopSharingCleanup]);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit("leave-room");
    setTimeout(() => {
      socketRef.current?.disconnect();
    }, 150);
  }, []);

  const endMeetingForAll = useCallback(() => {
    socketRef.current?.emit("end-meeting");
  }, []);

  const muteAll = useCallback(() => {
    peers.forEach((p) =>
      socketRef.current?.emit("host-action", { action: "mute", targetSocketId: p.socketId }),
    );
  }, [peers]);

  const camOffAll = useCallback(() => {
    peers.forEach((p) =>
      socketRef.current?.emit("host-action", { action: "cam-off", targetSocketId: p.socketId }),
    );
  }, [peers]);

  const removePeer = useCallback(
    (socketId: string) => {
      socketRef.current?.emit("host-action", { action: "remove", targetSocketId: socketId });
      closePC(socketId);
    },
    [closePC],
  );

  const admitParticipant = useCallback((socketId: string) => {
    socketRef.current?.emit("admit-participant", { targetSocketId: socketId });
    setPendingParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
  }, []);

  const rejectParticipant = useCallback((socketId: string) => {
    socketRef.current?.emit("reject-participant", { targetSocketId: socketId });
    setPendingParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
  }, []);

  const transferHost = useCallback((socketId: string, mode: "full" | "sub") => {
    socketRef.current?.emit("transfer-host", { targetSocketId: socketId, mode });
  }, []);

  const requestMicOn = useCallback((socketId: string) => {
    socketRef.current?.emit("request-mic-on", { targetSocketId: socketId });
  }, []);

  const requestCamOn = useCallback((socketId: string) => {
    socketRef.current?.emit("request-cam-on", { targetSocketId: socketId });
  }, []);

  const requestMicCamOn = useCallback((socketId: string) => {
    socketRef.current?.emit("request-mic-cam-on", { targetSocketId: socketId });
  }, []);

  const respondToPermissionRequest = useCallback(
    (accepted: boolean) => {
      const req = pendingPermissionRef.current;
      if (!req || !socketRef.current) return;
      socketRef.current.emit("permission-response", {
        toSocketId: req.fromSocketId,
        type: req.type,
        accepted,
      });
      if (accepted) {
        const stream = cameraStreamRef.current;
        if (!stream) return;
        if (req.type === "mic" || req.type === "both") {
          stream.getAudioTracks().forEach((t) => {
            t.enabled = true;
          });
          setMic(true);
          socketRef.current.emit("media-state", { mic: true });
        }
        if (req.type === "cam" || req.type === "both") {
          void toggleCam();
        }
      }
      pendingPermissionRef.current = null;
      setHostPermissionRequest(null);
    },
    [toggleCam],
  );

  const sendChatMessage = useCallback(
    (text: string, replyTo?: ChatMessage | null, recipients?: string[] | null) => {
      const socket = socketRef.current;
      if (!socket || !text.trim()) return;
      socket.emit("chat-message", {
        text: text.trim(),
        replyTo: replyTo
          ? { id: replyTo.id, username: replyTo.username, text: replyTo.text.slice(0, 100) }
          : null,
        recipients: recipients?.length ? recipients : null,
      });
      if (isTypingRef.current) {
        socket.emit("chat-typing", { isTyping: false });
        isTypingRef.current = false;
      }
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    },
    [],
  );

  const sendChatReaction = useCallback((messageId: string, emoji: string) => {
    socketRef.current?.emit("chat-reaction", { messageId, emoji });
  }, []);

  const setTyping = useCallback((typing: boolean) => {
    const socket = socketRef.current;
    if (!socket) return;
    if (typing && !isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit("chat-typing", { isTyping: true });
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (typing) {
      typingTimerRef.current = setTimeout(() => {
        isTypingRef.current = false;
        socket.emit("chat-typing", { isTyping: false });
      }, TYPING_DEBOUNCE_MS);
    } else if (isTypingRef.current) {
      isTypingRef.current = false;
      socket.emit("chat-typing", { isTyping: false });
    }
  }, []);

  const markRead = useCallback(() => {
    setUnreadCount(0);
    chatOpenRef.current = true;
  }, []);

  const setStatus = useCallback((status: ParticipantStatus) => {
    if (status === "presenting") return;
    if (sharingRef.current) {
      prevStatusRef.current = status;
    } else {
      prevStatusRef.current = status;
      setLocalStatus(status);
      socketRef.current?.emit("status-update", { status });
    }
  }, []);

  const raiseHand = useCallback(() => {
    if (localHandRaised) return;
    setLocalHandRaised(true);
    socketRef.current?.emit("raise-hand");
  }, [localHandRaised]);

  const lowerHand = useCallback(() => {
    setLocalHandRaised(false);
    socketRef.current?.emit("lower-hand");
  }, []);

  const lowerPeerHand = useCallback((socketId: string) => {
    socketRef.current?.emit("host-lower-hand", { targetSocketId: socketId });
  }, []);

  const raisedHands = peers
    .filter((p) => p.handRaised && p.handRaisedAt != null)
    .map((p) => ({ socketId: p.socketId, username: p.username, handRaisedAt: p.handRaisedAt! }))
    .sort((a, b) => a.handRaisedAt - b.handRaisedAt);

  const sendReaction = useCallback((emoji: string) => {
    socketRef.current?.emit("reaction", { emoji });
  }, []);

  const drawWhiteboardElement = useCallback((element: WhiteboardElement) => {
    setWhiteboardElements((prev) => {
      const idx = prev.findIndex((e) => e.id === element.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = element;
        return next;
      }
      return [...prev, element];
    });
    socketRef.current?.emit("whiteboard-draw", { element });
  }, []);

  const eraseWhiteboardElement = useCallback((elementId: string) => {
    setWhiteboardElements((prev) => prev.filter((e) => e.id !== elementId));
    socketRef.current?.emit("whiteboard-erase", { elementId });
  }, []);

  const clearWhiteboard = useCallback(() => {
    setWhiteboardElements([]);
    socketRef.current?.emit("whiteboard-clear");
  }, []);

  const syncWhiteboardElements = useCallback((elements: WhiteboardElement[]) => {
    setWhiteboardElements([...elements]);
    socketRef.current?.emit("whiteboard-sync", { elements });
  }, []);

  const broadcastWhiteboardCursor = useCallback((x: number, y: number) => {
    socketRef.current?.emit("whiteboard-cursor", { x, y });
  }, []);

  const createPoll = useCallback((question: string, options: string[]) => {
    myVoteRef.current = undefined;
    socketRef.current?.emit("poll-create", { question, options });
  }, []);

  const votePoll = useCallback((optionIndex: number) => {
    myVoteRef.current = optionIndex;
    setCurrentPoll((prev) => (prev ? { ...prev, myVote: optionIndex } : prev));
    socketRef.current?.emit("poll-vote", { optionIndex });
  }, []);

  const closePoll = useCallback(() => {
    socketRef.current?.emit("poll-close");
  }, []);
  const dismissPoll = useCallback(() => {
    setCurrentPoll(null);
    socketRef.current?.emit("poll-dismiss");
  }, []);

  const setAgenda = useCallback((items: Array<{ title: string; durationSec: number }>) => {
    socketRef.current?.emit("agenda-set", { items });
  }, []);
  const agendaNext = useCallback(() => {
    socketRef.current?.emit("agenda-next");
  }, []);
  const agendaPrev = useCallback(() => {
    socketRef.current?.emit("agenda-prev");
  }, []);
  const agendaGoto = useCallback((index: number) => {
    socketRef.current?.emit("agenda-goto", { index });
  }, []);
  const agendaTimerStart = useCallback(() => {
    socketRef.current?.emit("agenda-timer-start");
  }, []);
  const agendaTimerPause = useCallback(() => {
    socketRef.current?.emit("agenda-timer-pause");
  }, []);

  const setTilePosition = useCallback((id: string, pos: TilePosition) => {
    setTilePositionsState((prev) => {
      const next = new Map(prev);
      next.set(id, pos);
      return next;
    });
  }, []);

  const activeSpotlightId =
    spotlightId ?? (autoSpotlight ? (isSpeaking ? "local" : speakingPeerId) : null);

  const clearLobbyKnockCount = useCallback(() => {
    setLobbyKnockCount(0);
  }, []);

  return {
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
    socketRef,
    requestMicOn,
    requestCamOn,
    requestMicCamOn,
    hostPermissionRequest,
    respondToPermissionRequest,
  };
}
