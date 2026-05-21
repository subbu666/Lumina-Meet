/**
 * WebRTC Signaling Server — Lumina Meet Phase 2
 *
 * Phase 1 (existing):
 *  • join-room / room-peers / user-joined
 *  • offer / answer / ice-candidate (SDP relay)
 *  • media-state (mic/cam/screen toggles)
 *  • host-action (mute / cam-off / remove)
 *  • disconnect → user-left
 *
 * Phase 2 (new):
 *  • In-meeting chat        → chat-message / chat-history
 *  • Live participant status → status-update / peer-status
 *  • Raise hand             → raise-hand / lower-hand / hand-state
 *  • Reactions / emoji      → reaction / reaction-burst
 */

// ─── Room state ───────────────────────────────────────────────────────────────
// roomId → Map<socketId, PeerInfo>
const rooms = new Map();

// roomId → ChatMessage[]   (in-memory ring buffer, last 200 messages)
const chatHistory = new Map();

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

function getChatHistory(roomId) {
  if (!chatHistory.has(roomId)) chatHistory.set(roomId, []);
  return chatHistory.get(roomId);
}

function pushChat(roomId, message) {
  const history = getChatHistory(roomId);
  history.push(message);
  // Keep only the last MAX_CHAT_HISTORY messages
  if (history.length > MAX_CHAT_HISTORY) {
    history.splice(0, history.length - MAX_CHAT_HISTORY);
  }
}

function sanitizeText(text) {
  if (typeof text !== "string") return "";
  // Strip HTML tags, trim, cap length
  return text
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, 2000);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function initSignaling(io) {
  io.on("connection", (socket) => {
    console.log(`[WS] connected: ${socket.id}`);

    // ─── JOIN ───────────────────────────────────────────────────────────────
    socket.on("join-room", ({ roomId, username }) => {
      if (!roomId || !username) return;

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.username = username;

      const room = getRoom(roomId);

      // Tell the newcomer who's already here
      const existingPeers = [];
      for (const [sid, info] of room.entries()) {
        existingPeers.push({ socketId: sid, ...info });
      }
      socket.emit("room-peers", existingPeers);

      // Send chat history to the newcomer
      socket.emit("chat-history", getChatHistory(roomId));

      // Add newcomer to room state
      room.set(socket.id, {
        username,
        mic: true,
        cam: true,
        screen: false,
        // Phase 2 state
        status: "available",
        handRaised: false,
        handRaisedAt: null,
      });

      // Notify everyone else
      socket.to(roomId).emit("user-joined", {
        socketId: socket.id,
        username,
        mic: true,
        cam: true,
        status: "available",
        handRaised: false,
      });

      console.log(
        `[WS] ${username} joined room ${roomId} (${room.size} peers)`,
      );
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
        // Auto-set status to "presenting" when screen sharing starts
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

    /**
     * Client emits: chat-message { text, replyTo? }
     * Server broadcasts to room: chat-message { id, socketId, username, text, timestamp, replyTo? }
     * Server also echoes back to sender so they see their own message rendered.
     */
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
        replyTo: replyTo ?? null, // { id, username, text } of the message being replied to
      };

      // Persist to in-memory history
      pushChat(roomId, message);

      // Broadcast to everyone in the room including sender
      io.to(roomId).emit("chat-message", message);

      console.log(`[Chat] ${message.username}: ${clean.slice(0, 60)}`);
    });

    /**
     * Client emits: chat-reaction { messageId, emoji }
     * Server broadcasts: chat-reaction { messageId, emoji, socketId, username }
     */
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

    /**
     * Client emits: chat-typing { isTyping }
     * Server broadcasts to others: chat-typing { socketId, username, isTyping }
     * (Not stored — ephemeral)
     */
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

    /**
     * Client emits: status-update { status }
     * status ∈ { "available" | "busy" | "away" | "presenting" | "brb" }
     * Server broadcasts to room: peer-status { socketId, username, status }
     */
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

    /**
     * Client emits: raise-hand {}
     * Server broadcasts to room: hand-raised { socketId, username, handRaisedAt }
     * Hand is lowered by: lower-hand or host-action "lower-hand"
     */
    socket.on("raise-hand", () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (room?.has(socket.id)) {
        const peer = room.get(socket.id);
        if (peer.handRaised) return; // debounce — already raised
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

    /**
     * Client emits: lower-hand {}
     * Server broadcasts: hand-lowered { socketId }
     */
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

    /**
     * Host can lower any participant's hand
     * Client emits: host-lower-hand { targetSocketId }
     */
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
      // Also notify the target so they see their own hand lowered
      io.to(targetSocketId).emit("host-action", { action: "lower-hand" });
    });

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 2: REACTIONS / EMOJI BURSTS
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Client emits: reaction { emoji }
     * Server validates and broadcasts to room: reaction { socketId, username, emoji, id }
     * The "id" lets clients deduplicate burst animations.
     */
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

    socket.on("disconnect", () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (room) {
        room.delete(socket.id);
        if (room.size === 0) {
          rooms.delete(roomId);
          // Keep chat history a bit longer — clear only when room fully empty
          // Uncomment below to purge immediately:
          // chatHistory.delete(roomId);
        }
      }

      socket.to(roomId).emit("user-left", { socketId: socket.id });

      // Notify room that typing stopped (if they were typing)
      socket.to(roomId).emit("chat-typing", {
        socketId: socket.id,
        username: socket.data.username,
        isTyping: false,
      });

      console.log(`[WS] ${socket.data.username} left room ${roomId}`);
    });
  });
}

export { rooms, chatHistory };
