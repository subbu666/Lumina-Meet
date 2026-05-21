# Lumina Meet API

> **Production-grade backend API** for a real-time video meeting SaaS platform. Built with Node.js, Express, MongoDB, Redis, Socket.IO, and WebRTC signaling — designed for scalability, security, and seamless real-time communication.

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
- [WebRTC Signaling](#webrtc-signaling)
- [Authentication Flow](#authentication-flow)
- [Rate Limiting](#rate-limiting)
- [Error Handling](#error-handling)
- [Security](#security)
- [Database Models](#database-models)
- [Future Roadmap](#future-roadmap)

---

## Architecture

```
Client (React/Vue)
    │
    ├──▶ REST API (Express + Helmet + CORS)
    │         │
    │         ├──▶ Rate Limiter (Redis/In-Memory)
    │         ├──▶ Auth Middleware (JWT Verification)
    │         └──▶ Controllers → Services → Models (Mongoose + MongoDB Atlas)
    │
    └──▶ WebSocket (Socket.IO — /socket.io)
              │
              └──▶ Signaling Server (signallingServer.js)
                        │
                        ├──▶ join-room / room-peers
                        ├──▶ offer / answer / ice-candidate  (WebRTC SDP relay)
                        ├──▶ media-state  (mic / cam / screen toggles)
                        ├──▶ host-action  (mute / cam-off / remove)
                        └──▶ disconnect  (peer cleanup)

Email: Brevo SMTP (OTP, invites, reminders, password reset)
```

---

## Tech Stack

| Layer      | Technology                             | Purpose                               |
| ---------- | -------------------------------------- | ------------------------------------- |
| Runtime    | Node.js 18+                            | JavaScript runtime                    |
| Framework  | Express.js 4.x                         | HTTP server & routing                 |
| Database   | MongoDB Atlas                          | Primary data store                    |
| ODM        | Mongoose 8.x                           | Schema modeling & queries             |
| Auth       | JWT (jsonwebtoken)                     | Access + Refresh tokens               |
| Cache      | Redis (ioredis) + In-Memory fallback   | OTP storage & rate limiting           |
| Real-time  | Socket.IO 4.x                          | WebRTC signaling & media-state relay  |
| Signaling  | WebRTC (STUN)                          | Peer-to-peer video/audio coordination |
| Email      | Nodemailer + Brevo SMTP                | Transactional emails                  |
| Security   | Helmet + bcryptjs + express-rate-limit | Security headers & encryption         |
| Validation | express-validator                      | Request validation                    |

---

## Project Structure

```
src/
├── config/
│   ├── db.js              # MongoDB Atlas connection with retry logic
│   ├── jwt.js             # JWT configuration & settings
│   └── redis.js           # Redis client with in-memory fallback
│
├── constants/
│   └── index.js           # App constants (limits, regex, status codes)
│
├── controllers/
│   ├── authController.js  # Signup, login, OTP, password reset, profile
│   └── meetingController.js # CRUD, scheduling, invites, history
│
├── middlewares/
│   ├── authMiddleware.js  # JWT verification, role checks
│   ├── rateLimiter.js     # Redis-based rate limiting (multiple strategies)
│   └── errorHandler.js    # Centralized error handling & async wrapper
│
├── models/
│   ├── User.js            # User schema with auth & profile
│   ├── Meeting.js         # Meeting schema with scheduling & participants
│   └── Token.js           # Refresh token storage with rotation support
│
├── routes/
│   ├── authRoutes.js      # /api/auth/* endpoints
│   └── meetingRoutes.js   # /api/meeting/* endpoints
│
├── socket/
│   └── signallingServer.js  # WebRTC signaling via Socket.IO
│
├── utils/
│   ├── generateOTP.js     # Cryptographically secure OTP generation
│   ├── sendEmail.js       # Premium email templates (OTP, invites, reminders)
│   └── tokenUtils.js      # JWT sign/verify/rotate utilities
│
├── app.js                 # Express app configuration
└── server.js              # Server startup, Socket.IO init & graceful shutdown
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **MongoDB Atlas** account ([Sign up](https://www.mongodb.com/cloud/atlas))
- **Brevo** (formerly Sendinblue) account for SMTP ([Sign up](https://www.brevo.com/))
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

# JWT Secrets (Required - generate strong random strings)
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
EMAIL_FROM_ADDRESS=noreply@Lumina Meet.app

# Redis (Optional - falls back to in-memory)
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

**Success Response:**

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

**Error Response:**

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

| Method | Endpoint                | Auth Required | Rate Limit | Description                    |
| ------ | ----------------------- | ------------- | ---------- | ------------------------------ |
| POST   | `/auth/signup`          | No            | 5/min      | Initiate signup, sends OTP     |
| POST   | `/auth/verify-otp`      | No            | 3/min      | Verify OTP & create account    |
| POST   | `/auth/resend-otp`      | No            | 2/2min     | Resend verification OTP        |
| POST   | `/auth/login`           | No            | 5/min      | Login with credentials         |
| POST   | `/auth/refresh`         | No            | 100/min    | Refresh access token           |
| POST   | `/auth/forgot-password` | No            | 3/hour     | Request password reset OTP     |
| POST   | `/auth/reset-password`  | No            | 3/hour     | Reset password with OTP        |
| POST   | `/auth/logout`          | No            | -          | Logout (revokes refresh token) |
| POST   | `/auth/logout-all`      | Yes           | -          | Logout all devices             |
| GET    | `/auth/me`              | Yes           | -          | Get current user profile       |
| PATCH  | `/auth/profile`         | Yes           | -          | Update user profile            |

---

### 1. Signup - Initiate

Creates a pending signup and sends OTP via email.

**Endpoint:** `POST /api/auth/signup`

**Request Body:**

```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Validation Rules:**

- `username`: 3-30 chars, alphanumeric + underscores only
- `email`: Valid email format
- `password`: Min 8 chars, at least 1 uppercase, 1 lowercase, 1 number

**Success Response (200):**

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

**Error Response (409):**

```json
{
  "success": false,
  "message": "An account with this email already exists",
  "code": "EMAIL_EXISTS"
}
```

---

### 2. Signup - Verify OTP

Verifies the OTP and creates the user account.

**Endpoint:** `POST /api/auth/verify-otp`

**Request Body:**

```json
{
  "email": "john@example.com",
  "otp": "123456"
}
```

**Success Response (201):**

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

**Error Response (400):**

```json
{
  "success": false,
  "message": "Invalid OTP. 2 attempts remaining.",
  "code": "INVALID_OTP",
  "details": { "remainingAttempts": 2 }
}
```

---

### 3. Login

Authenticates user and returns access + refresh tokens.

**Endpoint:** `POST /api/auth/login`

**Request Body:**

```json
{
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Success Response (200):**

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

### 4. Forgot Password

Sends password reset OTP to email.

**Endpoint:** `POST /api/auth/forgot-password`

> Always returns 200 to prevent email enumeration attacks.

**Request Body:**

```json
{ "email": "john@example.com" }
```

---

### 5. Reset Password

**Endpoint:** `POST /api/auth/reset-password`

**Request Body:**

```json
{
  "email": "john@example.com",
  "otp": "654321",
  "newPassword": "NewSecurePass456"
}
```

---

### 6. Get Current User

**Endpoint:** `GET /api/auth/me`

**Headers:** `Authorization: Bearer <access_token>`

---

## Meetings

All meeting endpoints are prefixed with `/api/meeting`.

### Endpoints Summary

| Method | Endpoint            | Auth     | Rate Limit | Description             |
| ------ | ------------------- | -------- | ---------- | ----------------------- |
| POST   | `/meeting/generate` | Yes      | 10/min     | Create instant meeting  |
| POST   | `/meeting/schedule` | Yes      | 10/min     | Schedule future meeting |
| POST   | `/meeting/join/:id` | Optional | -          | Join a meeting          |
| POST   | `/meeting/invite`   | Yes      | 10/min     | Invite participants     |
| GET    | `/meeting/history`  | Yes      | -          | Get meeting history     |
| GET    | `/meeting/upcoming` | Yes      | -          | Get upcoming meetings   |
| GET    | `/meeting/:id`      | Yes      | -          | Get meeting details     |
| PATCH  | `/meeting/:id`      | Yes      | -          | Update meeting          |
| DELETE | `/meeting/:id`      | Yes      | -          | Cancel meeting          |
| POST   | `/meeting/:id/end`  | Yes      | -          | End active meeting      |

---

## WebRTC Signaling

Lumina Meet uses Socket.IO as a **signaling layer** to coordinate browser-to-browser WebRTC peer connections. The signaling server lives in `src/socket/signallingServer.js` and is initialized alongside the Express app in `server.js`.

### How It Works

```
Client A joins room → server sends "room-peers" list to A
A creates offer → sends to each existing peer via server
Existing peer receives offer → creates answer → sends back via server
Both sides exchange ICE candidates via server
WebRTC peer connection established — media flows directly P2P
```

### Socket.IO Connection

```javascript
// Client connects to the same port as the REST API
const socket = io("http://localhost:5000", {
  transports: ["websocket", "polling"],
});
```

### Room State

The server maintains an in-memory room map:

```
roomId → Map<socketId, { username, mic, cam, screen }>
```

Rooms are created on first join and deleted automatically when the last participant leaves.

### Events — Client → Server

| Event           | Payload                      | Description                            |
| --------------- | ---------------------------- | -------------------------------------- |
| `join-room`     | `{ roomId, username }`       | Join a meeting room                    |
| `offer`         | `{ to, offer }`              | Send SDP offer to a specific peer      |
| `answer`        | `{ to, answer }`             | Send SDP answer to a specific peer     |
| `ice-candidate` | `{ to, candidate }`          | Relay ICE candidate to a specific peer |
| `media-state`   | `{ mic?, cam?, screen? }`    | Broadcast local media toggle to room   |
| `host-action`   | `{ action, targetSocketId }` | Host command to a specific participant |

### Events — Server → Client

| Event              | Payload                              | Description                                                |
| ------------------ | ------------------------------------ | ---------------------------------------------------------- |
| `room-peers`       | `[{ socketId, username, mic, cam }]` | List of existing peers when you join                       |
| `user-joined`      | `{ socketId, username, mic, cam }`   | New peer joined the room                                   |
| `offer`            | `{ from, username, offer }`          | Incoming SDP offer                                         |
| `answer`           | `{ from, answer }`                   | Incoming SDP answer                                        |
| `ice-candidate`    | `{ from, candidate }`                | Incoming ICE candidate                                     |
| `peer-media-state` | `{ socketId, mic?, cam?, screen? }`  | A peer toggled their media                                 |
| `host-action`      | `{ action }`                         | Host command targeting you (`mute` / `cam-off` / `remove`) |
| `user-left`        | `{ socketId }`                       | A peer disconnected                                        |

### Host Actions

The host can send three actions to any participant:

| Action    | Effect on target                                                                |
| --------- | ------------------------------------------------------------------------------- |
| `mute`    | Disables the target's microphone track and emits `media-state { mic: false }`   |
| `cam-off` | Disables the target's camera track and emits `media-state { cam: false }`       |
| `remove`  | Fires `Lumina Meet:host-removed` on the target's window, triggering clean leave |

### ICE Configuration

The signaling server is STUN-only by default (free, works across most networks):

```javascript
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];
```

For production deployments behind symmetric NAT, add a TURN server to `ICE_SERVERS` in `src/hooks/useWebRTC.ts` on the frontend.

### Signaling Flow Diagram

```
Newcomer                  Server                  Existing Peer
   │                        │                          │
   │── join-room ──────────▶│                          │
   │◀─ room-peers ──────────│                          │
   │                        │──── user-joined ────────▶│
   │── offer ───────────────│──────────────────────────▶│
   │                        │◀── answer ───────────────│
   │◀── answer ─────────────│                          │
   │◀──▶ ice-candidate ─────│──────────────────────────▶│
   │                        │                          │
   │  [P2P media flows directly — server not involved] │
```

---

## Authentication Flow

### Signup Flow

```
POST /auth/signup {username, email, pass}
  → Generate OTP → store in Redis (5 min TTL) → send email
  ← { otpSent, expiresIn }

POST /auth/verify-otp {email, otp}
  → Verify OTP → create User → issue JWT pair
  ← { user, tokens }
```

### Token Refresh Flow

```
Access token expires (15m)
  → POST /auth/refresh { refreshToken }
  → Verify refresh token hash in DB
  → Issue new access token
  ← { accessToken }
```

### Forgot Password Flow (3-Phase)

```
Phase 1 → POST /auth/forgot-password { email }
           Server sends OTP to email, stored in Redis (10 min)

Phase 2 → User reads OTP from email

Phase 3 → POST /auth/reset-password { email, otp, newPassword }
           Verify OTP → hash new password → revoke all refresh tokens
```

---

## Rate Limiting

| Tier           | Routes                                          | Window | Max Requests |
| -------------- | ----------------------------------------------- | ------ | ------------ |
| Auth           | `/auth/signup`, `/auth/login`                   | 1 min  | 5            |
| OTP            | `/auth/verify-otp`                              | 1 min  | 3            |
| Resend         | `/auth/resend-otp`                              | 2 min  | 2            |
| Password Reset | `/auth/forgot-password`, `/auth/reset-password` | 1 hour | 3            |
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

| Code                  | HTTP | Description                 |
| --------------------- | ---- | --------------------------- |
| `VALIDATION_ERROR`    | 400  | Invalid request data        |
| `INVALID_OTP`         | 400  | OTP verification failed     |
| `OTP_EXPIRED`         | 400  | OTP has expired             |
| `UNAUTHORIZED`        | 401  | Missing/invalid token       |
| `TOKEN_EXPIRED`       | 401  | Access token expired        |
| `TOKEN_REVOKED`       | 401  | Refresh token revoked       |
| `INVALID_CREDENTIALS` | 401  | Wrong email/password        |
| `FORBIDDEN`           | 403  | Insufficient permissions    |
| `EMAIL_NOT_VERIFIED`  | 403  | Email verification required |
| `MEETING_NOT_STARTED` | 403  | Too early to join           |
| `NOT_FOUND`           | 404  | Resource not found          |
| `EMAIL_EXISTS`        | 409  | Email already registered    |
| `RATE_LIMIT_EXCEEDED` | 429  | Too many requests           |
| `INTERNAL_ERROR`      | 500  | Server error                |

---

## Security Features

- **Helmet.js** — Security headers (HSTS, CSP, X-Frame-Options, etc.)
- **bcrypt** — Password hashing with salt rounds 12
- **JWT** — Signed tokens with issuer/audience verification
- **Token Rotation** — Refresh tokens rotated on each use
- **Rate Limiting** — Multi-tier protection against brute force
- **Input Validation** — express-validator on all endpoints
- **CORS** — Configured for specific origin only
- **NoSQL Injection Prevention** — Mongoose parameterized queries
- **Email Enumeration Prevention** — Consistent responses on forgot-password
- **Account Lockout** — Suspended/deleted account handling
- **WebRTC Privacy** — ICE candidates exchanged via server; peer IPs only exposed after consent

---

## Database Models

### User Model

```javascript
{
  username: String,           // 3-30 chars, alphanumeric + underscore
  email: String,              // Unique, validated
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

### Meeting Model

```javascript
{
  host: ObjectId,
  meetingId: String,          // Unique: vm-XXXX-XXXX-XXXX
  title: String,
  description: String,
  type: String,               // instant | scheduled
  scheduledFor: Date,
  duration: Number,           // Minutes (5-480)
  status: String,             // pending | active | completed | cancelled
  password: String,
  isPasswordProtected: Boolean,
  participants: [{
    email: String,
    name: String,
    status: String,           // invited | joined | declined | left
    isHost: Boolean
  }],
  invitedEmails: [String],
  settings: Object,
  meetingLink: String,
  startedAt: Date,
  completedAt: Date,
  createdAt: Date
}
```

### Refresh Token Model

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

## Scripts

| Command       | Description                        |
| ------------- | ---------------------------------- |
| `npm start`   | Start production server            |
| `npm run dev` | Start development server (nodemon) |
| `npm test`    | Run tests with Jest                |

---

## Future Roadmap

### Phase 1: WebRTC Enhancements ✅ (Signaling complete)

- [x] Signaling server with Socket.IO
- [x] ICE server configuration (STUN)
- [x] Peer connection management
- [x] Screen sharing support
- [x] Host controls (mute / cam-off / remove)
- [ ] TURN server integration for symmetric NAT
- [ ] SFU (Selective Forwarding Unit) for rooms with 5+ participants

### Phase 2: Real-time Features

- [ ] In-meeting chat (Socket.IO)
- [ ] Live participant status
- [ ] Raise hand feature
- [ ] Reactions/emoji

### Phase 3: Recording & Transcription

- [ ] Meeting recording storage
- [ ] Audio transcription with AI
- [ ] Meeting summaries

### Phase 4: Scaling

- [ ] Microservices split (Auth, Meetings, Media)
- [ ] Redis pub/sub for multi-instance Socket.IO
- [ ] CDN for static assets
- [ ] Kubernetes deployment

---

<p align="center">Built with ❤️ for seamless video collaboration</p>
