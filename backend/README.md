# Lumina Meet API

> **Production-grade backend API** for a real-time video meeting SaaS platform. Built with Node.js, Express, MongoDB, Redis, and Socket.IO — designed for scalability, security, and seamless real-time communication.

---

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
  - [Authentication](#authentication)
  - [Meetings](#meetings)
  - [Recordings](#recordings)
- [WebRTC Signaling](#webrtc-signaling)
  - [Room State](#room-state)
  - [Events Reference](#events-reference)
  - [Lobby System](#lobby-system)
  - [Host Controls](#host-controls)
  - [Collaborative Whiteboard](#collaborative-whiteboard)
  - [Live Polls](#live-polls)
  - [Shared Agenda](#shared-agenda)
  - [Chat](#chat)
  - [Status, Reactions & Hand Raise](#status-reactions--hand-raise)
  - [Post-Meeting Dialogs](#post-meeting-dialogs)
  - [Signaling Flow](#signaling-flow)
- [Authentication Flow](#authentication-flow)
- [Rate Limiting](#rate-limiting)
- [Error Handling](#error-handling)
- [Security](#security)
- [Database Models](#database-models)
- [Recording Pipeline](#recording-pipeline)

---

## Architecture

```
Client (React / Browser)
    │
    ├──▶ REST API (Express + Helmet + CORS)
    │         │
    │         ├──▶ Rate Limiter (Redis / In-Memory fallback)
    │         ├──▶ Auth Middleware (JWT verification, role checks)
    │         └──▶ Controllers → Services → Models (Mongoose + MongoDB Atlas)
    │                   │
    │                   ├── authController      (signup, login, OTP, password reset)
    │                   ├── meetingController   (CRUD, scheduling, history, invites)
    │                   └── recordingController (Cloudinary signature, save, list)
    │
    └──▶ WebSocket (Socket.IO — /socket.io, shared port)
              │
              └──▶ signallingServer.js
                        │
                        ├── join-room / room-peers / lobby queue
                        ├── offer / answer / ice-candidate      (WebRTC SDP relay)
                        ├── media-state                          (mic / cam / screen)
                        ├── host-action / end-meeting / leave-room
                        ├── chat-message / chat-reaction / chat-typing
                        ├── status-update / raise-hand / lower-hand / reaction
                        ├── whiteboard-draw / erase / clear / sync / cursor
                        ├── poll-create / vote / close / dismiss
                        ├── agenda-set / next / prev / goto / timer-start / timer-pause
                        └── disconnect (peer cleanup + session tracking)

Email: Brevo SMTP (OTP verification, meeting invites, reminders, recording-ready)
Storage: Cloudinary (direct signed upload — binary never routes through this server)
```

---

## Tech Stack

| Layer      | Technology                             | Purpose                                  |
| ---------- | -------------------------------------- | ---------------------------------------- |
| Runtime    | Node.js 18+                            | JavaScript runtime                       |
| Framework  | Express.js 4.x                         | HTTP server & routing                    |
| Database   | MongoDB Atlas                          | Primary data store                       |
| ODM        | Mongoose 8.x                           | Schema modeling & queries                |
| Auth       | JWT (jsonwebtoken)                     | Access + refresh tokens                  |
| Cache      | Redis (ioredis) + in-memory fallback   | OTP storage & rate limiting              |
| Real-time  | Socket.IO 4.x                          | WebRTC signaling & feature event relay   |
| Signaling  | WebRTC (STUN)                          | Peer-to-peer video/audio coordination    |
| Storage    | Cloudinary                             | Recording storage & thumbnail generation |
| Email      | Nodemailer + Brevo SMTP                | Transactional emails                     |
| Security   | Helmet + bcryptjs + express-rate-limit | Security headers & encryption            |
| Validation | express-validator                      | Request validation                       |

---

## Project Structure

```
src/
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

---

## Getting Started

### Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **MongoDB Atlas** account ([Sign up](https://www.mongodb.com/cloud/atlas))
- **Brevo** (formerly Sendinblue) account for SMTP ([Sign up](https://www.brevo.com/))
- **Cloudinary** account for recording storage ([Sign up](https://cloudinary.com/))
- **Redis** (optional — falls back to in-memory if unavailable)

### Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd video-meet-api

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env

# 4. Configure environment variables (see below)
nano .env

# 5. Start development server
npm run dev

# 6. Start production server
npm start
```

### Default Ports

| Service                      | Port | URL                   |
| ---------------------------- | ---- | --------------------- |
| API Server                   | 5000 | http://localhost:5000 |
| Socket.IO (WebRTC signaling) | 5000 | ws://localhost:5000   |
| Frontend (CORS)              | 5173 | http://localhost:5173 |

> Socket.IO shares the same port as the REST API — both are attached to the same `http.Server` instance in `server.js`.

---

## Environment Variables

```env
# Server
PORT=5000
NODE_ENV=development

# MongoDB Atlas (Required)
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/video-meet-db?retryWrites=true&w=majority

# JWT Secrets (Required — generate strong random strings, min 32 chars)
JWT_ACCESS_SECRET=your-super-secret-access-key-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Brevo SMTP (Required for email)
BREVO_SMTP_USER=your-smtp-user@brevo.com
BREVO_SMTP_PASS=your-smtp-master-password
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587

# Email From Address
EMAIL_FROM_NAME=Lumina Meet
EMAIL_FROM_ADDRESS=noreply@luminameet.app

# Cloudinary (Required for recording upload)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Redis (Optional — falls back to in-memory)
REDIS_URL=redis://localhost:6379

# Client URL for CORS
CLIENT_URL=http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=8
```

---

## API Reference

### Base URL

```
http://localhost:5000/api
```

### Response Format

**Success:**

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

**Error:**

```json
{
  "success": false,
  "message": "Error description",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

---

## Authentication

All auth endpoints are prefixed with `/api/auth`.

### Endpoints Summary

| Method | Endpoint                | Auth | Rate Limit | Description                    |
| ------ | ----------------------- | ---- | ---------- | ------------------------------ |
| POST   | `/auth/signup`          | No   | 5/min      | Initiate signup, sends OTP     |
| POST   | `/auth/verify-otp`      | No   | 3/min      | Verify OTP & create account    |
| POST   | `/auth/resend-otp`      | No   | 2/2min     | Resend verification OTP        |
| POST   | `/auth/login`           | No   | 5/min      | Login with credentials         |
| POST   | `/auth/refresh`         | No   | 100/min    | Refresh access token           |
| POST   | `/auth/forgot-password` | No   | 3/hour     | Request password reset OTP     |
| POST   | `/auth/reset-password`  | No   | 3/hour     | Reset password with OTP        |
| POST   | `/auth/logout`          | No   | —          | Logout (revokes refresh token) |
| POST   | `/auth/logout-all`      | Yes  | —          | Logout all devices             |
| GET    | `/auth/me`              | Yes  | —          | Get current user profile       |
| PATCH  | `/auth/profile`         | Yes  | —          | Update user profile            |

---

### POST `/auth/signup`

Creates a pending signup and sends OTP via email.

**Request:**

```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Validation:** `username` 3–30 chars (alphanumeric + underscores); `email` valid format; `password` min 8 chars with at least 1 uppercase, 1 lowercase, 1 number.

**Success (200):**

```json
{
  "success": true,
  "message": "Verification code sent to john@example.com. Please check your inbox.",
  "data": {
    "email": "john@example.com",
    "expiresIn": 300,
    "expiresAt": "2024-01-15T10:05:00.000Z"
  }
}
```

---

### POST `/auth/verify-otp`

Verifies the OTP and creates the user account.

**Request:**

```json
{
  "email": "john@example.com",
  "otp": "123456"
}
```

**Success (201):**

```json
{
  "success": true,
  "message": "Account created successfully! Welcome to Lumina Meet.",
  "data": {
    "user": {
      "id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "username": "johndoe",
      "email": "john@example.com",
      "isVerified": true,
      "createdAt": "2024-01-15T10:00:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
    }
  }
}
```

**Error (400):**

```json
{
  "success": false,
  "message": "Invalid OTP. 2 attempts remaining.",
  "code": "INVALID_OTP",
  "details": { "remainingAttempts": 2 }
}
```

---

### POST `/auth/login`

**Request:**

```json
{
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Success (200):**

```json
{
  "success": true,
  "message": "Login successful!",
  "data": {
    "user": { "id": "...", "username": "johndoe", "email": "john@example.com" },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
    }
  }
}
```

---

### POST `/auth/forgot-password`

Always returns 200 to prevent email enumeration attacks.

**Request:** `{ "email": "john@example.com" }`

---

### POST `/auth/reset-password`

**Request:**

```json
{
  "email": "john@example.com",
  "otp": "654321",
  "newPassword": "NewSecurePass456"
}
```

---

### GET `/auth/me`

**Headers:** `Authorization: Bearer <access_token>`

---

## Meetings

All meeting endpoints are prefixed with `/api/meeting`.

### Endpoints Summary

| Method | Endpoint            | Auth     | Rate Limit | Description                                                  |
| ------ | ------------------- | -------- | ---------- | ------------------------------------------------------------ |
| POST   | `/meeting/generate` | Yes      | 10/min     | Create instant meeting                                       |
| POST   | `/meeting/schedule` | Yes      | 10/min     | Schedule future meeting                                      |
| POST   | `/meeting/join/:id` | Optional | —          | Join a meeting                                               |
| POST   | `/meeting/invite`   | Yes      | 10/min     | Invite participants                                          |
| GET    | `/meeting/history`  | Yes      | —          | Get meeting history                                          |
| GET    | `/meeting/upcoming` | Yes      | —          | Get upcoming meetings                                        |
| GET    | `/meeting/:id`      | Yes      | —          | Get meeting details                                          |
| PATCH  | `/meeting/:id`      | Yes      | —          | Update meeting                                               |
| DELETE | `/meeting/:id`      | Yes      | —          | Cancel meeting                                               |
| POST   | `/meeting/:id/end`  | Yes      | —          | End active meeting (REST complement to socket `end-meeting`) |

---

## Recordings

All recording endpoints are prefixed with `/api/meeting/recording`. Authentication is required for all three.

### Endpoints Summary

| Method | Endpoint                       | Auth | Description                                    |
| ------ | ------------------------------ | ---- | ---------------------------------------------- |
| POST   | `/meeting/recording/signature` | Yes  | Generate Cloudinary signed upload ticket       |
| POST   | `/meeting/recording/save`      | Yes  | Save recording metadata + send email           |
| GET    | `/meeting/recordings`          | Yes  | List all recordings for the authenticated host |

---

### POST `/meeting/recording/signature`

Called by the frontend **before** uploading to Cloudinary. Returns a pre-signed ticket so the binary never routes through this server.

**Request:**

```json
{
  "meetingId": "vm-xxxx-xxxx-xxxx",
  "mode": "screen_voice",
  "durationSec": 142,
  "fileType": "video/webm"
}
```

**`mode` values:** `screen_voice` | `screen` | `voice`

**Success (200):**

```json
{
  "success": true,
  "data": {
    "signature": "a3f9b2...",
    "timestamp": 1705312800,
    "cloudName": "your-cloud-name",
    "apiKey": "123456789012345",
    "publicId": "lumina-meet/vm-xxxx-xxxx-xxxx/screen_voice-1705312800000",
    "resourceType": "video",
    "transformation": "q_auto,f_auto"
  }
}
```

> `folder` is intentionally absent from the response. The `publicId` already encodes the full storage path (`lumina-meet/{meetingId}/{mode}-{timestamp}`). Passing `folder` separately to Cloudinary would double-nest the path and break delivery URLs.

**`resourceType` resolution:**

| mode           | fileType starts with `video/` | resourceType |
| -------------- | ----------------------------- | ------------ |
| `voice`        | No                            | `raw`        |
| `voice`        | Yes                           | `video`      |
| `screen`       | —                             | `video`      |
| `screen_voice` | —                             | `video`      |

---

### POST `/meeting/recording/save`

Called by the frontend after the Cloudinary XHR upload completes. Persists metadata and fires the recording-ready email (fire-and-forget — email failure does not fail the API).

**Request:**

```json
{
  "meetingId": "vm-xxxx-xxxx-xxxx",
  "publicId": "lumina-meet/vm-xxxx-xxxx-xxxx/screen_voice-1705312800000",
  "mode": "screen_voice",
  "durationSec": 142,
  "fileSizeBytes": 44564480,
  "mimeType": "video/webm"
}
```

**Success (201):**

```json
{
  "success": true,
  "message": "Recording saved successfully",
  "data": {
    "recording": {
      "recordingId": "rec-1705312942000-a3f9b",
      "mode": "screen_voice",
      "cloudinaryUrl": "https://res.cloudinary.com/your-cloud/video/upload/lumina-meet/vm-xxxx/screen_voice-1705312800000.mp4",
      "cloudinaryPublicId": "lumina-meet/vm-xxxx/screen_voice-1705312800000",
      "thumbnailUrl": "https://res.cloudinary.com/your-cloud/video/upload/so_0,w_480,h_270,c_fill,q_60/lumina-meet/vm-xxxx/screen_voice-1705312800000.jpg",
      "durationSec": 142,
      "fileSizeBytes": 44564480,
      "meetingId": "vm-xxxx-xxxx-xxxx",
      "createdAt": 1705312942000
    }
  }
}
```

> `thumbnailUrl` is `null` for `voice` recordings (`resourceType: raw`).

---

### GET `/meeting/recordings`

Returns all recordings across all meetings hosted by the authenticated user, flattened and sorted newest first. Powers the **Recordings** tab on the dashboard.

**Headers:** `Authorization: Bearer <access_token>`

**Success (200):**

```json
{
  "success": true,
  "data": {
    "recordings": [
      {
        "recordingId": "rec-1705312942000-a3f9b",
        "mode": "screen_voice",
        "cloudinaryUrl": "https://...",
        "cloudinaryPublicId": "lumina-meet/...",
        "durationSec": 142,
        "fileSizeBytes": 44564480,
        "thumbnailUrl": "https://...",
        "meetingId": "vm-xxxx-xxxx-xxxx",
        "meetingTitle": "Q3 Planning",
        "createdAt": 1705312942000
      }
    ]
  }
}
```

---

## WebRTC Signaling

Lumina Meet uses Socket.IO as a **signaling layer** to coordinate browser-to-browser WebRTC peer connections, and as a **real-time event bus** for all in-meeting features. The signaling server lives in `src/socket/signallingServer.js` and is initialized alongside the Express app in `server.js`.

### How Peers Connect

```
Newcomer joins room → server sends "room-peers" list to newcomer
Newcomer creates offer → sends to each existing peer via server
Existing peer receives offer → creates answer → sends back via server
Both sides exchange ICE candidates via server
WebRTC peer connection established — media flows directly P2P
Server is no longer involved in the media streams
```

### Socket.IO Connection

```javascript
const socket = io("http://localhost:5000", {
  transports: ["websocket", "polling"],
});
```

### Room State

The server maintains in-memory maps per room:

```
rooms         → Map<roomId, Map<socketId, PeerData>>
waitingRooms  → Map<roomId, Map<socketId, WaiterData>>
chatHistory   → Map<roomId, Message[]>       (max 200 messages)
whiteboardState → Map<roomId, Element[]>     (max 2000 elements)
pollState     → Map<roomId, Poll>
agendaState   → Map<roomId, AgendaState>
```

Rooms are created on first join and cleaned up when the last participant leaves or the host calls `end-meeting`.

---

### Events Reference

#### Client → Server

| Event                | Payload                                     | Auth         | Description                                        |
| -------------------- | ------------------------------------------- | ------------ | -------------------------------------------------- |
| `join-room`          | `{ roomId, username, userId }`              | —            | Join a meeting room (triggers lobby check)         |
| `leave-room`         | —                                           | —            | Intentional leave; server emits `you-left` back    |
| `end-meeting`        | —                                           | Host only    | End meeting for all participants                   |
| `offer`              | `{ to, offer }`                             | —            | Send SDP offer to a specific peer                  |
| `answer`             | `{ to, answer }`                            | —            | Send SDP answer to a specific peer                 |
| `ice-candidate`      | `{ to, candidate }`                         | —            | Relay ICE candidate to a specific peer             |
| `media-state`        | `{ mic?, cam?, screen? }`                   | —            | Broadcast local media toggle to room               |
| `host-action`        | `{ action, targetSocketId }`                | Host/co-host | Send control action to a specific participant      |
| `admit-participant`  | `{ targetSocketId }`                        | Host/co-host | Admit a waiting participant from the lobby         |
| `reject-participant` | `{ targetSocketId }`                        | Host/co-host | Reject a waiting participant                       |
| `transfer-host`      | `{ targetSocketId, mode: "full" \| "sub" }` | Host only    | Transfer host or grant co-host                     |
| `chat-message`       | `{ text, replyTo?, recipients? }`           | —            | Send a chat message (broadcast or private)         |
| `chat-reaction`      | `{ messageId, emoji }`                      | —            | Toggle a reaction on a message                     |
| `chat-typing`        | `{ isTyping }`                              | —            | Broadcast typing indicator                         |
| `status-update`      | `{ status }`                                | —            | Update participant status                          |
| `raise-hand`         | —                                           | —            | Raise hand (idempotent)                            |
| `lower-hand`         | —                                           | —            | Lower own hand                                     |
| `host-lower-hand`    | `{ targetSocketId }`                        | Host/co-host | Force-lower a participant's hand                   |
| `reaction`           | `{ emoji }`                                 | —            | Send floating emoji reaction to room               |
| `whiteboard-draw`    | `{ element }`                               | —            | Add or update a whiteboard element                 |
| `whiteboard-erase`   | `{ elementId }`                             | —            | Remove a whiteboard element by ID                  |
| `whiteboard-clear`   | —                                           | Host/co-host | Clear all whiteboard elements                      |
| `whiteboard-sync`    | `{ elements }`                              | —            | Replace full whiteboard state (undo/redo)          |
| `whiteboard-cursor`  | `{ x, y }`                                  | —            | Broadcast cursor position (fractional 0–1)         |
| `poll-create`        | `{ question, options }`                     | Host/co-host | Create and launch a live poll                      |
| `poll-vote`          | `{ optionIndex }`                           | —            | Cast a vote (one per participant)                  |
| `poll-close`         | —                                           | Host/co-host | Close voting on current poll                       |
| `poll-dismiss`       | —                                           | Host/co-host | Remove poll from all screens                       |
| `agenda-set`         | `{ items: [{ title, durationSec }] }`       | Host/co-host | Set the meeting agenda                             |
| `agenda-next`        | —                                           | Host/co-host | Advance to next agenda item                        |
| `agenda-prev`        | —                                           | Host/co-host | Go back to previous agenda item                    |
| `agenda-goto`        | `{ index }`                                 | Host/co-host | Jump to a specific agenda item                     |
| `agenda-timer-start` | —                                           | Host/co-host | Start the per-item countdown timer                 |
| `agenda-timer-pause` | —                                           | Host/co-host | Pause the per-item countdown timer                 |
| `recording-state`    | `{ recording, mode }`                       | —            | Broadcast recording in-progress state to all peers |

#### Server → Client

| Event                 | Payload                                                                       | Description                                                               |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `room-peers`          | `[{ socketId, username, mic, cam, status, handRaised, isHost, isSubHost }]`   | Existing peers list sent on join                                          |
| `user-joined`         | `{ socketId, username, mic, cam, status, handRaised, isHost, isSubHost }`     | New peer joined room                                                      |
| `offer`               | `{ from, username, offer }`                                                   | Incoming SDP offer                                                        |
| `answer`              | `{ from, answer }`                                                            | Incoming SDP answer                                                       |
| `ice-candidate`       | `{ from, candidate }`                                                         | Incoming ICE candidate                                                    |
| `peer-media-state`    | `{ socketId, mic?, cam?, screen? }`                                           | A peer toggled their media                                                |
| `user-left`           | `{ socketId }`                                                                | A peer disconnected                                                       |
| `host-action`         | `{ action }`                                                                  | Host command targeting you (`mute` / `cam-off` / `remove` / `lower-hand`) |
| `meeting-ended`       | `{ reason, hostUsername }`                                                    | Host ended meeting for all; `hostUsername` drives which dialog to show    |
| `you-left`            | —                                                                             | Confirms this socket's intentional leave (triggers "You left" dialog)     |
| `you-are-host`        | —                                                                             | This socket is the meeting host                                           |
| `you-are-subhost`     | —                                                                             | This socket has been granted co-host                                      |
| `you-are-participant` | —                                                                             | Host role revoked (after full transfer)                                   |
| `host-transferred`    | `{ mode, newHostSocketId?, targetSocketId?, ... }`                            | Host or co-host assignment changed                                        |
| `waiting`             | `{ message }`                                                                 | Participant placed in lobby queue                                         |
| `admitted`            | —                                                                             | Host admitted this participant from lobby                                 |
| `join-rejected`       | `{ reason }`                                                                  | Host rejected this participant                                            |
| `join-error`          | `{ message }`                                                                 | Room not found or other join error                                        |
| `join-request`        | `{ socketId, username, userId }`                                              | (Host/co-host) A participant is knocking                                  |
| `lobby-knock`         | `{ socketId, username }`                                                      | (Host/co-host) Triggers knock toast + chime on client                     |
| `lobby-admitted`      | `{ socketId }`                                                                | Lobby queue updated after admission                                       |
| `lobby-rejected`      | `{ socketId }`                                                                | Lobby queue updated after rejection                                       |
| `chat-history`        | `Message[]`                                                                   | Full chat history delivered on join                                       |
| `chat-message`        | `{ id, socketId, username, text, timestamp, replyTo, isPrivate, recipients }` | Incoming chat message                                                     |
| `chat-reaction`       | `{ messageId, emoji, socketId, username }`                                    | Emoji reaction toggled on a message                                       |
| `chat-typing`         | `{ socketId, username, isTyping }`                                            | Peer typing indicator                                                     |
| `peer-status`         | `{ socketId, username, status }`                                              | Peer changed their availability status                                    |
| `hand-raised`         | `{ socketId, username, handRaisedAt }`                                        | Peer raised their hand                                                    |
| `hand-lowered`        | `{ socketId }`                                                                | Peer or host lowered a hand                                               |
| `reaction`            | `{ id, socketId, username, emoji, timestamp }`                                | Floating emoji reaction from a peer                                       |
| `whiteboard-state`    | `Element[]`                                                                   | Full whiteboard state on join or after sync                               |
| `whiteboard-draw`     | `{ element, from }`                                                           | Element added or updated                                                  |
| `whiteboard-erase`    | `{ elementId, from }`                                                         | Element removed                                                           |
| `whiteboard-clear`    | —                                                                             | All elements cleared by host                                              |
| `whiteboard-cursor`   | `{ socketId, username, x, y }`                                                | Peer cursor position                                                      |
| `poll-state`          | `{ id, question, options, votes, totalVoters, closed }`                       | Full poll state on join or creation                                       |
| `poll-update`         | `{ id, votes, totalVoters }`                                                  | Live vote count update                                                    |
| `poll-closed`         | `{ id, votes }`                                                               | Poll closed, final results                                                |
| `poll-dismissed`      | —                                                                             | Poll removed from all screens                                             |
| `agenda-state`        | `AgendaState`                                                                 | Full agenda state on join or set                                          |
| `agenda-tick`         | `AgendaState`                                                                 | Timer tick or navigation update (every 5 s + on control events)           |
| `agenda-complete`     | —                                                                             | All agenda items exhausted                                                |

---

### Lobby System

When `meeting.settings.waitingRoom` is `true` (the default), non-host participants are placed in a waiting room queue instead of joining directly.

**Flow:**

```
Participant emits join-room
  → Server checks waitingRoom setting
  → If enabled: adds to waitingRooms map, emits join-request + lobby-knock to all hosts/co-hosts
  → Client receives "waiting" → shows LobbyGate screen

Host emits admit-participant { targetSocketId }
  → Server moves waiter from waitingRooms → rooms
  → Sends waiter their room-peers, chat-history, whiteboard-state, poll-state, agenda-state
  → Emits "admitted" to waiter and "user-joined" to room
  → Emits "lobby-admitted" to room (to clear pending UI)

Host emits reject-participant { targetSocketId }
  → Server removes from waitingRooms
  → Emits "join-rejected" to waiter and disconnects their socket
  → Emits "lobby-rejected" to room
```

**Exceptions:**

- The meeting host (userId matches `meeting.host`) bypasses the lobby entirely and receives `you-are-host`.
- A returning co-host (userId found in room with `isSubHost: true`) also bypasses the lobby and receives `you-are-subhost`.

---

### Host Controls

The `host-action` event is a generic control channel from host/co-host to a specific participant:

| `action`     | Effect on target                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `mute`       | Client disables mic tracks and emits `media-state { mic: false }`                              |
| `cam-off`    | Client disables camera tracks and emits `media-state { cam: false }`                           |
| `remove`     | Client fires `window.dispatchEvent(new CustomEvent("Lumina Meet:host-removed"))` → clean leave |
| `lower-hand` | Client clears local `localHandRaised` state                                                    |

**Host transfer** (`transfer-host` event):

| `mode` | Effect                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------- |
| `full` | Old host becomes a participant. New host receives `you-are-host`. Room notified via `host-transferred`. |
| `sub`  | Target receives co-host without removing the original host. Target receives `you-are-subhost`.          |

**End meeting for all** (`end-meeting` event, host only):

Calls `teardownRoom(io, roomId, reason, hostUsername)` which:

1. Broadcasts `meeting-ended { reason, hostUsername }` to all room members and lobby waiters.
2. Kicks all lobby waiters and disconnects their sockets.
3. Removes the room from all in-memory maps.
4. Calls `meeting.closeCurrentSession()` and `meeting.complete()` in MongoDB.

---

### Collaborative Whiteboard

The server maintains a canonical `whiteboardState` array per room (max 2000 elements).

**Element types:** `stroke` | `text` | `sticky` | `arrow` | `rect` | `ellipse`

All draw operations attach `author` (username) and `authorId` (socket ID) server-side before broadcasting. This prevents spoofing and provides attribution for future permissions systems.

**Clear** is restricted to hosts and co-hosts. **Draw**, **erase**, and **sync** are open to all participants.

**Late joiners** receive the full `whiteboardState` array immediately after `room-peers` and `chat-history`.

---

### Live Polls

The server maintains one active poll per room in `pollState`. Votes are stored as `Map<socketId, optionIndex>` — one vote per participant, replaceable until the poll is closed.

**Poll lifecycle:**

```
poll-create  → stores poll, broadcasts "poll-state" to room
poll-vote    → updates vote map, broadcasts "poll-update" with aggregated counts
poll-close   → marks poll.closed = true, broadcasts "poll-closed" with final results
poll-dismiss → deletes poll from pollState, broadcasts "poll-dismissed"
```

Votes are serialized as `{ [optionIndex]: count }` before broadcasting — the raw `Map<socketId, optionIndex>` is never sent to clients.

---

### Shared Agenda

The server maintains one `agendaState` per room. A `setInterval` runs every 5 seconds to re-sync timer state with all clients and auto-advance items when the countdown expires.

**AgendaState shape:**

```json
{
  "items": [
    {
      "id": "agenda-0-...",
      "title": "Intro",
      "durationSec": 300,
      "done": false
    }
  ],
  "activeIdx": 0,
  "timerEnd": 1705312900000,
  "timerPaused": false,
  "timerRemaining": null
}
```

When `timerPaused` is `false` and `timerEnd` is set, `timerRemaining` is `null` — the client derives remaining time from `Date.now()`. When paused, `timerEnd` is `null` and `timerRemaining` holds the saved milliseconds.

**Input limits:** 1–20 items, each title max 100 chars, duration 30 s – 7200 s (2 h).

---

### Chat

**Broadcast messages** are pushed to `chatHistory` (max 200 messages) and delivered to all room members via `io.to(roomId)`. Late joiners receive the full history on admission.

**Private messages** (`recipients` array supplied):

- Delivered only to `new Set([socket.id, ...recipients])`.
- **Not** pushed to `chatHistory` — late joiners never see them.
- The message includes `isPrivate: true` and the `recipients` array so clients can render the lock badge and "Visible to:" annotation.

**Text sanitization:** HTML tags are stripped and text is capped at 2000 characters. Only the 10 allowed reaction emoji are accepted for `chat-reaction`.

---

### Status, Reactions & Hand Raise

**Participant status** (`status-update`):

Allowed values: `available` | `busy` | `away` | `presenting` | `brb`. Any unrecognized value falls back to `available`. The server also sets `status: "presenting"` automatically when `media-state { screen: true }` is received, and reverts to `"available"` on `screen: false`.

**Hand raise:**

`raise-hand` is idempotent — if the peer is already raised the event is silently ignored. `handRaisedAt` is set server-side to `Date.now()` for deterministic queue ordering on the client.

**Floating reactions:**

The `reaction` event fan-outs to the whole room with a server-generated unique `id` (`rxn-{socketId}-{timestamp}`) that the client uses to expire animations after 4 seconds.

---

### Post-Meeting Dialogs

The `teardownRoom` function now accepts a `hostUsername` argument and includes it in the `meeting-ended` broadcast. This allows the frontend to show differentiated dialogs without a second network call:

- **Host** (`socket.data.username === hostUsername`): "You ended this meeting."
- **Participants**: "Meeting ended by \<hostUsername\>."

**Intentional leave flow:**

```
Client calls leaveRoom()
  → emits "leave-room"
  → server sets socket.data.intentionalLeave = true
  → server emits "you-left" back to that socket immediately
  → client shows "You left" dialog
  → client calls socket.disconnect() after 150 ms
  → server "disconnect" handler fires, cleans up room state normally
```

This two-step approach ensures the client receives `you-left` before the socket closes, without the server needing to distinguish intentional vs. accidental disconnects in the cleanup path.

---

### Signaling Flow

```
Newcomer                   Server                   Existing Peer
   │                          │                           │
   │── join-room ────────────▶│                           │
   │                          │── join-request ──────────▶│ (host/co-host if lobby on)
   │                          │── lobby-knock ────────────▶│
   │◀─ waiting ───────────────│                           │
   │                          │◀── admit-participant ──── │
   │◀─ room-peers ────────────│                           │
   │◀─ chat-history ──────────│                           │
   │◀─ whiteboard-state ──────│                           │
   │◀─ poll-state (if any) ───│                           │
   │◀─ agenda-state (if any) ─│                           │
   │                          │──── user-joined ─────────▶│
   │── offer ─────────────────│──────────────────────────▶│
   │                          │◀── answer ───────────────│
   │◀── answer ───────────────│                           │
   │◀──▶ ice-candidate ───────│──────────────────────────▶│
   │                          │                           │
   │  [P2P media flows directly — server not involved]    │
```

### ICE / STUN Configuration

```javascript
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];
```

For production deployments behind symmetric NAT, add a TURN server to `ICE_SERVERS` in both `signallingServer.js` (server hint) and `src/hooks/useWebRTC.ts` on the frontend.

---

## Authentication Flow

### Signup Flow

```
POST /auth/signup { username, email, password }
  → Generate OTP → store in Redis (5 min TTL) → send verification email
  ← { otpSent, expiresIn }

POST /auth/verify-otp { email, otp }
  → Verify OTP → create User document → issue JWT pair
  ← { user, tokens }
```

### Token Refresh Flow

```
Access token expires (15 m default)
  → POST /auth/refresh { refreshToken }
  → Verify refresh token hash in DB → check not revoked
  → Issue new access token
  ← { accessToken }
```

### Forgot Password Flow (3-Phase)

```
Phase 1 → POST /auth/forgot-password { email }
           Server sends OTP to email (10 min TTL in Redis)
           Always returns 200 — prevents email enumeration

Phase 2 → User reads OTP from email

Phase 3 → POST /auth/reset-password { email, otp, newPassword }
           Verify OTP → hash new password → revoke all refresh tokens
```

---

## Rate Limiting

| Tier           | Routes                                          | Window | Max requests |
| -------------- | ----------------------------------------------- | ------ | ------------ |
| Auth           | `/auth/signup`, `/auth/login`                   | 1 min  | 5            |
| OTP verify     | `/auth/verify-otp`                              | 1 min  | 3            |
| Resend OTP     | `/auth/resend-otp`                              | 2 min  | 2            |
| Password reset | `/auth/forgot-password`, `/auth/reset-password` | 1 hour | 3            |
| Meeting        | `/meeting/*`                                    | 1 min  | 10           |
| General API    | All `/api/*` routes                             | 1 min  | 100          |

**Rate Limit Response (429):**

```json
{
  "success": false,
  "message": "Too many requests. Please try again in 45 seconds.",
  "retryAfter": 45
}
```

---

## Error Handling

| Code                        | HTTP | Description                   |
| --------------------------- | ---- | ----------------------------- |
| `VALIDATION_ERROR`          | 400  | Invalid request data          |
| `INVALID_OTP`               | 400  | OTP verification failed       |
| `OTP_EXPIRED`               | 400  | OTP has expired               |
| `UNAUTHORIZED`              | 401  | Missing / invalid token       |
| `TOKEN_EXPIRED`             | 401  | Access token expired          |
| `TOKEN_REVOKED`             | 401  | Refresh token revoked         |
| `INVALID_CREDENTIALS`       | 401  | Wrong email / password        |
| `FORBIDDEN`                 | 403  | Insufficient permissions      |
| `EMAIL_NOT_VERIFIED`        | 403  | Email verification required   |
| `MEETING_NOT_STARTED`       | 403  | Too early to join (scheduled) |
| `NOT_FOUND`                 | 404  | Resource not found            |
| `EMAIL_EXISTS`              | 409  | Email already registered      |
| `RATE_LIMIT_EXCEEDED`       | 429  | Too many requests             |
| `CLOUDINARY_NOT_CONFIGURED` | 500  | Cloudinary env vars missing   |
| `INTERNAL_ERROR`            | 500  | Unexpected server error       |

---

## Security Features

- **Helmet.js** — Security headers (HSTS, CSP, X-Frame-Options, etc.)
- **bcrypt** — Password hashing with 12 salt rounds
- **JWT** — Signed tokens with issuer/audience verification
- **Token rotation** — Refresh tokens rotated on each use; old token revoked
- **Rate limiting** — Multi-tier Redis-backed protection against brute force
- **Input validation** — express-validator on all endpoints + `sanitizeText()` in signaling
- **CORS** — Configured for specific `CLIENT_URL` origin only
- **NoSQL injection prevention** — Mongoose parameterized queries
- **Email enumeration prevention** — Consistent 200 response on forgot-password
- **Account lockout** — Suspended/deleted account handling
- **WebRTC privacy** — ICE candidates exchanged via server; peer IPs only exposed after mutual consent
- **Cloudinary signed uploads** — Binary content never routes through the API server
- **Poll vote integrity** — Server stores one vote per `socketId`; overwrites are allowed, double-counting is not
- **Whiteboard authorship** — Server attaches `author`/`authorId` to all whiteboard elements server-side

---

## Database Models

### User

```javascript
{
  username: String,           // 3–30 chars, alphanumeric + underscore, unique
  email: String,              // Unique, validated, lowercase
  password: String,           // bcrypt hashed (12 rounds)
  isVerified: Boolean,
  firstName: String,
  lastName: String,
  avatar: String,
  status: String,             // active | suspended | deleted
  lastLogin: Date,
  loginCount: Number,
  passwordChangedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Meeting

```javascript
{
  host: ObjectId,             // ref: User
  meetingId: String,          // Unique, format: vm-XXXX-XXXX-XXXX
  title: String,              // max 200 chars
  description: String,        // max 1000 chars
  type: String,               // instant | scheduled | joined
  scheduledFor: Date,
  duration: Number,           // Minutes, 5–480
  status: String,             // pending | active | completed | cancelled
  password: String,           // optional, select: false
  isPasswordProtected: Boolean,

  sessions: [{
    sessionId: String,        // UUID
    joinedAt: Date,
    leftAt: Date,
    durationMin: Number,
    participantCount: Number
  }],

  recordings: [{
    recordingId: String,      // rec-{ts}-{rand}
    recordedBy: ObjectId,     // ref: User (host or co-host)
    mode: String,             // screen_voice | screen | voice
    cloudinaryUrl: String,
    cloudinaryPublicId: String,
    thumbnailUrl: String,     // null for voice recordings
    durationSec: Number,
    fileSizeBytes: Number,
    createdAt: Date
  }],

  participants: [{
    email: String,
    name: String,
    status: String,           // invited | joined | declined | left
    joinedAt: Date,
    leftAt: Date,
    isHost: Boolean
  }],
  invitedEmails: [String],

  settings: {
    hostVideo: Boolean,       // default: true
    participantVideo: Boolean,
    hostAudio: Boolean,
    participantAudio: Boolean,
    waitingRoom: Boolean,     // default: true — controls lobby
    allowJoinBeforeHost: Boolean,
    muteParticipantsOnEntry: Boolean,
    allowRecording: Boolean,
    autoRecord: Boolean,
    allowScreenSharing: Boolean,
    enableChat: Boolean
  },

  maxParticipants: Number,    // 2–1000, default: 100
  meetingLink: String,
  startedAt: Date,
  completedAt: Date,
  recordingUrl: String        // legacy single-recording field
}
```

**Key virtuals:** `participantCount`, `totalInvites`, `isActive`, `isScheduled`, `totalDurationMin`, `supportsMultipleSessions`, `recordingCount`

**Key indexes:** `{ host, status }`, `{ meetingId, status }`, `{ scheduledFor, status }`, `{ host, "recordings.0" }` (recordings tab query)

### Refresh Token

```javascript
{
  userId: ObjectId,
  tokenId: String,            // UUID for rotation tracking
  tokenHash: String,          // SHA-256 hash of token
  expiresAt: Date,
  isRevoked: Boolean,
  issuedByIp: String,
  userAgent: String,
  lastUsedAt: Date,
  createdAt: Date
}
```

---

## Recording Pipeline

```
1. Client → POST /recording/signature
       Server generates Cloudinary signature
       publicId = "lumina-meet/{meetingId}/{mode}-{timestamp}"
       Returns: { signature, timestamp, cloudName, apiKey, publicId, resourceType }

2. Client → XHR direct upload to Cloudinary
       Uses signed params (no folder param — publicId is the full path)
       onprogress → upload progress bar (capped at 85%)

3. Client → POST /recording/save
       Server builds cloudinaryUrl from publicId + resourceType + ext
       Server builds thumbnailUrl (video only, Cloudinary eager transform)
       Pushes RecordingEntry to meeting.recordings[]
       Sends recording-ready email to host (fire-and-forget)
       Returns full RecordingEntry

4. Dashboard → GET /meeting/recordings
       Aggregates all recordings across all hosted meetings
       Flattened, sorted newest first
       Powers the Recordings tab
```

**URL construction:**

```
Video:   https://res.cloudinary.com/{cloudName}/video/upload/{publicId}.mp4
Voice:   https://res.cloudinary.com/{cloudName}/raw/upload/{publicId}.webm
Thumb:   https://res.cloudinary.com/{cloudName}/video/upload/so_0,w_480,h_270,c_fill,q_60/{publicId}.jpg
```

---

## Scripts

| Command       | Description                        |
| ------------- | ---------------------------------- |
| `npm start`   | Start production server            |
| `npm run dev` | Start development server (nodemon) |
| `npm test`    | Run tests with Jest                |

---

<p align="center">Built with ❤️ for seamless video collaboration</p>
