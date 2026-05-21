<div align="center">

```
██╗     ██╗   ██╗███╗   ███╗██╗███╗   ██╗ █████╗     ███╗   ███╗███████╗███████╗████████╗
██║     ██║   ██║████╗ ████║██║████╗  ██║██╔══██╗    ████╗ ████║██╔════╝██╔════╝╚══██╔══╝
██║     ██║   ██║██╔████╔██║██║██╔██╗ ██║███████║    ██╔████╔██║█████╗  █████╗     ██║
██║     ██║   ██║██║╚██╔╝██║██║██║╚██╗██║██╔══██║    ██║╚██╔╝██║██╔══╝  ██╔══╝     ██║
███████╗╚██████╔╝██║ ╚═╝ ██║██║██║ ╚████║██║  ██║    ██║ ╚═╝ ██║███████╗███████╗   ██║
╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝    ╚═╝     ╚═╝╚══════╝╚══════╝   ╚═╝
```

**Production-grade, real-time video meeting platform — built for scale, security, and seamless P2P collaboration.**

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?style=flat-square&logo=socket.io&logoColor=white)](https://socket.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![Redis](https://img.shields.io/badge/Redis-7.x-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)

[Live Demo](#) · [API Docs](#api-reference) · [Report a Bug](issues) · [Request a Feature](issues)

</div>

---

## What Is Lumina Meet?

Lumina Meet is a **full-stack SaaS video conferencing platform** — think Google Meet or Zoom, built from scratch. It pairs a Node.js/Express REST + WebSocket backend with a React 19 frontend to deliver real, peer-to-peer video and audio through **native WebRTC**, coordinated by a Socket.IO signaling server.

Every piece — auth, signaling, media controls, host permissions, voice activity detection — is implemented in first principles, without third-party video SDKs.

**What makes it production-ready:**

- Multi-tier JWT authentication with refresh token rotation
- Redis-backed OTP flows and rate limiting (with graceful in-memory fallback)
- True P2P media via WebRTC — the server is never in the media path
- Voice activity detection (VAD) using the Web Audio API
- Host controls: mute, camera-off, and kick participants
- Screen sharing with automatic camera restoration on stop
- Transactional email for OTP, invites, meeting reminders, and password resets
- Dark-themed, animated UI with Framer Motion — responsive from mobile to ultrawide

---

## Monorepo Structure

```
lumina-meet/
├── backend/               # Node.js + Express API + Socket.IO signaling
│   └── src/
│       ├── config/        # DB, JWT, Redis
│       ├── controllers/   # Auth & Meeting controllers
│       ├── middlewares/   # Auth, rate limiting, error handling
│       ├── models/        # User, Meeting, Token (Mongoose)
│       ├── routes/        # /api/auth & /api/meeting
│       ├── socket/        # WebRTC signaling server
│       └── utils/         # OTP, email, token utilities
│
└── frontend/              # TanStack Start + React 19 + Tailwind v4
    └── src/
        ├── api/           # Axios client, endpoints, mock adapter
        ├── components/    # UI primitives + custom components
        ├── hooks/         # useWebRTC — full WebRTC + Socket.IO logic
        ├── routes/        # File-based routing (auth, dashboard, meeting room)
        ├── store/         # Zustand (auth, UI)
        └── styles.css     # Design tokens (oklch palette)
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LUMINA MEET                                 │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      React 19 Frontend                       │   │
│  │  TanStack Start · Tailwind v4 · Framer Motion · Zustand      │   │
│  └───────────────────────┬──────────────────┬───────────────────┘   │
│                          │ REST (Axios)      │ WebSocket             │
│                          ▼                  ▼                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   Express.js Backend                         │   │
│  │                                                             │   │
│  │  ┌──────────────────────┐  ┌──────────────────────────┐    │   │
│  │  │   REST API Server    │  │  Socket.IO Signaling      │    │   │
│  │  │                      │  │                          │    │   │
│  │  │  Rate Limiter        │  │  join-room / room-peers  │    │   │
│  │  │  JWT Auth Middleware │  │  offer / answer          │    │   │
│  │  │  Controllers         │  │  ice-candidate           │    │   │
│  │  │  Services            │  │  media-state             │    │   │
│  │  │  Mongoose Models     │  │  host-action             │    │   │
│  │  └──────────┬───────────┘  └──────────────────────────┘    │   │
│  │             │                                               │   │
│  │  ┌──────────▼───────────┐  ┌──────────────────────────┐    │   │
│  │  │   MongoDB Atlas      │  │  Redis (+ In-Mem fallback)│    │   │
│  │  │   Users · Meetings   │  │  OTP · Rate limit state  │    │   │
│  │  │   Refresh Tokens     │  └──────────────────────────┘    │   │
│  │  └──────────────────────┘                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│   Email: Brevo SMTP (OTP · Invites · Reminders · Password Reset)    │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              WebRTC P2P Layer (Browser ↔ Browser)            │  │
│  │  RTCPeerConnection · getUserMedia · getDisplayMedia          │  │
│  │  ICE (STUN: stun.l.google.com) · SDP negotiation            │  │
│  │  Voice Activity Detection (AudioContext + AnalyserNode)      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

> **The server is never in the media path.** Once WebRTC peers negotiate via the signaling server, all video and audio flows directly browser-to-browser.

---

## Tech Stack

### Backend

| Layer      | Technology                           | Purpose                                   |
| ---------- | ------------------------------------ | ----------------------------------------- |
| Runtime    | Node.js 18+                          | JavaScript runtime                        |
| Framework  | Express.js 4.x                       | HTTP routing & middleware                 |
| Database   | MongoDB Atlas + Mongoose 8.x         | Primary data store + schema modeling      |
| Auth       | JWT (jsonwebtoken)                   | Access tokens (15m) + refresh tokens (7d) |
| Cache      | Redis (ioredis) + in-memory fallback | OTP storage & rate limiting               |
| Real-time  | Socket.IO 4.x                        | WebRTC signaling & media-state relay      |
| Email      | Nodemailer + Brevo SMTP              | Transactional emails                      |
| Security   | Helmet + bcryptjs (12 rounds) + cors | Security headers & password hashing       |
| Validation | express-validator                    | Request body validation                   |

### Frontend

| Layer       | Technology                       | Purpose                                          |
| ----------- | -------------------------------- | ------------------------------------------------ |
| Routing/SSR | TanStack Start v1 (Vite-powered) | File-based routing                               |
| UI          | React 19                         | Component model                                  |
| Styling     | Tailwind CSS v4 (native @theme)  | oklch token-based design system                  |
| Animation   | Framer Motion                    | Page transitions, panels, VAD bars               |
| State       | Zustand                          | Auth + UI global state                           |
| HTTP        | Axios + mock adapter             | REST client with 429 interception                |
| Real-time   | Socket.IO client                 | WebRTC signaling transport                       |
| Video/Audio | Native WebRTC APIs               | RTCPeerConnection, getUserMedia, getDisplayMedia |
| VAD         | Web Audio API                    | AudioContext + AnalyserNode                      |
| Components  | shadcn/ui                        | Dialog, Popover, Calendar, Sonner                |

---

## Getting Started

### Prerequisites

- **Node.js** 18+ · **Bun** (frontend) · **npm** or **yarn** (backend)
- **MongoDB Atlas** account → [sign up free](https://www.mongodb.com/cloud/atlas)
- **Brevo** (formerly Sendinblue) SMTP credentials → [sign up free](https://www.brevo.com/)
- **Redis** (optional — falls back gracefully to in-memory)

---

### Backend Setup

```bash
cd backend
npm install

cp .env.example .env
# Fill in MONGO_URI, JWT secrets, Brevo SMTP, and Redis URL

npm run dev        # Development (nodemon)
npm start          # Production
```

**Backend `.env`**

```env
PORT=5000
NODE_ENV=development

# MongoDB Atlas (required)
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/lumina-meet?retryWrites=true&w=majority

# JWT (generate strong random strings, min 32 chars each)
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Brevo SMTP (required for email)
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=your-smtp-user@brevo.com
BREVO_SMTP_PASS=your-smtp-master-password
EMAIL_FROM_NAME=Lumina Meet
EMAIL_FROM_ADDRESS=noreply@luminameet.app

# Redis (optional)
REDIS_URL=redis://localhost:6379

# CORS
CLIENT_URL=http://localhost:5173

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=8
```

---

### Frontend Setup

```bash
cd frontend
bun install

# Create .env.local
echo "VITE_API_BASE_URL=http://localhost:5000/api" >> .env.local
echo "VITE_SOCKET_URL=http://localhost:5000" >> .env.local

bun dev            # http://localhost:5173
bun run build      # Production build
bun run preview    # Preview production build
```

> **Demo mode:** The frontend ships with a mock API adapter. The demo OTP for all flows is **`123456`**. To connect to the real backend, remove `adapter: mockAdapter` from `src/api/apiClient.ts`.

---

### Default Ports

| Service                 | Port | URL                   |
| ----------------------- | ---- | --------------------- |
| Backend API + Socket.IO | 5000 | http://localhost:5000 |
| Frontend Dev Server     | 5173 | http://localhost:5173 |

> Socket.IO shares port 5000 with the REST API — both are attached to the same `http.Server` instance.

---

## WebRTC Signaling

The signaling server (`backend/src/socket/signallingServer.js`) coordinates peer connections without ever handling media itself.

### Connection Flow

```
Newcomer                     Server                    Existing Peer
   │                           │                             │
   │── join-room ─────────────▶│                             │
   │◀─ room-peers ─────────────│                             │
   │                           │──── user-joined ───────────▶│
   │── offer ──────────────────│────────────────────────────▶│
   │                           │◀─── answer ────────────────│
   │◀─ answer ─────────────────│                             │
   │◀──▶ ice-candidate ────────│────────────────────────────▶│
   │                           │                             │
   │      [P2P media flows directly — server not involved]   │
```

### Socket Events

**Client → Server**

| Event           | Payload                      | Description                      |
| --------------- | ---------------------------- | -------------------------------- |
| `join-room`     | `{ roomId, username }`       | Join a meeting room              |
| `offer`         | `{ to, offer }`              | Send SDP offer to specific peer  |
| `answer`        | `{ to, answer }`             | Send SDP answer to specific peer |
| `ice-candidate` | `{ to, candidate }`          | Relay ICE candidate              |
| `media-state`   | `{ mic?, cam?, screen? }`    | Broadcast local media toggle     |
| `host-action`   | `{ action, targetSocketId }` | Mute / cam-off / remove a peer   |

**Server → Client**

| Event              | Payload                              | Description                   |
| ------------------ | ------------------------------------ | ----------------------------- |
| `room-peers`       | `[{ socketId, username, mic, cam }]` | Existing participants on join |
| `user-joined`      | `{ socketId, username, mic, cam }`   | New peer joined               |
| `offer`            | `{ from, username, offer }`          | Incoming SDP offer            |
| `answer`           | `{ from, answer }`                   | Incoming SDP answer           |
| `ice-candidate`    | `{ from, candidate }`                | Incoming ICE candidate        |
| `peer-media-state` | `{ socketId, mic?, cam?, screen? }`  | Peer toggled media            |
| `host-action`      | `{ action }`                         | `mute` / `cam-off` / `remove` |
| `user-left`        | `{ socketId }`                       | Peer disconnected             |

### ICE Configuration (STUN by default)

```javascript
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];
```

> For deployments behind symmetric NAT (corporate networks, some mobile carriers), add a TURN server to `ICE_SERVERS` in `src/hooks/useWebRTC.ts`. No other changes required.

---

## API Reference

**Base URL:** `http://localhost:5000/api`

**Response format:**

```json
// Success
{ "success": true, "data": { ... }, "message": "..." }

// Error
{ "success": false, "message": "...", "code": "ERROR_CODE", "details": { ... } }
```

### Authentication (`/api/auth`)

| Method | Endpoint                | Auth | Rate Limit | Description                         |
| ------ | ----------------------- | ---- | ---------- | ----------------------------------- |
| POST   | `/auth/signup`          | —    | 5 / min    | Initiate signup, send OTP           |
| POST   | `/auth/verify-otp`      | —    | 3 / min    | Verify OTP and create account       |
| POST   | `/auth/resend-otp`      | —    | 2 / 2 min  | Resend verification OTP             |
| POST   | `/auth/login`           | —    | 5 / min    | Login, returns access + refresh     |
| POST   | `/auth/refresh`         | —    | 100 / min  | Rotate access token                 |
| POST   | `/auth/forgot-password` | —    | 3 / hour   | Send password reset OTP             |
| POST   | `/auth/reset-password`  | —    | 3 / hour   | Reset password, revoke all sessions |
| POST   | `/auth/logout`          | —    | —          | Revoke current refresh token        |
| POST   | `/auth/logout-all`      | ✓    | —          | Revoke all sessions                 |
| GET    | `/auth/me`              | ✓    | —          | Get current user profile            |
| PATCH  | `/auth/profile`         | ✓    | —          | Update profile                      |

### Meetings (`/api/meeting`)

| Method | Endpoint            | Auth     | Rate Limit | Description             |
| ------ | ------------------- | -------- | ---------- | ----------------------- |
| POST   | `/meeting/generate` | ✓        | 10 / min   | Create instant meeting  |
| POST   | `/meeting/schedule` | ✓        | 10 / min   | Schedule future meeting |
| POST   | `/meeting/join/:id` | Optional | —          | Join a meeting          |
| POST   | `/meeting/invite`   | ✓        | 10 / min   | Invite participants     |
| GET    | `/meeting/history`  | ✓        | —          | Meeting history         |
| GET    | `/meeting/upcoming` | ✓        | —          | Upcoming meetings       |
| GET    | `/meeting/:id`      | ✓        | —          | Meeting details         |
| PATCH  | `/meeting/:id`      | ✓        | —          | Update meeting          |
| DELETE | `/meeting/:id`      | ✓        | —          | Cancel meeting          |
| POST   | `/meeting/:id/end`  | ✓        | —          | End active meeting      |

### Rate Limit Tiers

| Tier           | Routes                                          | Window | Limit |
| -------------- | ----------------------------------------------- | ------ | ----- |
| Auth           | `/auth/signup`, `/auth/login`                   | 1 min  | 5     |
| OTP            | `/auth/verify-otp`                              | 1 min  | 3     |
| Resend OTP     | `/auth/resend-otp`                              | 2 min  | 2     |
| Password Reset | `/auth/forgot-password`, `/auth/reset-password` | 1 hour | 3     |
| Meeting        | `/meeting/*`                                    | 1 min  | 10    |
| Global         | All `/api/*`                                    | 1 min  | 100   |

**429 Response:**

```json
{
  "success": false,
  "message": "Too many requests. Please try again in 45 seconds.",
  "retryAfter": 45
}
```

### Error Codes

| Code                  | HTTP | Description                      |
| --------------------- | ---- | -------------------------------- |
| `VALIDATION_ERROR`    | 400  | Invalid request data             |
| `INVALID_OTP`         | 400  | OTP verification failed          |
| `OTP_EXPIRED`         | 400  | OTP has expired                  |
| `UNAUTHORIZED`        | 401  | Missing or invalid token         |
| `TOKEN_EXPIRED`       | 401  | Access token expired             |
| `TOKEN_REVOKED`       | 401  | Refresh token revoked            |
| `INVALID_CREDENTIALS` | 401  | Wrong email or password          |
| `FORBIDDEN`           | 403  | Insufficient permissions         |
| `EMAIL_NOT_VERIFIED`  | 403  | Email verification required      |
| `MEETING_NOT_STARTED` | 403  | Too early to join scheduled room |
| `NOT_FOUND`           | 404  | Resource not found               |
| `EMAIL_EXISTS`        | 409  | Email already registered         |
| `RATE_LIMIT_EXCEEDED` | 429  | Too many requests                |
| `INTERNAL_ERROR`      | 500  | Server error                     |

---

## Authentication Flows

### Signup (OTP-verified)

```
POST /auth/signup { username, email, password }
  → Validate → generate OTP → store in Redis (5 min TTL) → send email
  ← { email, expiresIn: 300 }

POST /auth/verify-otp { email, otp }
  → Verify OTP (max 3 attempts) → create User → issue JWT pair
  ← { user, tokens: { accessToken, refreshToken } }
```

### Token Lifecycle

```
Access token expires (15 min)
  → POST /auth/refresh { refreshToken }
  → Verify refresh token hash in DB → rotate token
  ← { accessToken }

Refresh token expires (7 days) → full re-login required
```

### Forgot Password (3-phase)

```
Phase 1 → POST /auth/forgot-password { email }
           OTP sent to email, stored in Redis (10 min)
           Always returns 200 — prevents email enumeration

Phase 2 → User reads OTP from inbox

Phase 3 → POST /auth/reset-password { email, otp, newPassword }
           Verify OTP → hash new password → revoke ALL refresh tokens
```

---

## Database Models

### User

```javascript
{
  username:          String,   // 3–30 chars, alphanumeric + underscore
  email:             String,   // unique, validated
  password:          String,   // bcrypt hashed (12 rounds)
  isVerified:        Boolean,
  firstName:         String,
  lastName:          String,
  avatar:            String,
  status:            String,   // active | suspended | deleted
  lastLogin:         Date,
  loginCount:        Number,
  passwordChangedAt: Date,
  createdAt:         Date,
  updatedAt:         Date
}
```

### Meeting

```javascript
{
  host:                ObjectId,
  meetingId:           String,   // unique: vm-XXXX-XXXX-XXXX
  title:               String,
  description:         String,
  type:                String,   // instant | scheduled
  scheduledFor:        Date,
  duration:            Number,   // minutes (5–480)
  status:              String,   // pending | active | completed | cancelled
  password:            String,
  isPasswordProtected: Boolean,
  participants: [{
    email:   String,
    name:    String,
    status:  String,   // invited | joined | declined | left
    isHost:  Boolean,
  }],
  invitedEmails: [String],
  settings:      Object,
  meetingLink:   String,
  startedAt:     Date,
  completedAt:   Date,
  createdAt:     Date
}
```

### Refresh Token

```javascript
{
  userId:     ObjectId,
  tokenId:    String,   // UUID, rotation tracking
  tokenHash:  String,   // SHA-256 hash
  expiresAt:  Date,
  isRevoked:  Boolean,
  issuedByIp: String,
  userAgent:  String,
  lastUsedAt: Date,
  createdAt:  Date
}
```

---

## Frontend — Key Features

### Design System

All visual decisions live in `src/styles.css` as CSS custom properties:

| Token              | Value        | Usage                                |
| ------------------ | ------------ | ------------------------------------ |
| `--background`     | `#0B0F19`    | Deep space dark base                 |
| `--neon-primary`   | indigo oklch | Buttons, borders, glow               |
| `--neon-secondary` | cyan oklch   | Speaking indicators, encrypted badge |
| `--neon-accent`    | purple oklch | Accents, avatars                     |
| `--neon-danger`    | red oklch    | Leave button, error states           |

Utility classes: `glass`, `glass-strong`, `text-gradient`, `glow-primary`, `animate-pulse-glow`, `animate-pulse-danger`, `shimmer`, `animate-float`

### `useWebRTC` Hook

```typescript
const {
  localStream, // MediaStream from getUserMedia
  localSocketId, // this client's socket ID
  mic, // boolean
  cam, // boolean
  sharing, // boolean — screen share active

  peers, // RemotePeer[]

  toggleMic,
  toggleCam,
  toggleScreenShare,
  leaveRoom,

  muteAll, // host: force-mute all peers
  camOffAll, // host: force cam-off all peers
  removePeer, // host: (socketId) => void

  isSpeaking, // boolean — local VAD
  speakingPeerId, // string | null — loudest remote peer

  error,
  isConnecting,
} = useWebRTC(roomId, username, SOCKET_URL);
```

### Voice Activity Detection

```
VAD_THRESHOLD  = 18    (RMS volume, 0–255 scale)
VAD_POLL_MS    = 80    (sample interval)
VAD_SILENCE_MS = 600   (debounce before "stopped speaking")
```

Two parallel VAD loops run via `AudioContext + AnalyserNode` — one for the local microphone, one polling each remote peer's audio track. The loudest speaking peer drives the cyan speaking ring on their video tile and the floating banner above the controls.

### Media Controls — Implementation Details

| Control      | What actually happens                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| Mute mic     | `track.enabled = false` — track stays alive; bandwidth drops to near zero                               |
| Stop camera  | `track.stop()` → LED off; replaces sender with silent black canvas via `RTCRtpSender.replaceTrack()`    |
| Start camera | `getUserMedia({ video })` → fresh track added to stream and replaced in all peer senders                |
| Screen share | `getDisplayMedia()` → replaces video sender in all PCs; `track.onended` restores camera when user stops |

### Video Room Layouts

| Participants | Grid         |
| ------------ | ------------ |
| 1            | Full screen  |
| 2            | Side by side |
| 3–4          | 2×2          |
| 5–6          | 2×3          |
| 7+           | 3×4          |

Screen share view shows a large central preview with a scrollable thumbnail strip for participants.

### Route Overview

| Route                        | Description                                           |
| ---------------------------- | ----------------------------------------------------- |
| `/`                          | Landing page                                          |
| `/signup`                    | Signup with live password strength meter              |
| `/verify-otp`                | OTP input with circular resend timer                  |
| `/login`                     | Login with welcome confetti modal on success          |
| `/forgot-password`           | 3-phase wizard with sliding transitions               |
| `/reset-password`            | Reset with OTP verification                           |
| `/dashboard`                 | Instant meet · Schedule · Join by ID · History        |
| `/schedule`                  | Date/time picker, generates shareable link            |
| `/meeting/:id`               | Live video room (or countdown if meeting not started) |
| `/meeting/:id?scheduledFor=` | Countdown screen until scheduled start time           |

---

## Security

| Measure                      | Implementation                                                              |
| ---------------------------- | --------------------------------------------------------------------------- |
| Security headers             | Helmet.js (HSTS, CSP, X-Frame-Options, etc.)                                |
| Password hashing             | bcrypt, 12 salt rounds                                                      |
| Token signing                | JWT with issuer/audience verification                                       |
| Refresh token rotation       | Every use issues a new token; old one is immediately revoked                |
| Rate limiting                | Multi-tier Redis-backed (in-memory fallback)                                |
| Input validation             | express-validator on every endpoint                                         |
| CORS                         | Locked to `CLIENT_URL` only                                                 |
| NoSQL injection prevention   | Mongoose parameterized queries                                              |
| Email enumeration prevention | Consistent 200 response on `/forgot-password` regardless of email existence |
| Account lockout              | Suspended/deleted account handling in auth middleware                       |
| WebRTC privacy               | ICE candidates relayed via server; peer IPs only exposed post-consent       |
| OTP brute-force protection   | Max 3 attempts per OTP, TTL-enforced via Redis                              |

---

## Scripts

### Backend

| Command       | Description                  |
| ------------- | ---------------------------- |
| `npm start`   | Start production server      |
| `npm run dev` | Development server (nodemon) |
| `npm test`    | Run tests with Jest          |

### Frontend

| Command           | Description                      |
| ----------------- | -------------------------------- |
| `bun dev`         | Dev server with HMR              |
| `bun run build`   | Production build                 |
| `bun run preview` | Preview production build locally |

---

## Roadmap

### Phase 1 — WebRTC Core ✅ Complete

- [x] Socket.IO signaling server
- [x] RTCPeerConnection management (full mesh)
- [x] ICE / STUN configuration
- [x] Screen sharing with auto camera restore
- [x] Host controls (mute / cam-off / remove)
- [x] Voice activity detection (local + remote)
- [ ] TURN server integration for symmetric NAT
- [ ] SFU (Selective Forwarding Unit) for 5+ participant rooms

### Phase 2 — Real-Time Features

- [ ] In-meeting text chat (Socket.IO)
- [ ] Live participant status & presence
- [ ] Raise hand feature
- [ ] Emoji reactions

### Phase 3 — Recording & AI

- [ ] Meeting recording and cloud storage
- [ ] Audio transcription
- [ ] AI-generated meeting summaries

### Phase 4 — Scaling

- [ ] Microservices split (Auth, Meetings, Media)
- [ ] Redis pub/sub for multi-instance Socket.IO
- [ ] Kubernetes deployment
- [ ] CDN for static assets

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push the branch: `git push origin feature/your-feature`
5. Open a Pull Request

Please follow the existing code style and add tests for new functionality.

---

---

<div align="center">

Built with ❤️ for seamless video collaboration

**[⬆ Back to top](#)**

</div>
