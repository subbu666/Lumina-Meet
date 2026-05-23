/**
 * WebRTC Signaling Server — Lumina Meet Phase 3
 *
 * Session tracking fixes:
 *  • join-room now opens a DB session for instant + joined meetings
 *    (only the first socket in a room opens the session; subsequent
 *     sockets only increment the participant count)
 *  • disconnect closes the session when the last socket leaves a room
 *  • All other Phase 1/2/3 functionality is unchanged
 */

import Meeting from "../models/Meeting.js";

// ─── Room state ───────────────────────────────────────────────────────────────
const rooms = new Map(); // roomId → Map<socketId, PeerInfo>
const chatHistory = new Map(); // roomId → ChatMessage[]
const waitingRooms = new Map(); // roomId → Map<socketId, WaitingPeer>

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_CHAT_HISTORY = 200;
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

// ─── Session tracking helpers ─────────────────────────────────────────────────

/**
 * Called when the FIRST real participant joins a room (socket enters).
 * Opens a new DB session for instant + joined meetings only.
 * Scheduled meetings get their session opened by the HTTP join endpoint.
 *
 * Safe to call even if the meeting doesn't exist in DB (joined via external link).
 */
async function handleRoomJoin(roomId, userId) {
  try {
    const meeting = await Meeting.findOne({ meetingId: roomId });
    if (!meeting) return;

    // Only instant and joined meetings support multi-session tracking
    if (meeting.type === "scheduled") return;

    const room = getRoom(roomId);
    // If there's already at least one peer before this socket arrived,
    // the session is already open — just bump the participant count.
    if (room.size > 0) {
      await meeting.incrementSessionParticipants();
      return;
    }

    // First person in the room — open a fresh session
    await meeting.openSession();
    await meeting.incrementSessionParticipants();
  } catch (err) {
    console.error(
      `[Session] Failed to open session for ${roomId}:`,
      err.message,
    );
  }
}

/**
 * Called when a socket disconnects.
 * Closes the current open session when the LAST participant leaves.
 */
async function handleRoomLeave(roomId) {
  try {
    const room = rooms.get(roomId);
    // room has already had this socket removed before we call this —
    // so size === 0 means the room is now empty.
    if (!room || room.size > 0) return;

    const meeting = await Meeting.findOne({ meetingId: roomId });
    if (!meeting) return;
    if (meeting.type === "scheduled") return;

    await meeting.closeCurrentSession();
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

      // ── Waiting room gate ──────────────────────────────────────────────────
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
          room.forEach((peer, sid) => {
            if (peer.isHost) {
              io.to(sid).emit("join-request", {
                socketId: socket.id,
                username,
                userId,
              });
            }
          });
        }

        socket.emit("waiting", { message: "Waiting for host to admit you" });
        console.log(`[WS] ${username} waiting in lobby for ${roomId}`);
        return;
      }

      // ── Normal join ────────────────────────────────────────────────────────
      socket.join(roomId);
      const room = getRoom(roomId);

      // ── Open / increment DB session BEFORE adding this socket to the room ─
      // (room.size here is the count BEFORE this socket, i.e. existing peers)
      await handleRoomJoin(roomId, userId);

      // Now add to in-memory room
      const existingPeers = [];
      for (const [sid, info] of room.entries()) {
        if (sid !== socket.id) existingPeers.push({ socketId: sid, ...info });
      }
      socket.emit("room-peers", existingPeers);
      socket.emit("chat-history", getChatHistory(roomId));

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

    socket.on("admit-participant", async ({ targetSocketId }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !socket.data.isHost) return;

      const waiting = getWaitingRoom(roomId);
      const waiter = waiting.get(targetSocketId);
      if (!waiter) return;

      waiting.delete(targetSocketId);
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (!targetSocket) return;

      targetSocket.join(roomId);
      targetSocket.data.isAdmitted = true;

      const room = getRoom(roomId);

      // Track this admitted participant in the DB session
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

      console.log(`[WS] ${targetSocket.data.username} admitted to ${roomId}`);
    });

    socket.on("reject-participant", ({ targetSocketId }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !socket.data.isHost) return;

      const waiting = getWaitingRoom(roomId);
      waiting.delete(targetSocketId);

      io.to(targetSocketId).emit("join-rejected", {
        reason: "Host declined your request",
      });
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) targetSocket.disconnect(true);
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
        if (screen !== undefined) peer.screen = screen;
        if (screen === true) peer.status = "presenting";
        if (screen === false && peer.status === "presenting")
          peer.status = "available";
      }

      socket.to(roomId).emit("peer-media-state", {
        socketId: socket.id,
        mic,
        cam,
        screen,
      });
    });

    // ─── HOST CONTROLS ───────────────────────────────────────────────────────

    socket.on("host-action", ({ action, targetSocketId }) => {
      io.to(targetSocketId).emit("host-action", { action });
    });

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 2: IN-MEETING CHAT
    // ════════════════════════════════════════════════════════════════════════

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
      console.log(`[Chat] ${message.username}: ${clean.slice(0, 60)}`);
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

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 2: LIVE PARTICIPANT STATUS
    // ════════════════════════════════════════════════════════════════════════

    socket.on("status-update", ({ status }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      const safeStatus = ALLOWED_STATUSES.includes(status)
        ? status
        : "available";
      const room = rooms.get(roomId);
      if (room?.has(socket.id)) {
        room.get(socket.id).status = safeStatus;
      }

      io.to(roomId).emit("peer-status", {
        socketId: socket.id,
        username: socket.data.username,
        status: safeStatus,
      });

      console.log(`[Status] ${socket.data.username}: ${safeStatus}`);
    });

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 2: RAISE HAND
    // ════════════════════════════════════════════════════════════════════════

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

      console.log(`[Hand] ${socket.data.username} raised hand`);
    });

    socket.on("lower-hand", () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (room?.has(socket.id)) {
        const peer = room.get(socket.id);
        peer.handRaised = false;
        peer.handRaisedAt = null;
      }

      io.to(roomId).emit("hand-lowered", { socketId: socket.id });
      console.log(`[Hand] ${socket.data.username} lowered hand`);
    });

    socket.on("host-lower-hand", ({ targetSocketId }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (room?.has(targetSocketId)) {
        const peer = room.get(targetSocketId);
        peer.handRaised = false;
        peer.handRaisedAt = null;
      }

      io.to(roomId).emit("hand-lowered", { socketId: targetSocketId });
      io.to(targetSocketId).emit("host-action", { action: "lower-hand" });
    });

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 2: REACTIONS / EMOJI BURSTS
    // ════════════════════════════════════════════════════════════════════════

    socket.on("reaction", ({ emoji }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (!ALLOWED_REACTIONS.includes(emoji)) return;

      io.to(roomId).emit("reaction", {
        id: `rxn-${socket.id}-${Date.now()}`,
        socketId: socket.id,
        username: socket.data.username,
        emoji,
        timestamp: Date.now(),
      });

      console.log(`[Reaction] ${socket.data.username}: ${emoji}`);
    });

    // ─── DISCONNECT ──────────────────────────────────────────────────────────

    socket.on("disconnect", async () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (room) {
        room.delete(socket.id);

        // ── Close DB session when room becomes empty ────────────────────────
        await handleRoomLeave(roomId);

        if (room.size === 0) {
          rooms.delete(roomId);
          chatHistory.delete(roomId);
        }
      }

      // Clean waiting room too
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
}

export { rooms, chatHistory, waitingRooms };
