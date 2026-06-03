# Lumina Meet — Premium Real-Time Meeting Platform

A production-grade, dark-themed SaaS frontend for video meetings built with TanStack Start, React 19, Tailwind v4, Framer Motion, Zustand, and Axios. The video layer uses **real WebRTC** peer connections coordinated through a Socket.IO signaling server, with voice activity detection, screen sharing, noise suppression, background blur, ambient soundscapes, a collaborative whiteboard, live polls, meeting agendas, recording with Cloudinary upload, a full lobby system, private chat, spatial layout mode, and host controls.

---

## Quick Start

```bash
bun install
bun dev          # local dev  →  http://localhost:5173
bun run build    # production build
```

Demo OTP for any signup / reset flow: **`123456`**

---

## Folder Structure

```
src/
├── api/
│   ├── apiClient.ts            # Axios instance + interceptors + rate-limit hook
│   ├── endpoints.ts            # All REST endpoints in one place
│   └── services/
│       ├── authService.ts
│       └── meetingService.ts
│
├── components/
│   ├── auth/AuthShell.tsx      # Shared shell for sign-in surfaces
│   ├── effects/                # Particle background
│   ├── modals/                 # Generation, Welcome, RateLimit, Recording, Rename dialogs,
│   ├── ui/                     # shadcn primitives
│   └── ui-custom/              # NeonButton, FloatingInput, OtpInput, PasswordStrength
│
├── hooks/
│   ├── useWebRTC.ts            # Full WebRTC + Socket.IO hook (see below)
│   ├── useAmbientSound.ts      # Web Audio API soundscape engine
│   ├── useNoiseSuppression.ts  # RNNoise WASM worklet + gain-gate fallback
│   ├── useBackgroundBlur.ts    # MediaPipe Selfie Segmentation + canvas compositing
│   └── useRecording.ts         # MediaRecorder → Cloudinary upload pipeline
│
├── routes/
│   ├── __root.tsx              # Shell, providers, global overlays
│   ├── index.tsx               # Landing
│   ├── signup.tsx
│   ├── login.tsx
│   ├── verify-otp.tsx
│   ├── forgot-password.tsx     # 3-phase wizard
│   ├── reset-password.tsx
│   ├── dashboard.tsx           # Meetings tab + Recordings tab
│   ├── schedule.tsx
│   └── meeting.$id.tsx         # Video room + countdown screen
│
├── store/                      # Zustand stores (auth, ui)
├── lib/                        # cn() etc.
└── styles.css                  # Design tokens (oklch) + utility classes
```

---

## Design System

All visual decisions live in `src/styles.css`:

| Token              | Value        | Usage                                |
| ------------------ | ------------ | ------------------------------------ |
| `--background`     | `#0B0F19`    | Deep space dark base                 |
| `--neon-primary`   | indigo oklch | Buttons, borders, glow               |
| `--neon-secondary` | cyan oklch   | Speaking indicators, encrypted badge |
| `--neon-accent`    | purple oklch | Accents, avatars, private messages   |
| `--neon-danger`    | red oklch    | Leave button, error states, REC chip |

**Utility classes:** `glass`, `glass-strong`, `text-gradient`, `glow-primary`, `animate-pulse-glow`, `animate-pulse-danger`, `shimmer`, `animate-float`

Component variants (NeonButton: `primary` / `outline` / `ghost` / `danger`) consume tokens — components never hardcode hex colors.

---

## WebRTC Architecture

The video room is powered by a real WebRTC implementation split across two files:

```
src/hooks/useWebRTC.ts      ← all WebRTC + Socket.IO logic
src/routes/meeting.$id.tsx  ← UI: video grid, controls, panels
```

### How Peers Connect

```
1. useWebRTC connects to Socket.IO on VITE_SOCKET_URL
2. Emits join-room { roomId, username, userId }
3. Server responds with room-peers (existing participants)
4. Hook creates RTCPeerConnection for each existing peer
5. Sends SDP offer → server relays → peer answers
6. ICE candidates trickle via server until P2P path is found
7. Media (video/audio) flows directly browser-to-browser
8. Server is no longer involved in the media streams
```

### `useWebRTC` Hook

```typescript
import { useWebRTC } from "@/hooks/useWebRTC";

const webrtc = useWebRTC(
  roomId,
  username,
  SOCKET_URL,
  userId,
  (info) => setMeetingEndedInfo(info), // host ended for all
  () => setShowYouLeftModal(true), // this user intentionally left
);
```

Full return surface:

```typescript
// Media
localStream, localCameraStream, localSocketId,
mic, cam, sharing,
toggleMic, toggleCam, toggleScreenShare,
leaveRoom, endMeetingForAll,

// Participants & host controls
peers,
muteAll, camOffAll, removePeer,
isHost, isSubHost,
admitParticipant, rejectParticipant,
transferHost,
pendingParticipants, isWaiting,
lobbyKnockCount, clearLobbyKnockCount,

// VAD
isSpeaking, speakingPeerId,

// Chat
messages, typingPeers,
sendChatMessage, sendChatReaction, setTyping,
unreadCount, markRead,

// Status & reactions
localStatus, setStatus,
localHandRaised, raiseHand, lowerHand, lowerPeerHand,
raisedHands, reactions, sendReaction,

// Whiteboard
whiteboardElements, whiteboardCursors,
drawWhiteboardElement, eraseWhiteboardElement,
clearWhiteboard, syncWhiteboardElements,
broadcastWhiteboardCursor,

// Polls
currentPoll, createPoll, votePoll, closePoll, dismissPoll,

// Agenda
agenda, setAgenda,
agendaNext, agendaPrev, agendaGoto,
agendaTimerStart, agendaTimerPause,

// Audio processing
noiseSuppressionEnabled, noiseSuppressionSupported,
toggleNoiseSuppression,

// Background
backgroundMode, setBackgroundMode, isBlurProcessing,

// Layout
tilePositions, setTilePosition,
cinemaMode, setCinemaMode,
spotlightId, setSpotlightId,
autoSpotlight, setAutoSpotlight,
activeSpotlightId,

// Internal (for recording emit)
socketRef,

error, isConnecting,
```

### `RemotePeer` Type

```typescript
interface RemotePeer {
  socketId: string;
  username: string;
  stream: MediaStream | null; // video track
  audioStream: MediaStream | null; // audio track (separate for VAD)
  mic: boolean;
  cam: boolean;
  screen: boolean;
  speaking: boolean; // driven by remote VAD
  status: ParticipantStatus; // available | busy | away | presenting | brb
  handRaised: boolean;
  handRaisedAt: number | null;
  isHost: boolean;
  isSubHost: boolean;
}
```

### Media Controls — What Actually Happens

| Control               | Implementation                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Mute mic**          | `track.enabled = false` on all audio tracks — track stays alive, bandwidth drops to near zero                                             |
| **Stop cam**          | `track.stop()` → LED off; replaces sender with a silent black canvas track via `RTCRtpSender.replaceTrack()` so the connection stays open |
| **Start cam**         | `getUserMedia({ video })` → adds fresh track, replaces in all peer senders                                                                |
| **Screen share**      | `getDisplayMedia()` → replaces video sender track in all PCs; `track.onended` restores camera when user stops via browser UI              |
| **Stop screen share** | Restores original camera track to all senders; restores previous status                                                                   |

### Audio Tracks — Separate Streams

Remote audio is delivered via dedicated hidden `<audio>` elements injected into `document.body`. Video and audio senders use separate `MediaStream` objects so background blur, noise suppression, and VAD can each tap into the right stream independently.

### Voice Activity Detection (VAD)

Two VAD loops run via `AudioContext` + `AnalyserNode`:

**Local VAD** — polls every 80 ms, sets `isSpeaking` with a 600 ms silence debounce.

**Remote VAD** — polls the `AnalyserNode` of each peer's incoming audio stream every 80 ms, surfaces the loudest peer's socket ID as `speakingPeerId`. Drives the cyan speaking ring on video tiles and the banner above the footer.

```
VAD_THRESHOLD  = 18    (RMS volume 0–255)
VAD_POLL_MS    = 80    (sample interval)
VAD_SILENCE_MS = 600   (quiet duration before "stopped speaking")
```

### ICE / STUN Configuration

```typescript
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];
```

For deployments behind symmetric NAT (corporate networks, some mobile carriers), add a TURN server here.

### Post-Meeting Modals

The hook accepts two callbacks that control navigation after a session ends — navigation is intentionally deferred until the user dismisses the dialog:

| Event                         | Callback                 | Dialog shown                                                                  |
| ----------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| Host calls `endMeeting`       | `onMeetingEndedWithInfo` | "Meeting ended by \<host\>" for guests; "You ended this meeting" for the host |
| Participant calls `leaveRoom` | `onYouLeft`              | "You left — rejoin or go to dashboard"                                        |

`leaveRoom()` emits `leave-room` to the server (which fires `you-left` back) before disconnecting, giving the UI a clean hook to show the dialog before navigating.

### Host Controls

| Action            | Mechanism                                                                       |
| ----------------- | ------------------------------------------------------------------------------- | --------- |
| Mute a peer       | `socket.emit("host-action", { action: "mute", targetSocketId })`                |
| Cam off all       | Iterates `peers[]`, emits `host-action: "cam-off"` to each                      |
| Kick participant  | Emits `"remove"` → target dispatches `Lumina Meet:host-removed` → `leaveRoom()` |
| Transfer host     | `socket.emit("transfer-host", { targetSocketId, mode: "full"                    | "sub" })` |
| Admit from lobby  | `socket.emit("admit-participant", { targetSocketId })`                          |
| Reject from lobby | `socket.emit("reject-participant", { targetSocketId })`                         |

### Graceful Cleanup

`leaveRoom()` and the `useEffect` cleanup both:

- Close all `RTCPeerConnection` instances
- Stop all local `MediaStreamTrack`s (releases camera/mic hardware)
- Stop screen share tracks
- Remove all injected `<audio>` elements from the DOM
- Disconnect the Socket.IO socket
- Clear VAD intervals, timeouts, and `AudioContext`
- Close the noise suppression `AudioContext` if owned by the hook

---

## Video Room UI (`meeting.$id.tsx`)

### Routing

```
/meeting/:id                     → live room
/meeting/:id?scheduledFor=<ts>   → shows countdown if ts is in the future
```

### Layout Modes

Three layout modes are toggled from the **Layout** dropdown in the header:

| Mode        | Description                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------ |
| **Grid**    | Responsive CSS grid adapting to participant count (1→full screen, 2→side-by-side, 3-4→2×2, etc.) |
| **Spatial** | Freeform drag-and-drop canvas. Tiles are draggable; positions sync via `tilePositions` map.      |
| **Cinema**  | Full-screen spotlight on the active/pinned speaker; footer auto-hides and reappears on hover.    |

### Video Grid (Grid Mode)

| Participants | Grid                 |
| ------------ | -------------------- |
| 1            | Full screen (1 col)  |
| 2            | Side by side (2 col) |
| 3–4          | 2×2                  |
| 5–6          | 2×3                  |
| 7+           | 3×4                  |

### Cinema & Spotlight

Any tile can be pinned via the hover **Pin** button. Pinned tile is shown full-screen with a scrollable thumbnail strip on the right. `autoSpotlight` mode (toggleable in settings) automatically spotlights whoever is currently speaking.

### Screen Share View

Large central preview of the shared screen; thumbnail strip of all participants on the right (scrollable on mobile, vertical sidebar on desktop). The sharing participant's camera is included in the strip.

### Video Tiles

Each tile (`LocalVideoTile` / `RemoteVideoTile`) renders:

- Live `<video>` element when cam is on — local tile is mirrored (`scale-x-[-1]`)
- Gradient avatar fallback with initials when cam is off
- Cyan speaking ring + animated audio bars when VAD detects speech
- Status dot (available / busy / away / presenting / brb) in the top-right corner
- ✋ emoji overlay with a wave animation when the participant has raised their hand
- "Host" / "Co-Host" badge in the top-left corner
- Remove button (hover, host/co-host only) on remote tiles

### Room Controls (Footer)

| Button            | State off                            | State on                                       |
| ----------------- | ------------------------------------ | ---------------------------------------------- |
| Raise hand        | Neutral hand icon                    | Highlighted amber, wave animation, toast badge |
| React             | Smile+ neutral                       | Opens floating emoji picker (10 reactions)     |
| Whiteboard        | PenLine neutral                      | Panel opens, overlay covers video              |
| Mic               | `MicOff` red tint                    | `Mic` neutral                                  |
| Camera            | `VideoOff` red tint                  | `VideoIcon` neutral                            |
| Screen share      | `MonitorUp` neutral                  | `MonitorX` + pulse-glow                        |
| Leave             | Always red gradient, `PhoneOff` icon | —                                              |
| Cinema mode       | `Maximize2` neutral                  | `Minimize2` active glow                        |
| Noise suppression | `Mic2` neutral                       | Green glow, "Noise ON"                         |
| Soundscapes       | `Music2` neutral                     | Amber glow, active soundscape name             |
| Record (host)     | `CircleDot` neutral                  | Pulsing red `StopCircle` + `MM:SS` timer       |

### Side Panels

All panels slide in from the right with spring animations (`AnimatePresence`):

| Panel            | Contents                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Chat**         | Full message history, reply threading, emoji reactions, typing indicators, private messaging with recipient picker |
| **Participants** | Self entry, all peers with status/mic/cam, host actions (mute all, cam off, remove, transfer host)                 |
| **Whiteboard**   | Full-canvas SVG drawing overlay (see below)                                                                        |
| **Polls**        | Live poll creation, voting, results, close/dismiss                                                                 |
| **Agenda**       | Timed agenda items with per-item timer, host navigation controls                                                   |
| **Lobby**        | (Host/co-host only) Queue of waiting participants with admit/decline controls                                      |

### Speaking Banner

Floats above the footer controls. Shows animated audio bars + name of whoever is currently speaking. Disappears smoothly when silence is detected.

### Reaction Burst Layer

Full-screen floating emoji layer. Reactions float upward from the bottom with slight horizontal drift; each reaction shows the sender's name. Animations auto-expire after 4 seconds.

### Room States

| State                    | What renders                                      |
| ------------------------ | ------------------------------------------------- |
| Not logged in            | Glass card with login prompt                      |
| `scheduledFor` in future | Full-screen countdown (`CountdownScreen`)         |
| `isWaiting` (lobby)      | `LobbyGate` screen with animated waiting steps    |
| `isConnecting`           | Spinning `Loader2` with "Connecting to room…"     |
| `error` (expired link)   | Hourglass icon + contextual expired-link guidance |
| `error` (other)          | `AlertTriangle` + message + "Back to dashboard"   |
| Connected                | Full room UI                                      |

---

## Lobby System

### For Participants

When a room requires admission, the participant lands on `LobbyGate` — a full-screen waiting room with animated progress steps (Notified → Waiting → Enter). They can leave the lobby at any time.

### For Hosts / Co-Hosts

- **Knock toast** — a spring-animated toast appears in the top-right corner for each new knock, with Admit / Decline buttons. Up to 3 toasts stack; additional knocks show a "+N more → Open lobby" link.
- **Lobby panel** — a dedicated side panel lists all waiting participants with per-participant admit/decline controls and a security notice.
- **Knock sound** — a subtle two-tap chime plays via `AudioContext` when someone knocks.
- **Deny confirm modal** — declining a participant requires a confirmation modal to prevent accidental dismissal.
- `lobbyKnockCount` badge on the lobby panel toggle button counts unacknowledged knocks.

---

## Chat System

### Features

- **Full history** — server delivers chat history on join; new messages append in real time.
- **Reply threading** — hover any message and click the reply icon; the reply context box shows above the input and is attached to the sent message.
- **Emoji reactions** — hover a message and pick from the 10-reaction quick picker. Reactions toggle (same emoji = undo). Reaction counts update live for all participants.
- **Typing indicators** — animated audio bars + "X is typing…" with a 1.5 s silence debounce.
- **Private messaging** — a "To:" recipient selector above the input lets the sender choose specific participants. Private messages show a purple **Private** lock badge and a "Visible to:" annotation. The send button and bubble gradient change color for private messages.
- **Unread count** badge on the chat toggle button, cleared when the panel is opened.

---

## Collaborative Whiteboard

The whiteboard opens as a full-canvas overlay above the video grid.

### Tools

| Tool    | Shortcut | Behaviour                               |
| ------- | -------- | --------------------------------------- |
| Select  | V        | Placeholder (drag-to-move, coming soon) |
| Pen     | P        | Freehand stroke with configurable width |
| Eraser  | E        | Click any element to remove it          |
| Text    | T        | Click to place an editable text node    |
| Sticky  | S        | Click to place a sticky-note overlay    |
| Arrow   | A        | Click-drag to draw a directed arrow     |
| Rect    | R        | Click-drag to draw a rectangle          |
| Ellipse | O        | Click-drag to draw an ellipse           |

### Colours & Widths

8 preset colours and 4 stroke widths available in the left toolbar. Active selection is highlighted with a ring.

### Undo / Redo

Ctrl+Z / Ctrl+Shift+Z (or Cmd equivalents). A 50-step undo stack is maintained locally; undo/redo rebroadcast the full element list to all peers via `whiteboard-sync`.

### Real-Time Cursors

Remote participants' cursor positions are broadcast as fractional coordinates and rendered as coloured circles with name labels inside the SVG canvas.

### Sync

All element operations (`whiteboard-draw`, `whiteboard-erase`, `whiteboard-clear`, `whiteboard-sync`) are relayed by the signalling server to all room participants in real time.

---

## Polls

### For Hosts / Co-Hosts

- Create a poll with a question and 2–6 options.
- Launch it to all participants instantly.
- Close voting when ready.
- Dismiss the poll to remove it from all screens.

### For Participants

- Vote on open polls (one vote per participant).
- See live vote counts and percentages update in real time.
- The leading option is highlighted.
- `myVote` is preserved locally so the selection persists across re-renders.

A "Live poll" chip in the header pulses when a poll is active, linking directly to the Polls panel.

---

## Agenda

- Hosts set a list of timed agenda items (title + duration in minutes) before or during the meeting.
- A per-item countdown timer with pause/resume control is shown to all participants.
- A progress bar shows how far through the current item the session is (turns red in the final 30 seconds).
- Hosts can jump to any item or navigate forward/backward.
- The agenda state and timer ticks are broadcast to all participants via `agenda-state` and `agenda-tick` socket events.

---

## Noise Suppression (`useNoiseSuppression`)

### Strategy

1. **RNNoise WASM worklet** — attempts `AudioWorkletNode("noise-suppressor-processor")` loading `/noise-worklet.js`. This gives near-telephony-quality suppression when the worklet is available.
2. **Gain-gate fallback** — if the worklet is unavailable, a `setInterval`-based RMS analyser auto-calibrates a noise floor over the first ~1 second, then ramps a `GainNode` between 0 and 1 based on how far the live RMS exceeds the floor. Uses only standard Web Audio API nodes (no deprecated `ScriptProcessorNode`).

### Integration

The hook receives a `sharedAudioCtxRef` from `useWebRTC` to avoid creating a duplicate `AudioContext`. The processed audio track is swapped into the camera stream and replaces the audio sender in all active `RTCPeerConnection`s. Teardown restores the original track without stopping it.

---

## Background Blur / Virtual Backgrounds (`useBackgroundBlur`)

### Modes

| Mode              | Effect                                                   |
| ----------------- | -------------------------------------------------------- |
| `none`            | Raw camera output                                        |
| `blur`            | 18 px CSS blur on background; sharp person in foreground |
| `gradient-purple` | Purple-to-dark oklch gradient behind person              |
| `gradient-teal`   | Teal-to-dark oklch gradient behind person                |
| `gradient-dark`   | Near-black gradient behind person                        |

### Implementation

1. MediaPipe Selfie Segmentation WASM model is loaded lazily from jsDelivr CDN on first use (no npm install required).
2. A hidden `<video>` element feeds frames into the model at ~15 fps via `requestAnimationFrame`.
3. The segmentation mask is composited onto a `<canvas>` using `destination-in` / `destination-over` blend modes.
4. `canvas.captureStream(15)` produces a `MediaStream`; the video track is swapped into the camera stream and into all `RTCRtpSender`s.
5. If the CDN script fails to load, `startSimpleBlurLoop` applies a full-frame CSS blur as a graceful fallback.

---

## Ambient Soundscapes (`useAmbientSound`)

Three procedural soundscapes generated entirely in the browser via Web Audio API — no audio files required.

| Soundscape | Generation technique                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| **Rain**   | Pink noise → bandpass (rain body) + highpass (distant hiss) + lowpass (drip thud) using brown noise                   |
| **Lo-fi**  | Brown noise → lowpass (vinyl warmth) + sub-bass sine oscillator + LFO-wobbled triangle oscillator for shimmer         |
| **Café**   | Brown noise (room ambience) + pink noise (chatter) + scheduled `GainNode` envelope spikes for occasional clink sounds |

### Key Fixes (vs. prior version)

- `AudioContext` is created lazily on the first user gesture to satisfy browser autoplay policy.
- A `volumeRef` tracks the current volume to eliminate the stale closure bug where master gain was stuck at the initial value.
- `ctx.resume()` is awaited before building any nodes (Safari compatibility).
- Each soundscape builder is pure and owns only its created nodes, making teardown reliable with no node leaks.

---

## Recording (`useRecording`)

### Recording Modes

| Mode           | Captures                           | Typical bitrate |
| -------------- | ---------------------------------- | --------------- |
| `screen_voice` | Screen video + microphone audio    | ~2.8 Mbps       |
| `voice`        | Microphone audio only (audio/webm) | ~128 Kbps       |
| `screen`       | Screen video only (no audio)       | ~2.5 Mbps       |

### Pipeline

1. Host/co-host clicks **Record** → `RecordingOptionsModal` lets them choose a mode.
2. `startRecording(mode)` acquires the appropriate `MediaStream`:
   - `voice` → existing mic audio tracks from `localStream`
   - `screen` / `screen_voice` → `getDisplayMedia()` + optional mic tracks
3. `MediaRecorder` chunks data every second into `chunksRef`.
4. On stop, chunks are assembled into a `Blob` and passed to `uploadToCloudinary`:
   - Step 1: POST `/recording/signature` → receives a pre-signed Cloudinary upload ticket.
   - Step 2: XHR direct upload to Cloudinary with `onprogress` for a live progress bar (capped at 85% until the backend save completes).
   - Step 3: POST `/recording/save` → backend stores metadata and emails a link to the user.
5. `RecordingLinkModal` opens automatically when upload starts and shows progress, then reveals the Cloudinary URL with a copy button when done.

### Recording in Progress UI

- A pulsing red **REC MM:SS** chip appears in the header (visible to all participants).
- The stop button in the footer shows elapsed time and a pulsing danger ring.
- The recording state is broadcast to all peers via `recording-state` socket event.

### Socket Emit — Crash-Safe Design

`useRecording` accepts a plain `emitFn: (event, payload) => void` callback instead of a raw `socketRef`. This eliminates a stale-closure crash where `socketRef.current` was `null` by the time `recorder.onstop` fired during cleanup. The callback reads `window.__luminaSocket` at call time.

---

## Dashboard

### Tabs

The dashboard has two tabs:

**Recent Meetings** — meeting history grouped by meeting ID, with session timeline, duration stats, type badges (Live / Instant / Scheduled / Joined / Expired), and contextual CTAs (Join live, Rejoin, View countdown, Expired).

**Recordings** — all cloud recordings grouped by meeting. Each recording shows:

- Mode badge (Screen + Voice / Screen Only / Voice Only) with distinct colour coding
- Video thumbnail (if available) with a play-button hover overlay
- Duration and file size
- Cloudinary URL with copy and open-in-new-tab buttons
- Collapsible meeting groups with expand/collapse animation
- Stats bar (total recordings, total duration, total size)

### Dashboard Actions

- **Instant meeting** — opens `MeetingGenerationModal` (5-phase cinematic animation with progress ring).
- **Schedule meeting** — navigates to `/schedule`.
- **Join meeting** — modal with meeting link + optional title that records the join to history.
- **Send invites** — generates a meeting and emails invitations; reveals the meeting link with copy/new-meeting buttons.

---

## API Architecture

### `apiClient.ts`

- Axios instance with `baseURL: import.meta.env.VITE_API_BASE_URL`
- Request interceptor: attaches `Authorization: Bearer <token>` from localStorage
- Response interceptor: catches `429` and surfaces the global Rate Limit dialog
- Uses the mock adapter by default — **remove `adapter: mockAdapter` to point at a real backend**

### Environment

```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

`VITE_SOCKET_URL` is used by `meeting.$id.tsx` to connect the Socket.IO client. It defaults to `VITE_API_BASE_URL` (without `/api`) if not set separately.

### Mock API

All mock responses have a 700–1500 ms artificial delay. Any endpoint called more than **8× in 60 s** returns `429` and triggers the Rate Limit dialog.

| Endpoint                    | Method | Success response                                             |
| --------------------------- | ------ | ------------------------------------------------------------ |
| `/api/auth/signup`          | POST   | `{ message, email }`                                         |
| `/api/auth/login`           | POST   | `{ token, user }`                                            |
| `/api/auth/verify-otp`      | POST   | `{ verified, token, user }`                                  |
| `/api/auth/resend-otp`      | POST   | `{ message }`                                                |
| `/api/auth/forgot-password` | POST   | `{ message }`                                                |
| `/api/auth/reset-password`  | POST   | `{ message }`                                                |
| `/api/meeting/generate`     | POST   | `{ meetingId, link, createdAt }`                             |
| `/api/meeting/schedule`     | POST   | `{ meetingId, link, title, scheduledFor }`                   |
| `/api/meeting/invite`       | POST   | `{ sent }`                                                   |
| `/api/meeting/history`      | GET    | `{ items: [...] }`                                           |
| `/api/recording/signature`  | POST   | `{ signature, timestamp, cloudName, apiKey, publicId, ... }` |
| `/api/recording/save`       | POST   | `{ recording: RecordingEntry }`                              |
| `/api/user/recordings`      | GET    | `{ recordings: RecordingEntry[] }`                           |

Demo OTP: `123456` works for every flow.

---

## Key Flows

**Auth** — signup with live password strength meter → OTP verification with circular resend timer → 3-phase forgot-password wizard with sliding transitions → login with confetti-burst Welcome modal.

**Dashboard** — instant meeting, schedule, join by ID, invite by email, recent history with status badges, recordings tab with Cloudinary-hosted media.

**Meeting generation** — full-screen cinematic modal: 5 dynamic phases, animated progress ring, gradient glow that intensifies with progress, then reveals the link with copy & join.

**Schedule** — date + time picker generates a link; navigating to the room before start time shows a live countdown.

**Lobby** — participants waiting for admission see an animated LobbyGate. Hosts see knock toasts with one-click admit/decline, and a full lobby manager panel. A gentle two-tap chime plays for each new knock.

**Video room** — `useWebRTC` opens camera/mic, joins Socket.IO, negotiates RTCPeerConnection with every peer, streams real video/audio. Supports mic/camera toggle (with hardware LED off), screen share, three layout modes, cinema spotlight, VAD speaking detection, emoji reactions, hand raise, status picker, and all panels below.

**Chat** — real-time messaging with reply threads, emoji reactions, typing indicators, and private DMs to specific participants.

**Whiteboard** — SVG canvas overlay with 8 drawing tools, 8 colours, 4 stroke widths, undo/redo, real-time cursor sharing, and host clear-all.

**Polls** — host creates a live poll; all participants vote; results update in real time; host closes or dismisses.

**Agenda** — host sets timed items; countdown timer with pause/resume; all participants see the same view.

**Noise suppression** — one-click toggle; tries RNNoise WASM worklet first, falls back to gain-gate; processed track replaces the audio sender in all peer connections.

**Background blur** — choose blur or a gradient virtual background; MediaPipe segments the person at 15 fps; processed canvas stream replaces the video sender.

**Soundscapes** — procedurally generated rain, lo-fi, or café audio via Web Audio API nodes; volume slider; toggles off cleanly with no node leaks.

**Recording** — host/co-host picks screen+voice, voice-only, or screen-only; live REC indicator in header; stop uploads directly to Cloudinary; link revealed in a modal with copy button and email notification.

**Post-meeting dialogs** — host-ended shows personalised "ended by \<name\>" dialog to guests and "you ended it" confirmation to the host; voluntary leave shows a rejoin option. Navigation is always inside the dialog, never immediate.

**Rate limit** — dramatic pulsing dialog with retry countdown appears automatically on any `429` response.

---

## Tech Stack

| Layer             | Technology                                                                 |
| ----------------- | -------------------------------------------------------------------------- |
| Routing & SSR     | TanStack Start v1 (Vite-powered, file-based)                               |
| UI                | React 19                                                                   |
| Styling           | Tailwind CSS v4 (native `@theme`, oklch palette)                           |
| Animation         | Framer Motion (pages, modals, VAD bars, tile transitions, lobby toasts)    |
| State             | Zustand (auth + UI stores)                                                 |
| HTTP              | Axios + custom mock adapter                                                |
| Real-time         | Socket.IO client (WebRTC signalling + feature events)                      |
| Video/Audio       | Native WebRTC (`RTCPeerConnection`, `getUserMedia`, `getDisplayMedia`)     |
| VAD               | Web Audio API (`AudioContext`, `AnalyserNode`)                             |
| Noise suppression | AudioWorklet (RNNoise WASM) + gain-gate fallback                           |
| Background blur   | MediaPipe Selfie Segmentation WASM (CDN, lazy-loaded) + canvas compositing |
| Soundscapes       | Web Audio API (procedural — no audio files)                                |
| Recording         | `MediaRecorder` API → Cloudinary signed upload via XHR                     |
| Components        | shadcn/ui (Dialog, Popover, Calendar, Sonner)                              |

---

## Scripts

| Command           | Description                      |
| ----------------- | -------------------------------- |
| `bun dev`         | Dev server with HMR              |
| `bun run build`   | Production build                 |
| `bun run preview` | Preview production build locally |

---

<p align="center">Built with ❤️ for seamless video collaboration</p>
