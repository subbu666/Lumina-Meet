import { Router } from "express";
import {
  generateInstantMeeting,
  generateAndInvite,
  scheduleMeeting,
  joinMeeting,
  recordJoinedMeeting,
  inviteParticipants,
  getMeeting,
  updateMeeting,
  cancelMeeting,
  deleteMeeting,
  getMeetingHistory,
  getUpcomingMeetings,
  endMeeting,
  renameMeeting,
  renameMeetingValidation,
  generateMeetingValidation,
  generateAndInviteValidation,
  scheduleMeetingValidation,
  inviteValidation,
  joinMeetingValidation,
  recordJoinedMeetingValidation,
  historyValidation,
  deleteMeetingValidation,
} from "../controllers/meetingController.js";
import {
  getUploadSignature,
  saveRecording,
  getUserRecordings,
  signatureValidation,
  saveRecordingValidation,
} from "../controllers/recordingController.js";
import { authenticate } from "../middlewares/authMiddleware.js";
import {
  meetingRateLimiter,
  apiRateLimiter,
} from "../middlewares/rateLimiter.js";

const router = Router();

// ── Instant meeting ───────────────────────────────────────────────────────────
router.post(
  "/generate",
  authenticate,
  meetingRateLimiter,
  generateMeetingValidation,
  generateInstantMeeting,
);

// ── Generate + invite in one shot ─────────────────────────────────────────────
// MUST be before /:meetingId routes — avoids Express treating "generate-and-invite" as a param.
router.post(
  "/generate-and-invite",
  authenticate,
  meetingRateLimiter,
  generateAndInviteValidation,
  generateAndInvite,
);

// ── Schedule meeting ──────────────────────────────────────────────────────────
router.post(
  "/schedule",
  authenticate,
  meetingRateLimiter,
  scheduleMeetingValidation,
  scheduleMeeting,
);

// ── Record a "joined" meeting link in the user's history ─────────────────────
router.post(
  "/record-joined",
  authenticate,
  apiRateLimiter,
  recordJoinedMeetingValidation,
  recordJoinedMeeting,
);

// ─────────────────────────────────────────────────────────────────────────────
// RECORDING ENDPOINTS
// Must be registered before /history, /upcoming, and /:meetingId to avoid
// Express treating "recording" as a meetingId param.
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/meeting/recordings          — all recordings for the current user
router.get("/recordings", authenticate, getUserRecordings);

// POST /api/meeting/recording/signature — get Cloudinary signed upload params
router.post(
  "/recording/signature",
  authenticate,
  meetingRateLimiter,
  signatureValidation,
  getUploadSignature,
);

// POST /api/meeting/recording/save      — save recording metadata + send email
router.post(
  "/recording/save",
  authenticate,
  meetingRateLimiter,
  saveRecordingValidation,
  saveRecording,
);

// ─────────────────────────────────────────────────────────────────────────────

// ── Join meeting (public or authenticated) ────────────────────────────────────
router.post("/join/:meetingId", joinMeetingValidation, joinMeeting);

// ── Send invitations to an existing meeting ───────────────────────────────────
router.post(
  "/invite",
  authenticate,
  meetingRateLimiter,
  inviteValidation,
  inviteParticipants,
);

// ── History & upcoming (fixed routes before param routes) ────────────────────
router.get("/history", authenticate, historyValidation, getMeetingHistory);
router.get("/upcoming", authenticate, getUpcomingMeetings);

// ── Single meeting CRUD (param routes last) ───────────────────────────────────
router.get("/:meetingId", authenticate, getMeeting);

// Title-only rename (dedicated endpoint — sends confirmation email)
// MUST be before /:meetingId to avoid Express treating "rename" as a meetingId value.
router.patch(
  "/:meetingId/rename",
  authenticate,
  apiRateLimiter,
  renameMeetingValidation,
  renameMeeting,
);

// Full update (title, description, duration, settings, maxParticipants)
router.patch("/:meetingId", authenticate, updateMeeting);

// DELETE /:meetingId/cancel  — soft cancel (status → "cancelled"), keeps DB record
router.delete("/:meetingId/cancel", authenticate, cancelMeeting);

// DELETE /:meetingId         — hard delete (removes document from DB entirely)
router.delete(
  "/:meetingId",
  authenticate,
  deleteMeetingValidation,
  deleteMeeting,
);

router.post("/:meetingId/end", authenticate, endMeeting);

export default router;
