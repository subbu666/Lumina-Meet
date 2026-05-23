# Lumina Meet — Premium Real-Time Meeting Platform

A production-grade, dark-themed SaaS frontend for video meetings built with TanStack Start, React 19, Tailwind v4, Framer Motion, Zustand, and Axios. The video layer uses **real WebRTC** peer connections coordinated through a Socket.IO signaling server, with voice activity detection, screen sharing, and host controls.

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
│   ├── modals/                 # Generation, Welcome, RateLimit dialogs
│   ├── ui/                     # shadcn primitives
│   └── ui-custom/              # NeonButton, FloatingInput, OtpInput, PasswordStrength
│
├── hooks/
│   └── useWebRTC.ts            # Full WebRTC + Socket.IO hook (see below)
│   └── useAmbientSound.ts       
│   └── useNoiseSuppression.ts    
│   └── useBackgroundBlur.ts            
│
├── routes/
│   ├── __root.tsx              # Shell, providers, global overlays
│   ├── index.tsx               # Landing
│   ├── signup.tsx
│   ├── login.tsx
│   ├── verify-otp.tsx
│   ├── forgot-password.tsx     # 3-phase wizard
│   ├── reset-password.tsx
│   ├── dashboard.tsx
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
| `--neon-accent`    | purple oklch | Accents, avatars                     |
| `--neon-danger`    | red oklch    | Leave button, error states           |

**Utility classes:** `glass`, `glass-strong`, `text-gradient`, `glow-primary`, `animate-pulse-glow`, `animate-pulse-danger`, `shimmer`, `animate-float`

Component variants (NeonButton: `primary` / `outline` / `ghost` / `danger`) consume tokens — components never hardcode hex colors.

---

## WebRTC Architecture

The video room is powered by a real WebRTC implementation spread across two files:

```
src/hooks/useWebRTC.ts      ← all WebRTC + Socket.IO logic
src/routes/meeting.$id.tsx  ← UI: video grid, controls, panels
```

### How Peers Connect

```
1. useWebRTC connects to Socket.IO on VITE_SOCKET_URL
2. Emits join-room { roomId, username }
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

const {
  localStream, // MediaStream from getUserMedia
  localSocketId, // This client's socket ID
  mic, // boolean — microphone enabled
  cam, // boolean — camera enabled
  sharing, // boolean — screen sharing active

  peers, // RemotePeer[] — all connected participants

  toggleMic, // () => void
  toggleCam, // () => Promise<void>
  toggleScreenShare, // () => Promise<void>
  leaveRoom, // () => void — stops tracks, closes PCs, disconnects socket

  muteAll, // host: force-mute all peers
  camOffAll, // host: force cam-off all peers
  removePeer, // host: (socketId) => void — kick participant

  isSpeaking, // boolean — local user is speaking (VAD)
  speakingPeerId, // string | null — loudest remote peer's socketId

  error, // string | null
  isConnecting, // boolean — initial setup phase
} = useWebRTC(roomId, username, SOCKET_URL);
```

### `RemotePeer` Type

```typescript
interface RemotePeer {
  socketId: string;
  username: string;
  stream: MediaStream | null; // remote video/audio
  mic: boolean;
  cam: boolean;
  screen: boolean;
  speaking: boolean; // set by VAD polling
}
```

### Media Controls — What Actually Happens

| Control               | Implementation                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mute mic**          | `track.enabled = false` on all audio tracks — track stays alive, bandwidth drops to near zero                                                          |
| **Stop cam**          | `track.stop()` → camera LED goes dark; replaces sender with a silent black canvas track via `RTCRtpSender.replaceTrack()` so the connection stays open |
| **Start cam**         | `getUserMedia({ video })` → adds fresh track to local stream, replaces in all peer senders                                                             |
| **Screen share**      | `getDisplayMedia()` → replaces video sender track in all PCs; `track.onended` restores cam track when user stops via browser UI                        |
| **Stop screen share** | Restores original camera track to all senders                                                                                                          |

### Voice Activity Detection (VAD)

The hook runs two VAD loops via `AudioContext` + `AnalyserNode`:

**Local VAD** — polls every 80ms, sets `isSpeaking` with a 600ms silence debounce so the indicator doesn't flicker.

**Remote VAD** — polls the `AnalyserNode` of each peer's incoming audio track every 80ms, surfaces the loudest peer's socket ID as `speakingPeerId`. This drives the cyan speaking ring on video tiles and the banner at the bottom of the room.

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

For deployments behind symmetric NAT (corporate networks, some mobile carriers), add a TURN server here. The rest of the hook requires no changes.

### Host Controls

Host actions are sent over Socket.IO and executed on the target's client:

```typescript
// Mute a specific peer
socket.emit("host-action", { action: "mute", targetSocketId: "..." });

// Turn off cam for all peers
camOffAll(); // iterates peers[], sends host-action "cam-off" to each

// Remove a participant
removePeer(socketId); // sends "remove" → target dispatches Lumina Meet:host-removed → leaveRoom()
```

### Graceful Cleanup

`leaveRoom()` and the `useEffect` cleanup both:

- Close all `RTCPeerConnection` instances
- Stop all local `MediaStreamTrack`s (releases camera/mic hardware)
- Stop screen share tracks
- Disconnect the Socket.IO socket
- Clear VAD intervals, timeouts, and `AudioContext`

---

## Video Room UI (`meeting.$id.tsx`)

### Routing

```
/meeting/:id                     → live room
/meeting/:id?scheduledFor=<ts>   → shows countdown if ts is in the future
```

### Layouts

**Video Grid** — responsive CSS grid that adapts to participant count:

| Participants | Grid                 |
| ------------ | -------------------- |
| 1            | Full screen (1 col)  |
| 2            | Side by side (2 col) |
| 3–4          | 2×2                  |
| 5–6          | 2×3                  |
| 7+           | 3×4                  |

**Screen Share View** — large central preview of the shared screen, thumbnail strip on the right (scrollable on mobile, vertical sidebar on desktop).

### Video Tiles

Each tile (`LocalVideoTile` / `RemoteVideoTile`) renders:

- Live `<video>` element when cam is on — local is mirrored (`scale-x-[-1]`)
- Gradient avatar fallback with initials when cam is off
- Cyan speaking ring + animated bars when VAD detects speech
- "Host" badge on the local tile
- Remove button (hover, host-only) on remote tiles
- Ambient glow overlay that shifts across the tile when video is active

### Room Controls (Footer)

| Button       | State off                            | State on                                     |
| ------------ | ------------------------------------ | -------------------------------------------- |
| Mic          | `MicOff` red tint                    | `Mic` neutral                                |
| Camera       | `VideoOff` red tint                  | `VideoIcon` neutral                          |
| Screen share | `MonitorUp` neutral                  | `MonitorX` + pulse-glow + animate-pulse-glow |
| Leave        | Always red gradient, `PhoneOff` icon | —                                            |

### Participants Panel

Slide-in panel (spring animation, `AnimatePresence`) showing:

- Self entry with Host label, mic/cam status icons
- All remote peers with mic/cam status and per-peer remove button
- Host-wide controls: **Mute all** / **Cam off all**

### Speaking Banner

Floats above the footer controls. Shows animated audio bars + name of whoever is currently speaking. Disappears smoothly via `AnimatePresence` when silence is detected.

### States

| State                    | What renders                                    |
| ------------------------ | ----------------------------------------------- |
| Not logged in            | Glass card with login prompt                    |
| `scheduledFor` in future | Full-screen countdown (`CountdownScreen`)       |
| `isConnecting`           | Spinning `Loader2` with "Connecting to room…"   |
| `error`                  | `AlertTriangle` + message + "Back to dashboard" |
| Connected                | Full room UI                                    |

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

All mock responses have a 700–1500ms artificial delay. Any endpoint called more than **8× in 60s** returns `429` and triggers the Rate Limit dialog.

| Endpoint                    | Method | Success response                           |
| --------------------------- | ------ | ------------------------------------------ |
| `/api/auth/signup`          | POST   | `{ message, email }`                       |
| `/api/auth/login`           | POST   | `{ token, user }`                          |
| `/api/auth/verify-otp`      | POST   | `{ verified, token, user }`                |
| `/api/auth/resend-otp`      | POST   | `{ message }`                              |
| `/api/auth/forgot-password` | POST   | `{ message }`                              |
| `/api/auth/reset-password`  | POST   | `{ message }`                              |
| `/api/meeting/generate`     | POST   | `{ meetingId, link, createdAt }`           |
| `/api/meeting/schedule`     | POST   | `{ meetingId, link, title, scheduledFor }` |
| `/api/meeting/invite`       | POST   | `{ sent }`                                 |
| `/api/meeting/history`      | GET    | `{ items: [...] }`                         |

Demo OTP: `123456` works for every flow.

---

## Key Flows

**Auth** — signup with live password strength meter → OTP verification with circular resend timer → 3-phase forgot-password wizard with sliding transitions → login with confetti-burst Welcome modal.

**Dashboard** — instant meeting, schedule, join by ID, invite by email, recent history with status badges.

**Meeting generation** — full-screen cinematic modal: 5 dynamic phases, animated progress ring, gradient glow that intensifies with progress, then reveals the link with copy & join.

**Schedule** — date + time picker, generates a link; navigating to the room before start time shows a live countdown.

**Video room** — `useWebRTC` opens camera/mic, joins the Socket.IO room, negotiates RTCPeerConnection with every peer, streams real video/audio. Supports mic toggle, camera toggle (with hardware LED off), screen share, VAD-based speaking detection, host controls (mute all / cam off all / remove peer), and a participants panel.

**Rate limit** — dramatic pulsing dialog with retry countdown appears automatically on any `429` response.

---

## Tech Stack

| Layer         | Technology                                                             |
| ------------- | ---------------------------------------------------------------------- |
| Routing & SSR | TanStack Start v1 (Vite-powered, file-based)                           |
| UI            | React 19                                                               |
| Styling       | Tailwind CSS v4 (native `@theme`, oklch palette)                       |
| Animation     | Framer Motion (pages, modals, VAD bars, tile transitions)              |
| State         | Zustand (auth + UI stores)                                             |
| HTTP          | Axios + custom mock adapter                                            |
| Real-time     | Socket.IO client (WebRTC signaling)                                    |
| Video/Audio   | Native WebRTC (`RTCPeerConnection`, `getUserMedia`, `getDisplayMedia`) |
| VAD           | Web Audio API (`AudioContext`, `AnalyserNode`)                         |
| Components    | shadcn/ui (Dialog, Popover, Calendar, Sonner)                          |

---

## Scripts

| Command           | Description                      |
| ----------------- | -------------------------------- |
| `bun dev`         | Dev server with HMR              |
| `bun run build`   | Production build                 |
| `bun run preview` | Preview production build locally |

---

<p align="center">Built with ❤️ for seamless video collaboration</p>
