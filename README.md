# Lumina Meet

> **Production-grade real-time video meeting platform** — dark-themed SaaS with a React 19 frontend and a Node.js/Express backend, connected over WebRTC and Socket.IO.

---

## Table of Contents

- [Overview](#overview)
- [Monorepo Structure](#monorepo-structure)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Tech Stack](#tech-stack)
- [Frontend](#frontend)
  - [Folder Structure](#frontend-folder-structure)
  - [Design System](#design-system)
  - [Key Routes](#key-routes)
  - [WebRTC Hook — `useWebRTC`](#webrtc-hook--usewebrtc)
  - [Video Room UI](#video-room-ui)
  - [Feature Modules](#feature-modules)
- [Backend](#backend)
  - [Folder Structure](#backend-folder-structure)
  - [API Reference](#api-reference)
  - [WebRTC Signaling](#webrtc-signaling)
  - [Authentication Flow](#authentication-flow)
  - [Rate Limiting](#rate-limiting)
  - [Error Handling](#error-handling)
  - [Security Features](#security-features)
  - [Database Models](#database-models)
  - [Recording Pipeline](#recording-pipeline)
- [Scripts](#scripts)

---

## Overview

Lumina Meet is a full-stack video conferencing platform built for real collaboration. The browser-to-browser video layer uses **real WebRTC** peer connections coordinated by a Socket.IO signaling server. On top of that foundation sits a complete feature set: voice activity detection, screen sharing, noise suppression, background blur, ambient soundscapes, a collaborative whiteboard, live polls, meeting agendas, cloud recording, a lobby system, private chat, spatial layout mode, and granular host controls.

Demo OTP for any signup / reset flow: **`123456`**

---

## Monorepo Structure

```
lumina-meet/
├── frontend/          # React 19 frontend (TanStack Start + Tailwind v4)
└── backend/           # Node.js + Express backend (MongoDB + Socket.IO)
```

---

## Quick Start

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm run build    # production build
```

### Backend

```bash
cd backend
npm install
cp .env.example .env   # configure variables — see below
npm run dev            # http://localhost:5000
npm start              # production
```

Both services must run simultaneously. Socket.IO shares the same port as the REST API (`5000`).

---

## Environment Variables

### Frontend (`frontend/.env`)

```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

`VITE_SOCKET_URL` defaults to `VITE_API_BASE_URL` (without `/api`) if not set separately.

### Backend (`backend/.env`)

```env
# Server
PORT=5000
NODE_ENV=development

# MongoDB Atlas (Required)
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/video-meet-db?retryWrites=true&w=majority

# JWT Secrets (min 32 chars each)
JWT_ACCESS_SECRET=your-super-secret-access-key-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Brevo SMTP (Required for email)
BREVO_SMTP_USER=your-smtp-user@brevo.com
BREVO_SMTP_PASS=your-smtp-master-password
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
EMAIL_FROM_NAME=Lumina Meet
EMAIL_FROM_ADDRESS=noreply@luminameet.app

# Cloudinary (Required for recording upload)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Redis (Optional — falls back to in-memory)
REDIS_URL=redis://localhost:6379

# CORS
CLIENT_URL=http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=8
```

---

## Tech Stack

| Layer             | Frontend                                         | Backend                                       |
| ----------------- | ------------------------------------------------ | --------------------------------------------- |
| Runtime           | Browser (Vite)                                   | Node.js 18+                                   |
| Framework         | React 19, TanStack Start v1                      | Express.js 4.x                                |
| Styling           | Tailwind CSS v4 (oklch palette)                  | —                                             |
| Animation         | Framer Motion                                    | —                                             |
| State             | Zustand                                          | —                                             |
| HTTP              | Axios + mock adapter                             | —                                             |
| Database          | —                                                | MongoDB Atlas (Mongoose 8.x)                  |
| Cache             | —                                                | Redis (ioredis) + in-memory fallback          |
| Auth              | JWT (localStorage)                               | JWT + bcrypt + token rotation                 |
| Real-time         | Socket.IO client                                 | Socket.IO 4.x server                          |
| Video/Audio       | Native WebRTC, getUserMedia, getDisplayMedia     | WebRTC signaling relay                        |
| VAD               | Web Audio API (AnalyserNode)                     | —                                             |
| Noise suppression | AudioWorklet (RNNoise WASM) + gain-gate fallback | —                                             |
| Background blur   | MediaPipe Selfie Segmentation WASM + canvas      | —                                             |
| Soundscapes       | Web Audio API (procedural, no audio files)       | —                                             |
| Recording         | MediaRecorder → Cloudinary XHR                   | Cloudinary signed upload, Mongoose metadata   |
| Email             | —                                                | Nodemailer + Brevo SMTP                       |
| Components        | shadcn/ui, custom NeonButton / FloatingInput     | —                                             |
| Security          | —                                                | Helmet, express-rate-limit, express-validator |

---

## Frontend

### Frontend Folder Structure

```
frontend/src/
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
│   ├── modals/                 # Generation, Welcome, RateLimit, Recording dialogs
│   ├── ui/                     # shadcn primitives
│   └── ui-custom/              # NeonButton, FloatingInput, OtpInput, PasswordStrength
│
├── hooks/
│   ├── useWebRTC.ts            # Full WebRTC + Socket.IO hook
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
├── lib/                        # cn() utility
└── styles.css                  # Design tokens (oklch) + utility classes
```

### Design System

All visual decisions live in `client/src/styles.css` using oklch color tokens.

| Token              | Value        | Usage                                |
| ------------------ | ------------ | ------------------------------------ |
| `--background`     | `#0B0F19`    | Deep space dark base                 |
| `--neon-primary`   | indigo oklch | Buttons, borders, glow               |
| `--neon-secondary` | cyan oklch   | Speaking indicators, encrypted badge |
| `--neon-accent`    | purple oklch | Accents, avatars, private messages   |
| `--neon-danger`    | red oklch    | Leave button, error states, REC chip |

Utility classes: `glass`, `glass-strong`, `text-gradient`, `glow-primary`, `animate-pulse-glow`, `animate-pulse-danger`, `shimmer`, `animate-float`

NeonButton variants: `primary` / `outline` / `ghost` / `danger` — all consume tokens, never hardcoded hex.

### Key Routes

| Route                            | Description                                |
| -------------------------------- | ------------------------------------------ |
| `/`                              | Landing page                               |
| `/signup`                        | Signup with live password strength meter   |
| `/login`                         | Login with confetti Welcome modal          |
| `/verify-otp`                    | OTP input with circular resend timer       |
| `/forgot-password`               | 3-phase wizard with sliding transitions    |
| `/dashboard`                     | Recent Meetings + Recordings tabs          |
| `/schedule`                      | Date/time picker for scheduled meetings    |
| `/meeting/:id`                   | Live video room                            |
| `/meeting/:id?scheduledFor=<ts>` | Countdown screen if meeting hasn't started |

### WebRTC Hook — `useWebRTC`

All peer-connection and signaling logic lives in `client/src/hooks/useWebRTC.ts`. The video room UI (`meeting.$id.tsx`) consumes the hook's return surface.

```typescript
const webrtc = useWebRTC(
  roomId,
  username,
  SOCKET_URL,
  userId,
  (info) => setMeetingEndedInfo(info), // host ended for all
  () => setShowYouLeftModal(true), // this user intentionally left
);
```

**How peers connect:**

```
1. Hook connects to Socket.IO on VITE_SOCKET_URL
2. Emits join-room { roomId, username, userId }
3. Server responds with room-peers (existing participants)
4. Hook creates RTCPeerConnection for each existing peer
5. Sends SDP offer → server relays → peer answers
6. ICE candidates trickle via server until P2P path is found
7. Media (video/audio) flows directly browser-to-browser
8. Server is no longer involved in the media streams
```

**ICE / STUN configuration:**

```typescript
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];
```

For deployments behind symmetric NAT, add a TURN server to `ICE_SERVERS` in both `useWebRTC.ts` and `server/src/socket/signallingServer.js`.

**Media control implementation:**

| Control           | Implementation                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Mute mic          | `track.enabled = false` — track stays alive, bandwidth drops to near zero                                    |
| Stop cam          | `track.stop()` → LED off; replaces sender with a silent black canvas track via `RTCRtpSender.replaceTrack()` |
| Start cam         | `getUserMedia({ video })` → fresh track, replaced in all peer senders                                        |
| Screen share      | `getDisplayMedia()` → replaces video sender track; `track.onended` restores camera                           |
| Stop screen share | Restores original camera track to all senders                                                                |

**Voice Activity Detection (VAD):**

Two VAD loops run via `AudioContext` + `AnalyserNode`. Local VAD polls every 80 ms with a 600 ms silence debounce. Remote VAD polls each peer's audio stream and surfaces the loudest peer's socket ID as `speakingPeerId`.

```
VAD_THRESHOLD  = 18    (RMS volume 0–255)
VAD_POLL_MS    = 80
VAD_SILENCE_MS = 600
```

**RemotePeer type:**

```typescript
interface RemotePeer {
  socketId: string;
  username: string;
  stream: MediaStream | null; // video track
  audioStream: MediaStream | null; // audio track (separate for VAD)
  mic: boolean;
  cam: boolean;
  screen: boolean;
  speaking: boolean;
  status: "available" | "busy" | "away" | "presenting" | "brb";
  handRaised: boolean;
  handRaisedAt: number | null;
  isHost: boolean;
  isSubHost: boolean;
}
```

### Video Room UI

**Layout modes:**

| Mode    | Description                                                                             |
| ------- | --------------------------------------------------------------------------------------- |
| Grid    | Responsive CSS grid (1 → full screen, 2 → side-by-side, 3–4 → 2×2, 5–6 → 2×3, 7+ → 3×4) |
| Spatial | Freeform drag-and-drop canvas; tile positions sync via `tilePositions` map              |
| Cinema  | Full-screen spotlight on active/pinned speaker; footer auto-hides on hover              |

**Room states:**

| State                    | What renders                            |
| ------------------------ | --------------------------------------- |
| Not logged in            | Glass card with login prompt            |
| `scheduledFor` in future | Full-screen countdown                   |
| `isWaiting` (lobby)      | `LobbyGate` with animated waiting steps |
| `isConnecting`           | Spinning loader                         |
| `error` (expired)        | Hourglass + guidance                    |
| Connected                | Full room UI                            |

**Footer controls:**

Mic, Camera, Screen share, Raise hand, React (emoji picker), Whiteboard, Cinema mode, Noise suppression, Soundscapes, Record (host only), Leave — each with distinct active/inactive visual states. A pulsing REC chip with elapsed time appears in the header during recording.

**Side panels** (spring-animated, slide in from right): Chat, Participants, Whiteboard, Polls, Agenda, Lobby (host/co-host only).

### Feature Modules

**Noise Suppression (`useNoiseSuppression`)**
Tries `AudioWorkletNode("noise-suppressor-processor")` first (RNNoise WASM). Falls back to a gain-gate using `setInterval` + `GainNode` with auto-calibrated noise floor. Shares `AudioContext` with `useWebRTC` to avoid duplicate contexts. Processed track replaces the audio sender in all active peer connections.

**Background Blur (`useBackgroundBlur`)**

| Mode                                                  | Effect                       |
| ----------------------------------------------------- | ---------------------------- |
| `none`                                                | Raw camera output            |
| `blur`                                                | 18 px CSS blur on background |
| `gradient-purple` / `gradient-teal` / `gradient-dark` | Virtual gradient background  |

MediaPipe Selfie Segmentation is loaded lazily from jsDelivr CDN. Frames are processed at ~15 fps via `requestAnimationFrame`; the composited canvas stream replaces the video sender in all peer connections. Falls back to full-frame CSS blur if CDN load fails.

**Ambient Soundscapes (`useAmbientSound`)**
Three procedurally generated soundscapes via Web Audio API — no audio files required.

| Soundscape | Technique                                                                        |
| ---------- | -------------------------------------------------------------------------------- |
| Rain       | Pink + brown noise through bandpass / highpass / lowpass chain                   |
| Lo-fi      | Brown noise → lowpass + sub-bass sine + LFO-wobbled triangle                     |
| Café       | Brown noise + pink noise + scheduled `GainNode` envelope spikes for clink sounds |

**Recording (`useRecording`)**

| Mode           | Captures                           |
| -------------- | ---------------------------------- |
| `screen_voice` | Screen video + microphone audio    |
| `voice`        | Microphone audio only (audio/webm) |
| `screen`       | Screen video only (no audio)       |

`MediaRecorder` chunks data every second. On stop, chunks are assembled into a `Blob` → pre-signed Cloudinary ticket → XHR direct upload with live progress bar → backend saves metadata and emails the host.

**Collaborative Whiteboard**
Full-canvas SVG overlay with 8 tools (Pen, Eraser, Text, Sticky, Arrow, Rect, Ellipse, Select), 8 colours, 4 stroke widths, 50-step undo/redo (Ctrl+Z / Ctrl+Shift+Z), and real-time cursor sharing. All operations sync to all peers via the signaling server.

**Polls**
One active poll per room. Hosts create, close, and dismiss polls. Participants vote once; results update live with leading option highlighted.

**Agenda**
Timed items with per-item countdown, pause/resume, progress bar (turns red in final 30 s). Hosts navigate items; state and timer ticks broadcast to all participants.

**Lobby System**
Participants land on an animated `LobbyGate`. Hosts receive spring-animated knock toasts (up to 3 stacked) with Admit / Decline buttons, a full lobby panel, and a two-tap chime on each knock.

**Chat**
Full history, reply threading, emoji reactions (toggle/undo), typing indicators (1.5 s debounce), and private DMs with per-recipient delivery. Unread count badge clears on panel open.

---

## Backend

### Backend Folder Structure

```
backend/src/
├── config/
│   ├── db.js                  # MongoDB Atlas connection with retry logic
│   ├── jwt.js                 # JWT configuration & settings
│   └── redis.js               # Redis client with in-memory fallback
│
├── constants/
│   └── index.js               # App constants (limits, regex, status codes)
│
├── controllers/
│   ├── authController.js      # Signup, login, OTP, password reset, profile
│   ├── meetingController.js   # CRUD, scheduling, history, invites, session tracking
│   └── recordingController.js # Cloudinary signature, save metadata, list recordings
│
├── middlewares/
│   ├── authMiddleware.js      # JWT verification, role checks
│   ├── rateLimiter.js         # Redis-based rate limiting (multiple tiers)
│   └── errorHandler.js        # Centralized error handling & asyncHandler wrapper
│
├── models/
│   ├── User.js                # User schema with auth & profile
│   ├── Meeting.js             # Meeting schema with sessions, participants, recordings
│   └── Token.js               # Refresh token storage with rotation support
│
├── routes/
│   ├── authRoutes.js          # /api/auth/* endpoints
│   └── meetingRoutes.js       # /api/meeting/* endpoints (includes recording routes)
│
├── socket/
│   └── signallingServer.js    # WebRTC signaling + all real-time feature events
│
├── utils/
│   ├── generateOTP.js         # Cryptographically secure OTP generation
│   ├── sendEmail.js           # Email templates (OTP, invites, reminders, recording-ready)
│   └── tokenUtils.js          # JWT sign/verify/rotate utilities
│
├── app.js                     # Express app configuration
└── server.js                  # Server startup, Socket.IO init & graceful shutdown
```

### API Reference

**Base URL:** `http://localhost:5000/api`

**Success response:**

```json
{ "success": true, "data": {}, "message": "Optional message" }
```

**Error response:**

```json
{ "success": false, "message": "Error description", "code": "ERROR_CODE" }
```

#### Authentication — `/api/auth`

| Method | Endpoint                | Auth | Description                    |
| ------ | ----------------------- | ---- | ------------------------------ |
| POST   | `/auth/signup`          | No   | Initiate signup, sends OTP     |
| POST   | `/auth/verify-otp`      | No   | Verify OTP & create account    |
| POST   | `/auth/resend-otp`      | No   | Resend verification OTP        |
| POST   | `/auth/login`           | No   | Login with credentials         |
| POST   | `/auth/refresh`         | No   | Refresh access token           |
| POST   | `/auth/forgot-password` | No   | Request password reset OTP     |
| POST   | `/auth/reset-password`  | No   | Reset password with OTP        |
| POST   | `/auth/logout`          | No   | Logout (revokes refresh token) |
| POST   | `/auth/logout-all`      | Yes  | Logout all devices             |
| GET    | `/auth/me`              | Yes  | Get current user profile       |
| PATCH  | `/auth/profile`         | Yes  | Update user profile            |

**Forgot password always returns 200** to prevent email enumeration.

#### Meetings — `/api/meeting`

| Method | Endpoint            | Auth     | Description                  |
| ------ | ------------------- | -------- | ---------------------------- |
| POST   | `/meeting/generate` | Yes      | Create instant meeting       |
| POST   | `/meeting/schedule` | Yes      | Schedule future meeting      |
| POST   | `/meeting/join/:id` | Optional | Join a meeting               |
| POST   | `/meeting/invite`   | Yes      | Invite participants by email |
| GET    | `/meeting/history`  | Yes      | Get meeting history          |
| GET    | `/meeting/upcoming` | Yes      | Get upcoming meetings        |
| GET    | `/meeting/:id`      | Yes      | Get meeting details          |
| PATCH  | `/meeting/:id`      | Yes      | Update meeting               |
| DELETE | `/meeting/:id`      | Yes      | Cancel meeting               |
| POST   | `/meeting/:id/end`  | Yes      | End active meeting           |

#### Recordings — `/api/meeting/recording`

| Method | Endpoint                       | Auth | Description                                    |
| ------ | ------------------------------ | ---- | ---------------------------------------------- |
| POST   | `/meeting/recording/signature` | Yes  | Generate Cloudinary signed upload ticket       |
| POST   | `/meeting/recording/save`      | Yes  | Save recording metadata + send email           |
| GET    | `/meeting/recordings`          | Yes  | List all recordings for the authenticated host |

The `/signature` endpoint returns `{ signature, timestamp, cloudName, apiKey, publicId, resourceType }`. The `publicId` encodes the full storage path (`lumina-meet/{meetingId}/{mode}-{timestamp}`) — do not pass `folder` separately or the path will double-nest.

### WebRTC Signaling

The signaling server (`signallingServer.js`) handles SDP relay and acts as an event bus for all in-meeting features. Socket.IO shares port `5000` with the REST API.

**In-memory room state per room:**

```
rooms           → Map<roomId, Map<socketId, PeerData>>
waitingRooms    → Map<roomId, Map<socketId, WaiterData>>
chatHistory     → Map<roomId, Message[]>       (max 200)
whiteboardState → Map<roomId, Element[]>       (max 2000)
pollState       → Map<roomId, Poll>
agendaState     → Map<roomId, AgendaState>
```

**Signaling flow:**

```
Newcomer                   Server                   Existing Peer
   │── join-room ─────────▶│                           │
   │                        │── join-request ──────────▶│ (lobby on)
   │◀─ waiting ─────────────│                           │
   │                        │◀── admit-participant ─────│
   │◀─ room-peers ──────────│                           │
   │◀─ chat-history ────────│                           │
   │◀─ whiteboard-state ────│                           │
   │◀─ poll / agenda state ─│                           │
   │                        │──── user-joined ──────────▶│
   │── offer ───────────────│──────────────────────────▶│
   │◀── answer ─────────────│                           │
   │◀──▶ ice-candidate ─────│──────────────────────────▶│
   │                        │                           │
   │  [P2P media flows directly — server not involved]  │
```

**Key client → server events:**

| Event                                                                           | Payload                                   | Notes                                        |
| ------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------- |
| `join-room`                                                                     | `{ roomId, username, userId }`            | Triggers lobby check                         |
| `leave-room`                                                                    | —                                         | Server emits `you-left` back before cleanup  |
| `end-meeting`                                                                   | —                                         | Host only; tears down room for all           |
| `offer` / `answer` / `ice-candidate`                                            | `{ to, offer/answer/candidate }`          | SDP relay                                    |
| `media-state`                                                                   | `{ mic?, cam?, screen? }`                 | Broadcast media toggle                       |
| `host-action`                                                                   | `{ action, targetSocketId }`              | `mute` / `cam-off` / `remove` / `lower-hand` |
| `admit-participant` / `reject-participant`                                      | `{ targetSocketId }`                      | Lobby management                             |
| `transfer-host`                                                                 | `{ targetSocketId, mode: "full"\|"sub" }` | Full transfer or co-host grant               |
| `chat-message`                                                                  | `{ text, replyTo?, recipients? }`         | Broadcast or private                         |
| `whiteboard-draw` / `whiteboard-erase` / `whiteboard-clear` / `whiteboard-sync` | element / id / — / elements               | Whiteboard sync                              |
| `poll-create` / `poll-vote` / `poll-close` / `poll-dismiss`                     | varies                                    | Poll lifecycle                               |
| `agenda-set` / `agenda-next` / `agenda-prev` / `agenda-goto`                    | varies                                    | Agenda navigation                            |
| `recording-state`                                                               | `{ recording, mode }`                     | Broadcasts REC indicator to all peers        |

**Key server → client events:**

| Event                                                                            | Description                                                            |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `room-peers`                                                                     | Existing peer list on join                                             |
| `user-joined` / `user-left`                                                      | Room membership changes                                                |
| `peer-media-state`                                                               | A peer toggled mic/cam/screen                                          |
| `meeting-ended`                                                                  | Host ended meeting; includes `hostUsername` for dialog differentiation |
| `you-left`                                                                       | Confirms intentional leave (triggers "You left" dialog)                |
| `you-are-host` / `you-are-subhost` / `you-are-participant`                       | Role assignment events                                                 |
| `waiting` / `admitted` / `join-rejected`                                         | Lobby lifecycle events                                                 |
| `lobby-knock`                                                                    | Triggers knock toast + chime for hosts                                 |
| `chat-history` / `chat-message` / `chat-reaction` / `chat-typing`                | Chat events                                                            |
| `whiteboard-state` / `whiteboard-draw` / `whiteboard-erase` / `whiteboard-clear` | Whiteboard sync                                                        |
| `poll-state` / `poll-update` / `poll-closed` / `poll-dismissed`                  | Poll lifecycle                                                         |
| `agenda-state` / `agenda-tick` / `agenda-complete`                               | Agenda sync                                                            |

**Lobby flow:**
When `meeting.settings.waitingRoom` is `true` (default), participants are queued. The meeting host (and known co-hosts) bypass the lobby entirely. Admitted participants receive full `room-peers`, `chat-history`, `whiteboard-state`, `poll-state`, and `agenda-state` immediately.

**Host controls:**
`host-action` targets a specific participant. `end-meeting` calls `teardownRoom()` which broadcasts `meeting-ended`, kicks lobby waiters, clears all in-memory maps, and closes the session in MongoDB.

**Post-meeting dialogs:**
`meeting-ended` includes `hostUsername`. Clients show "You ended this meeting" to the host and "Meeting ended by \<name\>" to participants — no second network call needed. Intentional leave (`leave-room` → `you-left`) shows a "You left — rejoin or go to dashboard" dialog before `socket.disconnect()`.

### Authentication Flow

**Signup:**

```
POST /auth/signup → OTP stored in Redis (5 min TTL) → email sent
POST /auth/verify-otp → user created → JWT pair issued
```

**Token refresh:**

```
Access token expires (15 m)
POST /auth/refresh → verify refresh token hash in DB → new access token
```

**Forgot password (3-phase):**

```
Phase 1: POST /auth/forgot-password → OTP in Redis (10 min TTL), always 200
Phase 2: User reads OTP from email
Phase 3: POST /auth/reset-password → verify OTP → hash password → revoke all refresh tokens
```

### Rate Limiting

| Tier           | Routes                                          | Window | Max |
| -------------- | ----------------------------------------------- | ------ | --- |
| Auth           | `/auth/signup`, `/auth/login`                   | 1 min  | 5   |
| OTP verify     | `/auth/verify-otp`                              | 1 min  | 3   |
| Resend OTP     | `/auth/resend-otp`                              | 2 min  | 2   |
| Password reset | `/auth/forgot-password`, `/auth/reset-password` | 1 hour | 3   |
| Meeting        | `/meeting/*`                                    | 1 min  | 10  |
| General API    | All `/api/*`                                    | 1 min  | 100 |

`429` responses include `retryAfter` seconds. The frontend intercepts `429` globally and surfaces a pulsing Rate Limit dialog.

### Error Handling

| Code                        | HTTP | Description                   |
| --------------------------- | ---- | ----------------------------- |
| `VALIDATION_ERROR`          | 400  | Invalid request data          |
| `INVALID_OTP`               | 400  | OTP verification failed       |
| `OTP_EXPIRED`               | 400  | OTP has expired               |
| `UNAUTHORIZED`              | 401  | Missing / invalid token       |
| `TOKEN_EXPIRED`             | 401  | Access token expired          |
| `INVALID_CREDENTIALS`       | 401  | Wrong email / password        |
| `FORBIDDEN`                 | 403  | Insufficient permissions      |
| `MEETING_NOT_STARTED`       | 403  | Too early to join (scheduled) |
| `NOT_FOUND`                 | 404  | Resource not found            |
| `EMAIL_EXISTS`              | 409  | Email already registered      |
| `RATE_LIMIT_EXCEEDED`       | 429  | Too many requests             |
| `CLOUDINARY_NOT_CONFIGURED` | 500  | Cloudinary env vars missing   |
| `INTERNAL_ERROR`            | 500  | Unexpected server error       |

### Security Features

- **Helmet.js** — HSTS, CSP, X-Frame-Options, and other security headers
- **bcrypt** — Password hashing with 12 salt rounds
- **JWT** — Signed tokens with issuer/audience verification; access tokens expire in 15 m
- **Token rotation** — Refresh tokens rotated on each use; old token immediately revoked
- **Multi-tier rate limiting** — Redis-backed; falls back to in-memory
- **Input validation** — express-validator on all REST endpoints; `sanitizeText()` in signaling (HTML stripped, max 2000 chars, only 10 allowed reaction emoji)
- **CORS** — Restricted to `CLIENT_URL` origin only
- **NoSQL injection prevention** — Mongoose parameterized queries
- **Email enumeration prevention** — Consistent 200 on forgot-password
- **Cloudinary signed uploads** — Binary content never routes through the API server
- **Poll vote integrity** — One vote per `socketId` stored server-side; double-counting impossible
- **Whiteboard authorship** — Server attaches `author`/`authorId` server-side; clients cannot spoof

### Database Models

**User**

```
username (3–30 chars, unique), email (unique), password (bcrypt),
isVerified, firstName, lastName, avatar,
status (active | suspended | deleted), lastLogin, loginCount,
passwordChangedAt, createdAt, updatedAt
```

**Meeting**

```
host (ref: User), meetingId (vm-XXXX-XXXX-XXXX, unique), title, description,
type (instant | scheduled | joined), scheduledFor, duration (5–480 min),
status (pending | active | completed | cancelled),
sessions [], recordings [], participants [], invitedEmails [],
settings { waitingRoom, allowRecording, enableChat, ... },
maxParticipants (2–1000), meetingLink, startedAt, completedAt
```

Recording subdocument fields: `recordingId`, `mode`, `cloudinaryUrl`, `cloudinaryPublicId`, `thumbnailUrl`, `durationSec`, `fileSizeBytes`.

**Refresh Token**

```
userId, tokenId (UUID), tokenHash (SHA-256), expiresAt, isRevoked,
issuedByIp, userAgent, lastUsedAt, createdAt
```

### Recording Pipeline

```
1. Client → POST /recording/signature
   Server generates Cloudinary signature
   publicId = "lumina-meet/{meetingId}/{mode}-{timestamp}"
   Returns: { signature, timestamp, cloudName, apiKey, publicId, resourceType }

2. Client → XHR direct upload to Cloudinary
   Progress bar capped at 85% until backend save completes

3. Client → POST /recording/save
   Server builds cloudinaryUrl and thumbnailUrl from publicId
   Pushes RecordingEntry to meeting.recordings[]
   Sends recording-ready email to host (fire-and-forget)
   Returns full RecordingEntry

4. Dashboard → GET /meeting/recordings
   Aggregates recordings across all hosted meetings, newest first
```

**Cloudinary URL patterns:**

```
Video:     https://res.cloudinary.com/{cloud}/video/upload/{publicId}.mp4
Voice:     https://res.cloudinary.com/{cloud}/raw/upload/{publicId}.webm
Thumbnail: https://res.cloudinary.com/{cloud}/video/upload/so_0,w_480,h_270,c_fill,q_60/{publicId}.jpg
```

Thumbnail is `null` for `voice` recordings (`resourceType: raw`).

---

## Scripts

### Frontend (`client/`)

| Command           | Description                             |
| ----------------- | --------------------------------------- |
| `bun dev`         | Dev server with HMR at `localhost:5173` |
| `bun run build`   | Production build                        |
| `bun run preview` | Preview production build locally        |

### Backend (`server/`)

| Command       | Description                     |
| ------------- | ------------------------------- |
| `npm run dev` | Development server with nodemon |
| `npm start`   | Production server               |
| `npm test`    | Run tests with Jest             |

---

<p align="center">Built with ❤️ for seamless video collaboration</p>
