import { Router } from "express";
import {
  generateInstantMeeting,
  generateAndInvite,
  scheduleMeeting,
  joinMeeting,
  inviteParticipants,
  getMeeting,
  updateMeeting,
  cancelMeeting,
  getMeetingHistory,
  getUpcomingMeetings,
  endMeeting,
  generateMeetingValidation,
  generateAndInviteValidation,
  scheduleMeetingValidation,
  inviteValidation,
  joinMeetingValidation,
  historyValidation,
} from "../controllers/meetingController.js";
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

// ── Generate + invite in one shot (dashboard "Send invites") ──────────────────
// MUST be registered before '/:meetingId' routes to avoid Express treating
// "generate-and-invite" as a meetingId param.
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
router.patch("/:meetingId", authenticate, updateMeeting);
router.delete("/:meetingId", authenticate, cancelMeeting);
router.post("/:meetingId/end", authenticate, endMeeting);

export default router;
