/**
 * WebRTC Signaling Server — Lumina Meet Phase 4
 *
 * FIXES in this version:
 *  • Lobby join-request is now broadcast to BOTH host AND subhost (RBAC fix)
 *  • admit-participant now accepts actions from host OR subhost
 *  • reject-participant now accepts actions from host OR subhost
 *  • Lobby notification sound event sent alongside join-request
 *
 * All existing Phase 1/2/3/4 functionality is preserved unchanged.
 */

import Meeting from "../models/Meeting.js";

// ─── Room state ───────────────────────────────────────────────────────────────
const rooms = new Map(); // roomId → Map<socketId, PeerInfo>
const chatHistory = new Map(); // roomId → ChatMessage[]
const waitingRooms = new Map(); // roomId → Map<socketId, WaitingPeer>

// ─── Phase 4 state ────────────────────────────────────────────────────────────
const whiteboardState = new Map(); // roomId → WhiteboardElement[]
const pollState = new Map(); // roomId → Poll | null
const agendaState = new Map(); // roomId → AgendaState | null

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_CHAT_HISTORY = 200;
const MAX_WHITEBOARD_ELEMENTS = 2000;
const ALLOWED_STATUSES = ["available", "busy", "away", "presenting", "brb"];
const ALLOWED_REACTIONS = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "👏",
  "🔥",
  "🎉",
  "💯",
  "🙌",
  "✨",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

function getWaitingRoom(roomId) {
  if (!waitingRooms.has(roomId)) waitingRooms.set(roomId, new Map());
  return waitingRooms.get(roomId);
}

function getChatHistory(roomId) {
  if (!chatHistory.has(roomId)) chatHistory.set(roomId, []);
  return chatHistory.get(roomId);
}

function getWhiteboardState(roomId) {
  if (!whiteboardState.has(roomId)) whiteboardState.set(roomId, []);
  return whiteboardState.get(roomId);
}

function pushChat(roomId, message) {
  const history = getChatHistory(roomId);
  history.push(message);
  if (history.length > MAX_CHAT_HISTORY) {
    history.splice(0, history.length - MAX_CHAT_HISTORY);
  }
}

function sanitizeText(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/<<[^>]*>/g, "")
    .trim()
    .slice(0, 2000);
}

/**
 * FIX: Previously only checked isHost. Now checks isHost OR isSubHost
 * so co-hosts can perform privileged lobby/whiteboard/poll actions.
 */
function isHostOrSubhost(socket) {
  return socket.data.isHost || socket.data.isSubHost;
}

// ─── Session tracking ─────────────────────────────────────────────────────────

async function handleRoomJoin(roomId, userId) {
  try {
    const meeting = await Meeting.findOne({ meetingId: roomId });
    if (!meeting) return;
    if (meeting.type === "scheduled") return;
    const room = getRoom(roomId);
    if (room.size > 0) {
      await meeting.incrementSessionParticipants();
      return;
    }
    await meeting.openSession();
    await meeting.incrementSessionParticipants();
  } catch (err) {
    console.error(
      `[Session] Failed to open session for ${roomId}:`,
      err.message,
    );
  }
}

async function handleRoomLeave(roomId) {
  try {
    const room = rooms.get(roomId);
    if (!room || room.size > 0) return;
    const meeting = await Meeting.findOne({ meetingId: roomId });
    if (!meeting) return;
    if (meeting.type === "scheduled") return;
    await meeting.closeCurrentSession();

    // Clean up Phase 4 ephemeral state
    whiteboardState.delete(roomId);
    pollState.delete(roomId);
    agendaState.delete(roomId);

    console.log(`[Session] Closed session for ${roomId}`);
  } catch (err) {
    console.error(
      `[Session] Failed to close session for ${roomId}:`,
      err.message,
    );
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function initSignaling(io) {
  io.on("connection", (socket) => {
    console.log(`[WS] connected: ${socket.id}`);

    // ─── JOIN ───────────────────────────────────────────────────────────────
    socket.on("join-room", async ({ roomId, username, userId }) => {
      if (!roomId || !username) return;

      socket.data.roomId = roomId;
      socket.data.username = username;
      socket.data.userId = userId;

      const meeting = await Meeting.findOne({ meetingId: roomId });
      const isHost = !!(
        meeting &&
        userId &&
        meeting.host.toString() === userId
      );

      // ── Waiting room gate ─────────────────────────────────────────────────
      if (
        meeting?.settings?.waitingRoom &&
        !isHost &&
        meeting.status === "active"
      ) {
        const waiting = getWaitingRoom(roomId);
        waiting.set(socket.id, {
          username,
          userId,
          socket,
          requestedAt: Date.now(),
        });

        const room = getRoom(roomId);
        if (room) {
          /**
           * FIX: Broadcast join-request to BOTH host AND subhost peers.
           * Previously only peers with `isHost === true` received this event,
           * so co-hosts never saw the lobby notification.
           */
          room.forEach((peer, sid) => {
            if (peer.isHost || peer.isSubHost) {
              io.to(sid).emit("join-request", {
                socketId: socket.id,
                username,
                userId,
              });
              // Separate event so the client can play a sound without
              // coupling audio logic to the join-request data handler.
              io.to(sid).emit("lobby-knock", {
                socketId: socket.id,
                username,
              });
            }
          });
        }

        socket.emit("waiting", { message: "Waiting for host to admit you" });
        return;
      }

      // ── Normal join ───────────────────────────────────────────────────────
      socket.join(roomId);
      const room = getRoom(roomId);
      await handleRoomJoin(roomId, userId);

      const existingPeers = [];
      for (const [sid, info] of room.entries()) {
        if (sid !== socket.id) existingPeers.push({ socketId: sid, ...info });
      }
      socket.emit("room-peers", existingPeers);
      socket.emit("chat-history", getChatHistory(roomId));

      // ── Phase 4: Send current state to joiner ─────────────────────────────
      socket.emit("whiteboard-state", getWhiteboardState(roomId));
      const currentPoll = pollState.get(roomId);
      if (currentPoll) socket.emit("poll-state", serializePoll(currentPoll));
      const currentAgenda = agendaState.get(roomId);
      if (currentAgenda) socket.emit("agenda-state", currentAgenda);

      // ── Also send current waiting room snapshot to host/subhost joiners ───
      // So if a host refreshes mid-meeting, they still see who is waiting
      if (isHost) {
        const waiting = getWaitingRoom(roomId);
        waiting.forEach((waiter, sid) => {
          socket.emit("join-request", {
            socketId: sid,
            username: waiter.username,
            userId: waiter.userId,
          });
        });
      }

      const peerData = {
        username,
        mic: true,
        cam: true,
        screen: false,
        status: "available",
        handRaised: false,
        handRaisedAt: null,
        isHost,
        isSubHost: false,
      };
      room.set(socket.id, peerData);
      socket.data.isHost = isHost;
      socket.data.isSubHost = false;

      if (isHost) socket.emit("you-are-host");

      socket.to(roomId).emit("user-joined", {
        socketId: socket.id,
        username,
        mic: true,
        cam: true,
        status: "available",
        handRaised: false,
        isHost,
        isSubHost: false,
      });

      console.log(
        `[WS] ${username} joined room ${roomId} (${room.size} peers)`,
      );
    });

    // ─── LOBBY CONTROLS ──────────────────────────────────────────────────────

    /**
     * FIX: Previously checked `socket.data.isHost` only.
     * Now `isHostOrSubhost()` allows co-hosts to admit participants.
     */
    socket.on("admit-participant", async ({ targetSocketId }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !isHostOrSubhost(socket)) return; // ← FIXED

      const waiting = getWaitingRoom(roomId);
      const waiter = waiting.get(targetSocketId);
      if (!waiter) return;

      waiting.delete(targetSocketId);
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (!targetSocket) return;

      targetSocket.join(roomId);
      targetSocket.data.isAdmitted = true;

      const room = getRoom(roomId);
      await handleRoomJoin(roomId, targetSocket.data.userId);

      const peerData = {
        username: targetSocket.data.username,
        mic: true,
        cam: true,
        screen: false,
        status: "available",
        handRaised: false,
        handRaisedAt: null,
        isHost: false,
        isSubHost: false,
      };
      room.set(targetSocketId, peerData);

      const existingPeers = [];
      for (const [sid, info] of room.entries()) {
        if (sid !== targetSocketId)
          existingPeers.push({ socketId: sid, ...info });
      }

      targetSocket.emit("room-peers", existingPeers);
      targetSocket.emit("admitted");
      targetSocket.emit("chat-history", getChatHistory(roomId));

      // Send Phase 4 state to newly admitted participant
      targetSocket.emit("whiteboard-state", getWhiteboardState(roomId));
      const currentPoll = pollState.get(roomId);
      if (currentPoll)
        targetSocket.emit("poll-state", serializePoll(currentPoll));
      const currentAgenda = agendaState.get(roomId);
      if (currentAgenda) targetSocket.emit("agenda-state", currentAgenda);

      targetSocket.to(roomId).emit("user-joined", {
        socketId: targetSocketId,
        username: targetSocket.data.username,
        mic: true,
        cam: true,
        status: "available",
        handRaised: false,
        isHost: false,
        isSubHost: false,
      });

      // Notify all managers that this participant was admitted (removes from their lobby UI)
      io.to(roomId).emit("lobby-admitted", { socketId: targetSocketId });
      console.log(
        `[Lobby] ${targetSocket.data.username} admitted by ${socket.data.username}`,
      );
    });

    /**
     * FIX: Previously checked `socket.data.isHost` only.
     * Now `isHostOrSubhost()` allows co-hosts to reject participants.
     */
    socket.on("reject-participant", ({ targetSocketId }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !isHostOrSubhost(socket)) return; // ← FIXED

      const waiting = getWaitingRoom(roomId);
      waiting.delete(targetSocketId);

      io.to(targetSocketId).emit("join-rejected", {
        reason: "The host declined your request to join.",
      });

      // Notify all managers that this participant was rejected
      io.to(roomId).emit("lobby-rejected", { socketId: targetSocketId });

      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) targetSocket.disconnect(true);
      console.log(
        `[Lobby] ${targetSocketId} rejected by ${socket.data.username}`,
      );
    });

    // ─── HOST TRANSFER ───────────────────────────────────────────────────────

    socket.on("transfer-host", ({ targetSocketId, mode }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !socket.data.isHost) return;

      const room = getRoom(roomId);
      const targetPeer = room.get(targetSocketId);
      if (!targetPeer) return;

      if (mode === "full") {
        const oldHostPeer = room.get(socket.id);
        if (oldHostPeer) {
          oldHostPeer.isHost = false;
          oldHostPeer.isSubHost = false;
        }
        socket.data.isHost = false;
        socket.data.isSubHost = false;
        targetPeer.isHost = true;
        targetPeer.isSubHost = false;
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          targetSocket.data.isHost = true;
          targetSocket.data.isSubHost = false;
        }

        io.to(roomId).emit("host-transferred", {
          mode: "full",
          newHostSocketId: targetSocketId,
          newHostUsername: targetPeer.username,
          oldHostSocketId: socket.id,
        });
        io.to(targetSocketId).emit("you-are-host");
        io.to(socket.id).emit("you-are-participant");

        // Send pending waiting participants to new host
        const waiting = getWaitingRoom(roomId);
        waiting.forEach((waiter, sid) => {
          io.to(targetSocketId).emit("join-request", {
            socketId: sid,
            username: waiter.username,
            userId: waiter.userId,
          });
        });
      } else if (mode === "sub") {
        targetPeer.isSubHost = true;
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) targetSocket.data.isSubHost = true;
        io.to(roomId).emit("host-transferred", {
          mode: "sub",
          targetSocketId,
          targetUsername: targetPeer.username,
          grantedBy: socket.id,
        });
        io.to(targetSocketId).emit("you-are-subhost");

        // Send pending waiting participants to new co-host
        const waiting = getWaitingRoom(roomId);
        waiting.forEach((waiter, sid) => {
          io.to(targetSocketId).emit("join-request", {
            socketId: sid,
            username: waiter.username,
            userId: waiter.userId,
          });
        });
      }
    });

    // ─── WEBRTC SIGNALING ────────────────────────────────────────────────────

    socket.on("offer", ({ to, offer }) => {
      io.to(to).emit("offer", {
        from: socket.id,
        username: socket.data.username,
        offer,
      });
    });
    socket.on("answer", ({ to, answer }) => {
      io.to(to).emit("answer", { from: socket.id, answer });
    });
    socket.on("ice-candidate", ({ to, candidate }) => {
      io.to(to).emit("ice-candidate", { from: socket.id, candidate });
    });

    // ─── MEDIA STATE ─────────────────────────────────────────────────────────

    socket.on("media-state", ({ mic, cam, screen }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (room?.has(socket.id)) {
        const peer = room.get(socket.id);
        if (mic !== undefined) peer.mic = mic;
        if (cam !== undefined) peer.cam = cam;
        if (screen !== undefined) {
          peer.screen = screen;
          if (screen === true) peer.status = "presenting";
          if (screen === false && peer.status === "presenting")
            peer.status = "available";
        }
      }
      socket
        .to(roomId)
        .emit("peer-media-state", { socketId: socket.id, mic, cam, screen });
    });

    socket.on("host-action", ({ action, targetSocketId }) => {
      io.to(targetSocketId).emit("host-action", { action });
    });

    // ─── CHAT ─────────────────────────────────────────────────────────────────

    socket.on("chat-message", ({ text, replyTo }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const clean = sanitizeText(text);
      if (!clean) return;
      const message = {
        id: `${socket.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        socketId: socket.id,
        username: socket.data.username,
        text: clean,
        timestamp: Date.now(),
        replyTo: replyTo ?? null,
      };
      pushChat(roomId, message);
      io.to(roomId).emit("chat-message", message);
    });

    socket.on("chat-reaction", ({ messageId, emoji }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !messageId || !ALLOWED_REACTIONS.includes(emoji)) return;
      io.to(roomId).emit("chat-reaction", {
        messageId,
        emoji,
        socketId: socket.id,
        username: socket.data.username,
      });
    });

    socket.on("chat-typing", ({ isTyping }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      socket.to(roomId).emit("chat-typing", {
        socketId: socket.id,
        username: socket.data.username,
        isTyping: Boolean(isTyping),
      });
    });

    // ─── STATUS ───────────────────────────────────────────────────────────────

    socket.on("status-update", ({ status }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const safeStatus = ALLOWED_STATUSES.includes(status)
        ? status
        : "available";
      const room = rooms.get(roomId);
      if (room?.has(socket.id)) room.get(socket.id).status = safeStatus;
      io.to(roomId).emit("peer-status", {
        socketId: socket.id,
        username: socket.data.username,
        status: safeStatus,
      });
    });

    // ─── RAISE HAND ───────────────────────────────────────────────────────────

    socket.on("raise-hand", () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (room?.has(socket.id)) {
        const peer = room.get(socket.id);
        if (peer.handRaised) return;
        peer.handRaised = true;
        peer.handRaisedAt = Date.now();
      }
      io.to(roomId).emit("hand-raised", {
        socketId: socket.id,
        username: socket.data.username,
        handRaisedAt: Date.now(),
      });
    });

    socket.on("lower-hand", () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (room?.has(socket.id)) {
        room.get(socket.id).handRaised = false;
        room.get(socket.id).handRaisedAt = null;
      }
      io.to(roomId).emit("hand-lowered", { socketId: socket.id });
    });

    socket.on("host-lower-hand", ({ targetSocketId }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (room?.has(targetSocketId)) {
        room.get(targetSocketId).handRaised = false;
        room.get(targetSocketId).handRaisedAt = null;
      }
      io.to(roomId).emit("hand-lowered", { socketId: targetSocketId });
      io.to(targetSocketId).emit("host-action", { action: "lower-hand" });
    });

    // ─── REACTIONS ────────────────────────────────────────────────────────────

    socket.on("reaction", ({ emoji }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !ALLOWED_REACTIONS.includes(emoji)) return;
      io.to(roomId).emit("reaction", {
        id: `rxn-${socket.id}-${Date.now()}`,
        socketId: socket.id,
        username: socket.data.username,
        emoji,
        timestamp: Date.now(),
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 4: COLLABORATIVE WHITEBOARD
    // ════════════════════════════════════════════════════════════════════════

    socket.on("whiteboard-draw", ({ element }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !element?.id) return;
      const allowed = ["stroke", "text", "sticky", "arrow", "rect", "ellipse"];
      if (!allowed.includes(element.type)) return;
      const board = getWhiteboardState(roomId);
      const idx = board.findIndex((e) => e.id === element.id);
      const safeElement = {
        ...element,
        author: socket.data.username,
        authorId: socket.id,
      };
      if (idx >= 0) board[idx] = safeElement;
      else {
        board.push(safeElement);
        if (board.length > MAX_WHITEBOARD_ELEMENTS)
          board.splice(0, board.length - MAX_WHITEBOARD_ELEMENTS);
      }
      socket
        .to(roomId)
        .emit("whiteboard-draw", { element: safeElement, from: socket.id });
    });

    socket.on("whiteboard-erase", ({ elementId }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !elementId) return;
      const board = getWhiteboardState(roomId);
      const idx = board.findIndex((e) => e.id === elementId);
      if (idx >= 0) board.splice(idx, 1);
      socket
        .to(roomId)
        .emit("whiteboard-erase", { elementId, from: socket.id });
    });

    socket.on("whiteboard-clear", () => {
      const roomId = socket.data.roomId;
      if (!roomId || !isHostOrSubhost(socket)) return;
      whiteboardState.set(roomId, []);
      io.to(roomId).emit("whiteboard-clear");
    });

    /**
     * NEW: whiteboard-sync — replaces entire board state for undo/redo.
     * Does NOT require host/subhost — any participant can sync their local
     * undo/redo state back to the room. The server replaces its board state
     * and broadcasts to all OTHER peers. The sender already has correct state.
     */
    socket.on("whiteboard-sync", ({ elements }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !Array.isArray(elements)) return;
      // Clamp to max
      const safe = elements.slice(0, MAX_WHITEBOARD_ELEMENTS);
      whiteboardState.set(roomId, safe);
      // Broadcast to everyone else — sender already applied state locally
      socket.to(roomId).emit("whiteboard-state", safe);
    });

    socket.on("whiteboard-cursor", ({ x, y }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (typeof x !== "number" || typeof y !== "number") return;
      socket.to(roomId).emit("whiteboard-cursor", {
        socketId: socket.id,
        username: socket.data.username,
        x,
        y,
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 4: LIVE POLLS
    // ════════════════════════════════════════════════════════════════════════

    socket.on("poll-create", ({ question, options }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !isHostOrSubhost(socket)) return;
      if (
        !question ||
        !Array.isArray(options) ||
        options.length < 2 ||
        options.length > 8
      )
        return;
      const poll = {
        id: `poll-${Date.now()}`,
        question: sanitizeText(question).slice(0, 200),
        options: options
          .slice(0, 8)
          .map((o) => sanitizeText(String(o)).slice(0, 100)),
        votes: new Map(),
        closed: false,
        createdAt: Date.now(),
      };
      pollState.set(roomId, poll);
      io.to(roomId).emit("poll-state", serializePoll(poll));
    });

    socket.on("poll-vote", ({ optionIndex }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const poll = pollState.get(roomId);
      if (!poll || poll.closed) return;
      if (
        typeof optionIndex !== "number" ||
        optionIndex < 0 ||
        optionIndex >= poll.options.length
      )
        return;
      poll.votes.set(socket.id, optionIndex);
      io.to(roomId).emit("poll-update", serializePollUpdate(poll));
    });

    socket.on("poll-close", () => {
      const roomId = socket.data.roomId;
      if (!roomId || !isHostOrSubhost(socket)) return;
      const poll = pollState.get(roomId);
      if (!poll) return;
      poll.closed = true;
      io.to(roomId).emit("poll-closed", {
        id: poll.id,
        votes: serializePollVotes(poll),
      });
    });

    socket.on("poll-dismiss", () => {
      const roomId = socket.data.roomId;
      if (!roomId || !isHostOrSubhost(socket)) return;
      pollState.delete(roomId);
      io.to(roomId).emit("poll-dismissed");
    });

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 4: SHARED AGENDA + FOCUS TIMER
    // ════════════════════════════════════════════════════════════════════════

    socket.on("agenda-set", ({ items }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !isHostOrSubhost(socket)) return;
      if (!Array.isArray(items) || items.length === 0 || items.length > 20)
        return;
      const safeItems = items.map((item, i) => ({
        id: `agenda-${i}-${Date.now()}`,
        title:
          sanitizeText(String(item.title ?? "")).slice(0, 100) ||
          `Item ${i + 1}`,
        durationSec: Math.min(
          Math.max(Number(item.durationSec) || 300, 30),
          7200,
        ),
        done: false,
      }));
      const state = {
        items: safeItems,
        activeIdx: 0,
        timerEnd: null,
        timerPaused: true,
        timerRemaining: safeItems[0].durationSec * 1000,
      };
      agendaState.set(roomId, state);
      io.to(roomId).emit("agenda-state", state);
    });

    socket.on("agenda-next", () => {
      const roomId = socket.data.roomId;
      if (!roomId || !isHostOrSubhost(socket)) return;
      const state = agendaState.get(roomId);
      if (!state) return;
      state.items[state.activeIdx].done = true;
      const nextIdx = state.activeIdx + 1;
      if (nextIdx >= state.items.length) {
        io.to(roomId).emit("agenda-complete");
        agendaState.delete(roomId);
        return;
      }
      state.activeIdx = nextIdx;
      state.timerEnd = null;
      state.timerPaused = true;
      state.timerRemaining = state.items[nextIdx].durationSec * 1000;
      io.to(roomId).emit("agenda-tick", state);
    });

    socket.on("agenda-prev", () => {
      const roomId = socket.data.roomId;
      if (!roomId || !isHostOrSubhost(socket)) return;
      const state = agendaState.get(roomId);
      if (!state || state.activeIdx <= 0) return;
      state.items[state.activeIdx].done = false;
      state.activeIdx -= 1;
      state.timerEnd = null;
      state.timerPaused = true;
      state.timerRemaining = state.items[state.activeIdx].durationSec * 1000;
      io.to(roomId).emit("agenda-tick", state);
    });

    socket.on("agenda-goto", ({ index }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !isHostOrSubhost(socket)) return;
      const state = agendaState.get(roomId);
      if (
        !state ||
        typeof index !== "number" ||
        index < 0 ||
        index >= state.items.length
      )
        return;
      state.activeIdx = index;
      state.timerEnd = null;
      state.timerPaused = true;
      state.timerRemaining = state.items[index].durationSec * 1000;
      io.to(roomId).emit("agenda-tick", state);
    });

    socket.on("agenda-timer-start", () => {
      const roomId = socket.data.roomId;
      if (!roomId || !isHostOrSubhost(socket)) return;
      const state = agendaState.get(roomId);
      if (!state) return;
      const remaining =
        state.timerRemaining ?? state.items[state.activeIdx].durationSec * 1000;
      state.timerEnd = Date.now() + remaining;
      state.timerPaused = false;
      state.timerRemaining = null;
      io.to(roomId).emit("agenda-tick", state);
    });

    socket.on("agenda-timer-pause", () => {
      const roomId = socket.data.roomId;
      if (!roomId || !isHostOrSubhost(socket)) return;
      const state = agendaState.get(roomId);
      if (!state || state.timerPaused) return;
      const remaining = state.timerEnd
        ? Math.max(0, state.timerEnd - Date.now())
        : 0;
      state.timerEnd = null;
      state.timerPaused = true;
      state.timerRemaining = remaining;
      io.to(roomId).emit("agenda-tick", state);
    });

    // ─── DISCONNECT ──────────────────────────────────────────────────────────

    socket.on("disconnect", async () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (room) {
        room.delete(socket.id);
        await handleRoomLeave(roomId);
        if (room.size === 0) {
          rooms.delete(roomId);
          chatHistory.delete(roomId);
        }
      }

      const waiting = waitingRooms.get(roomId);
      if (waiting) {
        waiting.delete(socket.id);
        if (waiting.size === 0) waitingRooms.delete(roomId);
      }

      socket.to(roomId).emit("user-left", { socketId: socket.id });
      socket.to(roomId).emit("chat-typing", {
        socketId: socket.id,
        username: socket.data.username,
        isTyping: false,
      });
      console.log(`[WS] ${socket.data.username} left room ${roomId}`);
    });
  });

  // ── Re-sync agenda timer every 5s to prevent drift ────────────────────────
  setInterval(() => {
    agendaState.forEach((state, roomId) => {
      if (!state.timerPaused && state.timerEnd) {
        const remaining = state.timerEnd - Date.now();
        if (remaining <= 0) {
          state.items[state.activeIdx].done = true;
          const nextIdx = state.activeIdx + 1;
          if (nextIdx >= state.items.length) {
            io.to(roomId).emit("agenda-complete");
            agendaState.delete(roomId);
          } else {
            state.activeIdx = nextIdx;
            state.timerEnd = null;
            state.timerPaused = true;
            state.timerRemaining = state.items[nextIdx].durationSec * 1000;
            io.to(roomId).emit("agenda-tick", state);
          }
        } else {
          io.to(roomId).emit("agenda-tick", state);
        }
      }
    });
  }, 5000);
}

// ─── Poll serializers ─────────────────────────────────────────────────────────

function serializePollVotes(poll) {
  const votes = {};
  poll.options.forEach((_, i) => {
    votes[i] = 0;
  });
  poll.votes.forEach((optIdx) => {
    votes[optIdx] = (votes[optIdx] ?? 0) + 1;
  });
  return votes;
}

function serializePoll(poll) {
  return {
    id: poll.id,
    question: poll.question,
    options: poll.options,
    votes: serializePollVotes(poll),
    totalVoters: poll.votes.size,
    closed: poll.closed,
  };
}

function serializePollUpdate(poll) {
  return {
    id: poll.id,
    votes: serializePollVotes(poll),
    totalVoters: poll.votes.size,
  };
}

export { rooms, chatHistory, waitingRooms };
