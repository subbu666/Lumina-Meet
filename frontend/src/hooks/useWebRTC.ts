/**
 * useWebRTC — Lumina Meet Phase 2 (FIXED v2)
 *
 * Status fixes:
 *  - "Presenting" is now ONLY set automatically when screen share starts.
 *  - When screen share stops (any way), status restores to prevStatusRef
 *    which can NEVER be "presenting" (users cannot manually set it).
 *  - setStatus() guards against writing "presenting" as prevStatusRef so
 *    the restore destination is always a real user-chosen status.
 *  - If user manually changes status while presenting, prevStatusRef is
 *    updated so the new choice is what gets restored when sharing stops.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ParticipantStatus = "available" | "busy" | "away" | "presenting" | "brb";

export interface RemotePeer {
  socketId: string;
  username: string;
  stream: MediaStream | null;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  speaking: boolean;
  status: ParticipantStatus;
  handRaised: boolean;
  handRaisedAt: number | null;
}

export interface ChatMessage {
  id: string;
  socketId: string;
  username: string;
  text: string;
  timestamp: number;
  replyTo: { id: string; username: string; text: string } | null;
  reactions: Record<string, Set<string>>;
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

export interface UseWebRTCReturn {
  localStream: MediaStream | null;
  localSocketId: string | null;
  mic: boolean;
  cam: boolean;
  sharing: boolean;
  peers: RemotePeer[];
  toggleMic: () => void;
  toggleCam: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  leaveRoom: () => void;
  muteAll: () => void;
  camOffAll: () => void;
  removePeer: (socketId: string) => void;
  isSpeaking: boolean;
  speakingPeerId: string | null;
  messages: ChatMessage[];
  typingPeers: TypingPeer[];
  sendChatMessage: (text: string, replyTo?: ChatMessage | null) => void;
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
  error: string | null;
  isConnecting: boolean;
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
  // @ts-ignore
  const stream: MediaStream = canvas.captureStream(0);
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWebRTC(roomId: string, username: string, socketUrl: string): UseWebRTCReturn {
  // ── Core state ─────────────────────────────────────────────────────────────
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<RemotePeer[]>([]);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [localSocketId, setLocalSocketId] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingPeerId, setSpeakingPeerId] = useState<string | null>(null);

  // ── Phase 2 state ──────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingPeers, setTypingPeers] = useState<TypingPeer[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [localStatus, setLocalStatus] = useState<ParticipantStatus>("available");
  const [localHandRaised, setLocalHandRaised] = useState(false);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const socketRef = useRef<Socket | null>(null);
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

  /**
   * STATUS RESTORATION REF
   *
   * prevStatusRef stores the status to restore when screen sharing stops.
   *
   * INVARIANT: prevStatusRef.current is NEVER "presenting".
   *   - It starts as "available".
   *   - setStatus() only writes to it when NOT presenting (or when the new
   *     value is not "presenting"), so the restore target is always a real
   *     user-chosen non-presenting status.
   *   - toggleScreenShare reads it on stop to know what to restore to.
   */
  const prevStatusRef = useRef<ParticipantStatus>("available");

  /**
   * sharingRef mirrors the `sharing` state in a ref so that callbacks
   * created in useEffect (e.g. screenTrack.onended) can read the latest
   * value without becoming stale closures.
   */
  const sharingRef = useRef(false);

  // Keep sharingRef in sync with sharing state
  useEffect(() => {
    sharingRef.current = sharing;
  }, [sharing]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const updatePeer = useCallback((socketId: string, patch: Partial<RemotePeer>) => {
    setPeers((prev) => prev.map((p) => (p.socketId === socketId ? { ...p, ...patch } : p)));
  }, []);

  const createPC = useCallback(
    (remoteSocketId: string, remoteUsername: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      pc.onicecandidate = ({ candidate }) => {
        if (candidate && socketRef.current) {
          socketRef.current.emit("ice-candidate", { to: remoteSocketId, candidate });
        }
      };

      const remoteStream = new MediaStream();
      pc.ontrack = ({ track }) => {
        remoteStream.addTrack(track);
        updatePeer(remoteSocketId, { stream: remoteStream });

        if (track.kind === "audio" && audioCtxRef.current) {
          const analyser = buildAnalyser(audioCtxRef.current, remoteStream);
          if (analyser) remoteAnalysers.current.set(remoteSocketId, analyser);
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
            mic: true,
            cam: true,
            screen: false,
            speaking: false,
            status: "available",
            handRaised: false,
            handRaisedAt: null,
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
    setPeers((prev) => prev.filter((p) => p.socketId !== socketId));
  }, []);

  // ── Main effect ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !username) return;
    let cancelled = false;

    const init = async () => {
      // 1. Get local media
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch {
          stream = new MediaStream();
        }
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsConnecting(false);

      // 2. Local VAD
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

      // 3. Connect socket
      const socket = io(socketUrl, {
        transports: ["websocket", "polling"],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        if (cancelled) return;
        setLocalSocketId(socket.id ?? null);
        socket.emit("join-room", { roomId, username });
      });

      socket.on("connect_error", (err) => {
        setError(`Connection failed: ${err.message}`);
        setIsConnecting(false);
      });

      // 4. Remote VAD
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

      socket.on(
        "room-peers",
        async (
          existingPeers: Array<{
            socketId: string;
            username: string;
            mic: boolean;
            cam: boolean;
            status?: ParticipantStatus;
            handRaised?: boolean;
            handRaisedAt?: number | null;
          }>,
        ) => {
          for (const peer of existingPeers) {
            const pc = createPC(peer.socketId, peer.username);
            updatePeer(peer.socketId, {
              status: peer.status ?? "available",
              handRaised: peer.handRaised ?? false,
              handRaisedAt: peer.handRaisedAt ?? null,
            });
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("offer", { to: peer.socketId, offer });
          }
        },
      );

      socket.on(
        "user-joined",
        ({
          socketId,
          username: uname,
        }: {
          socketId: string;
          username: string;
          mic: boolean;
          cam: boolean;
          status?: ParticipantStatus;
          handRaised?: boolean;
        }) => {
          console.log(`[WS] user-joined: ${uname} (${socketId})`);
        },
      );

      socket.on(
        "offer",
        async ({
          from,
          username: uname,
          offer,
        }: {
          from: string;
          username: string;
          offer: RTCSessionDescriptionInit;
        }) => {
          const pc = createPC(from, uname);
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", { to: from, answer });
        },
      );

      socket.on(
        "answer",
        async ({ from, answer }: { from: string; answer: RTCSessionDescriptionInit }) => {
          const pc = pcsRef.current.get(from);
          if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
        },
      );

      socket.on(
        "ice-candidate",
        async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
          const pc = pcsRef.current.get(from);
          if (pc) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
              console.warn("[ICE] Failed", e);
            }
          }
        },
      );

      socket.on(
        "peer-media-state",
        ({
          socketId,
          mic: pMic,
          cam: pCam,
          screen: pScreen,
        }: {
          socketId: string;
          mic?: boolean;
          cam?: boolean;
          screen?: boolean;
        }) => {
          updatePeer(socketId, {
            ...(pMic !== undefined && { mic: pMic }),
            ...(pCam !== undefined && { cam: pCam }),
            ...(pScreen !== undefined && { screen: pScreen }),
            // Auto-update remote peer status based on screen share
            ...(pScreen === true && { status: "presenting" as ParticipantStatus }),
            ...(pScreen === false && { status: "available" as ParticipantStatus }),
          });
        },
      );

      socket.on("user-left", ({ socketId }: { socketId: string }) => {
        closePC(socketId);
        setTypingPeers((prev) => prev.filter((p) => p.socketId !== socketId));
      });

      socket.on("host-action", ({ action }: { action: string }) => {
        if (action === "mute") {
          stream.getAudioTracks().forEach((t) => {
            t.enabled = false;
          });
          setMic(false);
          socket.emit("media-state", { mic: false });
        }
        if (action === "cam-off") {
          stream.getVideoTracks().forEach((t) => {
            t.enabled = false;
          });
          setCam(false);
          socket.emit("media-state", { cam: false });
        }
        if (action === "lower-hand") {
          setLocalHandRaised(false);
        }
        if (action === "remove") {
          window.dispatchEvent(new CustomEvent("Lumina Meet:host-removed"));
        }
      });

      // ── Phase 2 socket handlers ────────────────────────────────────────────

      socket.on("chat-history", (history: Omit<ChatMessage, "reactions">[]) => {
        setMessages(history.map((m) => ({ ...m, reactions: {} })));
      });

      socket.on("chat-message", (msg: Omit<ChatMessage, "reactions">) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, { ...msg, reactions: {} }];
        });
        if (!chatOpenRef.current && msg.socketId !== socket.id) {
          setUnreadCount((n) => n + 1);
        }
        setTypingPeers((prev) => prev.filter((p) => p.socketId !== msg.socketId));
      });

      socket.on(
        "chat-reaction",
        ({
          messageId,
          emoji,
          socketId: sid,
        }: {
          messageId: string;
          emoji: string;
          socketId: string;
          username: string;
        }) => {
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
        },
      );

      socket.on(
        "chat-typing",
        ({
          socketId: sid,
          username: uname,
          isTyping,
        }: {
          socketId: string;
          username: string;
          isTyping: boolean;
        }) => {
          setTypingPeers((prev) => {
            if (isTyping) {
              if (prev.some((p) => p.socketId === sid)) return prev;
              return [...prev, { socketId: sid, username: uname }];
            }
            return prev.filter((p) => p.socketId !== sid);
          });
        },
      );

      socket.on(
        "peer-status",
        ({
          socketId: sid,
          status,
        }: {
          socketId: string;
          username: string;
          status: ParticipantStatus;
        }) => {
          updatePeer(sid, { status });
        },
      );

      socket.on(
        "hand-raised",
        ({
          socketId: sid,
          handRaisedAt,
        }: {
          socketId: string;
          username: string;
          handRaisedAt: number;
        }) => {
          updatePeer(sid, { handRaised: true, handRaisedAt });
        },
      );

      socket.on("hand-lowered", ({ socketId: sid }: { socketId: string }) => {
        updatePeer(sid, { handRaised: false, handRaisedAt: null });
      });

      socket.on("reaction", (event: ReactionEvent) => {
        setReactions((prev) => [...prev, event]);
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== event.id));
        }, REACTION_LIFETIME_MS);
      });

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
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      socketRef.current?.disconnect();
      if (vadTimerRef.current) clearInterval(vadTimerRef.current);
      if (localSpeakingDebounce.current) clearTimeout(localSpeakingDebounce.current);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      remoteAnalysers.current.clear();
      audioCtxRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, username, socketUrl]);

  // ── Controls ───────────────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !mic;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
    setMic(next);
    socketRef.current?.emit("media-state", { mic: next });
  }, [mic]);

  const toggleCam = useCallback(async () => {
    const stream = localStreamRef.current;
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
        pcsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) sender.replaceTrack(newVideoTrack);
          else pc.addTrack(newVideoTrack, stream);
        });
        const updatedStream = new MediaStream(stream.getTracks());
        localStreamRef.current = updatedStream;
        setLocalStream(updatedStream);
        setCam(true);
        socketRef.current?.emit("media-state", { cam: true });
      } catch (err) {
        console.error("[WebRTC] Failed to re-acquire camera", err);
      }
    }
  }, [cam]);

  /**
   * Shared helper: restores state after screen sharing ends (both via
   * in-app toggle and browser's native "Stop sharing" button).
   */
  const _stopSharingCleanup = useCallback(() => {
    const socket = socketRef.current;

    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;

    // Restore camera track into all peer connections
    const camTrack = localStreamRef.current?.getVideoTracks()[0];
    if (camTrack) {
      pcsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) sender.replaceTrack(camTrack);
      });
    }

    // Restore localStream so React UI shows camera again
    if (localStreamRef.current) {
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    }

    setSharing(false);
    socket?.emit("media-state", { screen: false });

    // Restore to the status saved before presenting started.
    // prevStatusRef is guaranteed to never be "presenting".
    const restored = prevStatusRef.current;
    setLocalStatus(restored);
    socket?.emit("status-update", { status: restored });
  }, []);

  const toggleScreenShare = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) return;

    if (sharingRef.current) {
      // ── Stop sharing ──────────────────────────────────────────────────────
      _stopSharingCleanup();
    } else {
      // ── Start sharing ─────────────────────────────────────────────────────
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30, max: 60 } },
          audio: false,
        });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace the video sender in every peer connection
        pcsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) sender.replaceTrack(screenTrack);
        });

        // Build preview stream: screen video + existing audio
        const cameraStream = localStreamRef.current;
        const audioTracks = cameraStream?.getAudioTracks() ?? [];
        const screenPreviewStream = new MediaStream([screenTrack, ...audioTracks]);
        setLocalStream(screenPreviewStream);

        setSharing(true);
        socket.emit("media-state", { screen: true });

        // Save current status (ONLY if it's not "presenting" — defensive guard)
        // then switch to "presenting". This ensures prevStatusRef always holds
        // a valid restore target.
        setLocalStatus((currentStatus) => {
          if (currentStatus !== "presenting") {
            prevStatusRef.current = currentStatus;
          }
          return "presenting";
        });
        socket.emit("status-update", { status: "presenting" });

        // Handle browser-native "Stop sharing" button
        screenTrack.onended = () => {
          _stopSharingCleanup();
        };
      } catch (err) {
        console.warn("[WebRTC] Screen share cancelled or denied", err);
      }
    }
  }, [_stopSharingCleanup]);

  const leaveRoom = useCallback(() => {
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    socketRef.current?.disconnect();
  }, []);

  // ── Host controls ──────────────────────────────────────────────────────────

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

  // ── Phase 2: Chat ──────────────────────────────────────────────────────────

  const sendChatMessage = useCallback((text: string, replyTo?: ChatMessage | null) => {
    const socket = socketRef.current;
    if (!socket || !text.trim()) return;
    socket.emit("chat-message", {
      text: text.trim(),
      replyTo: replyTo
        ? { id: replyTo.id, username: replyTo.username, text: replyTo.text.slice(0, 100) }
        : null,
    });
    if (isTypingRef.current) {
      socket.emit("chat-typing", { isTyping: false });
      isTypingRef.current = false;
    }
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }, []);

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

  // ── Phase 2: Status ────────────────────────────────────────────────────────

  /**
   * setStatus — called when the user manually picks a status from the dropdown.
   *
   * Rules:
   * 1. "Presenting" can NEVER be set manually — it's auto-only. Silently ignore.
   * 2. If the user is currently presenting (screen sharing), update prevStatusRef
   *    so when sharing stops, it restores to this new choice — but keep localStatus
   *    as "presenting" for now (they're still sharing).
   * 3. If not presenting, apply the status immediately as normal.
   */
  const setStatus = useCallback((status: ParticipantStatus) => {
    // Guard: "presenting" is auto-only, never settable manually.
    if (status === "presenting") return;

    if (sharingRef.current) {
      // User changed preferred status while still sharing.
      // Store it as the restore target but don't change the displayed status
      // (it stays "presenting" until they stop sharing).
      prevStatusRef.current = status;
      // Optionally: emit to socket so server knows intent — but the local UI
      // keeps showing "presenting". Here we only update the restore target.
      // (Do NOT emit socket here — the displayed status hasn't changed.)
    } else {
      // Normal case: not sharing, apply immediately.
      prevStatusRef.current = status; // keep in sync
      setLocalStatus(status);
      socketRef.current?.emit("status-update", { status });
    }
  }, []);

  // ── Phase 2: Raise hand ────────────────────────────────────────────────────

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

  // ── Phase 2: Reactions ─────────────────────────────────────────────────────

  const sendReaction = useCallback((emoji: string) => {
    socketRef.current?.emit("reaction", { emoji });
  }, []);

  return {
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
  };
}
