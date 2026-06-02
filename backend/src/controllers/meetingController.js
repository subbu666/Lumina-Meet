import { validationResult, body, param, query } from "express-validator";
import Meeting from "../models/Meeting.js";
import { generateMeetingId } from "../utils/generateOTP.js";
import { sendMeetingInvitationEmail } from "../utils/sendEmail.js";
import { APIError, asyncHandler } from "../middlewares/errorHandler.js";

// ─── Validation rules ─────────────────────────────────────────────────────────

export const generateMeetingValidation = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Meeting title is required")
    .isLength({ max: 200 })
    .withMessage("Title cannot exceed 200 characters"),
];

export const scheduleMeetingValidation = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Meeting title is required")
    .isLength({ max: 200 })
    .withMessage("Title cannot exceed 200 characters"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Description cannot exceed 1000 characters"),
  body("scheduledFor")
    .notEmpty()
    .withMessage("Scheduled time is required")
    .isISO8601()
    .withMessage("Invalid date format. Use ISO 8601 format"),
  body("duration")
    .optional()
    .isInt({ min: 5, max: 480 })
    .withMessage("Duration must be between 5 and 480 minutes"),
  body("password")
    .optional()
    .isLength({ min: 4, max: 50 })
    .withMessage("Password must be 4-50 characters"),
  body("settings")
    .optional()
    .isObject()
    .withMessage("Settings must be an object"),
  body("emails")
    .optional()
    .isArray({ max: 50 })
    .withMessage("Cannot invite more than 50 people at once")
    .custom((emails) => {
      const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
      const invalid = emails.filter((e) => !emailRegex.test(e));
      if (invalid.length > 0)
        throw new Error(`Invalid email(s): ${invalid.join(", ")}`);
      return true;
    }),
];

export const inviteValidation = [
  body("meetingId").trim().notEmpty().withMessage("Meeting ID is required"),
  body("emails")
    .isArray({ min: 1, max: 50 })
    .withMessage("Provide 1-50 email addresses")
    .custom((emails) => {
      const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
      const invalid = emails.filter((e) => !emailRegex.test(e));
      if (invalid.length > 0)
        throw new Error(`Invalid email(s): ${invalid.join(", ")}`);
      return true;
    }),
];

export const generateAndInviteValidation = [
  body("emails")
    .isArray({ min: 1, max: 50 })
    .withMessage("Provide 1-50 email addresses")
    .custom((emails) => {
      const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
      const invalid = emails.filter((e) => !emailRegex.test(e));
      if (invalid.length > 0)
        throw new Error(`Invalid email(s): ${invalid.join(", ")}`);
      return true;
    }),
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Meeting title is required")
    .isLength({ max: 200 })
    .withMessage("Title cannot exceed 200 characters"),
];

export const joinMeetingValidation = [
  param("meetingId").trim().notEmpty().withMessage("Meeting ID is required"),
  body("password").optional().isString(),
];

export const recordJoinedMeetingValidation = [
  body("meetingLink")
    .trim()
    .notEmpty()
    .withMessage("Meeting link is required")
    .isURL({ require_protocol: true })
    .withMessage("Must be a valid URL"),
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Meeting title is required")
    .isLength({ max: 200 })
    .withMessage("Title cannot exceed 200 characters"),
];

export const historyValidation = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  query("status")
    .optional()
    .isIn(["pending", "active", "completed", "cancelled"])
    .withMessage("Invalid status"),
];

// ─── STEP 1: Add this validation (alongside the other export const *Validation arrays) ───

export const deleteMeetingValidation = [
  param("meetingId").trim().notEmpty().withMessage("Meeting ID is required"),
];

// ─── Shared helper ────────────────────────────────────────────────────────────

async function createUniqueMeetingId() {
  let meetingId;
  let attempts = 0;
  const maxAttempts = 10;
  while (attempts < maxAttempts) {
    meetingId = generateMeetingId();
    const existing = await Meeting.findOne({ meetingId });
    if (!existing) return meetingId;
    attempts++;
  }
  throw new APIError(
    500,
    "Failed to generate unique meeting ID. Please try again.",
    "MEETING_ID_COLLISION",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GENERATE INSTANT MEETING
// ─────────────────────────────────────────────────────────────────────────────

export const generateInstantMeeting = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: errors.array().reduce((acc, err) => {
        if (!acc[err.path]) acc[err.path] = [];
        acc[err.path].push(err.msg);
        return acc;
      }, {}),
    });
  }

  const { title, settings = {} } = req.body;
  const userId = req.userId;

  const meetingId = await createUniqueMeetingId();
  const clientUrl = process.env.CLIENT_URL;
  const meetingLink = `${clientUrl}/meeting/${meetingId}`;

  const meeting = await Meeting.create({
    host: userId,
    meetingId,
    title,
    type: "instant",
    status: "active",
    meetingLink,
    startedAt: new Date(),
    settings: {
      hostVideo: settings.hostVideo ?? true,
      participantVideo: settings.participantVideo ?? true,
      hostAudio: settings.hostAudio ?? true,
      participantAudio: settings.participantAudio ?? true,
      waitingRoom: settings.waitingRoom ?? true,
      allowJoinBeforeHost: settings.allowJoinBeforeHost ?? false,
      muteParticipantsOnEntry: settings.muteParticipantsOnEntry ?? false,
      allowRecording: settings.allowRecording ?? true,
      autoRecord: settings.autoRecord ?? false,
      allowScreenSharing: settings.allowScreenSharing ?? true,
      enableChat: settings.enableChat ?? true,
    },
  });

  const populatedMeeting = await Meeting.findById(meeting._id).populate(
    "host",
    "username email firstName lastName",
  );

  res.status(201).json({
    success: true,
    message: "Instant meeting created successfully",
    data: {
      meeting: populatedMeeting.toHostObject(),
      joinUrl: meetingLink,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. GENERATE MEETING + INVITE
// ─────────────────────────────────────────────────────────────────────────────

export const generateAndInvite = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: errors.array().reduce((acc, err) => {
        if (!acc[err.path]) acc[err.path] = [];
        acc[err.path].push(err.msg);
        return acc;
      }, {}),
    });
  }

  const { emails, title } = req.body;
  const userId = req.userId;

  const meetingId = await createUniqueMeetingId();
  const clientUrl = process.env.CLIENT_URL;
  const meetingLink = `${clientUrl}/meeting/${meetingId}`;

  const participants = emails.map((email) => ({
    email: email.toLowerCase(),
    status: "invited",
    isHost: false,
  }));

  await Meeting.create({
    host: userId,
    meetingId,
    title,
    type: "instant",
    status: "active",
    meetingLink,
    startedAt: new Date(),
    participants,
    invitedEmails: emails.map((e) => e.toLowerCase()),
    settings: {
      hostVideo: true,
      participantVideo: true,
      hostAudio: true,
      participantAudio: true,
      waitingRoom: true,
      allowJoinBeforeHost: true,
      muteParticipantsOnEntry: false,
      allowRecording: true,
      autoRecord: false,
      allowScreenSharing: true,
      enableChat: true,
    },
  });

  const User = (await import("../models/User.js")).default;
  const host = await User.findById(userId);
  const inviterName = host ? host.fullName || host.username : "Someone";

  const emailPromises = emails.map((email) =>
    sendMeetingInvitationEmail(
      email,
      {
        meetingId,
        title,
        description: null,
        meetingLink,
        scheduledFor: null,
        password: null,
        isPasswordProtected: false,
      },
      inviterName,
    ),
  );

  const emailResults = await Promise.allSettled(emailPromises);
  const sent = emailResults.filter(
    (r) => r.status === "fulfilled" && r.value?.success,
  ).length;
  const failed = emails.length - sent;

  console.log(
    `📧 generate-and-invite: ${sent}/${emails.length} emails sent for ${meetingId}`,
  );

  res.status(201).json({
    success: true,
    message: `Meeting created and ${sent} invitation${sent !== 1 ? "s" : ""} sent`,
    data: { meetingId, link: meetingLink, title, sent, failed },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SCHEDULE MEETING
// ─────────────────────────────────────────────────────────────────────────────

export const scheduleMeeting = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: errors.array().reduce((acc, err) => {
        if (!acc[err.path]) acc[err.path] = [];
        acc[err.path].push(err.msg);
        return acc;
      }, {}),
    });
  }

  const {
    title,
    description,
    scheduledFor,
    duration = 60,
    password,
    settings = {},
    emails = [],
  } = req.body;
  const userId = req.userId;
  const scheduledDate = new Date(scheduledFor);
  const now = new Date();

  if (scheduledDate <= now)
    throw new APIError(
      400,
      "Scheduled time must be in the future",
      "INVALID_SCHEDULE_TIME",
    );

  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  if (scheduledDate > oneYearFromNow)
    throw new APIError(
      400,
      "Cannot schedule meetings more than 1 year in advance",
      "SCHEDULE_TOO_FAR",
    );

  const meetingId = await createUniqueMeetingId();
  const clientUrl = process.env.CLIENT_URL;
  const meetingLink = `${clientUrl}/meeting/${meetingId}`;

  const participants = emails.map((email) => ({
    email: email.toLowerCase(),
    status: "invited",
    isHost: false,
  }));

  const meeting = await Meeting.create({
    host: userId,
    meetingId,
    title,
    description: description || null,
    type: "scheduled",
    status: "pending",
    scheduledFor: scheduledDate,
    duration,
    meetingLink,
    isPasswordProtected: !!password,
    password: password || null,
    participants,
    invitedEmails: emails.map((e) => e.toLowerCase()),
    settings: {
      hostVideo: settings.hostVideo ?? true,
      participantVideo: settings.participantVideo ?? true,
      hostAudio: settings.hostAudio ?? true,
      participantAudio: settings.participantAudio ?? true,
      waitingRoom: settings.waitingRoom ?? true,
      allowJoinBeforeHost: settings.allowJoinBeforeHost ?? true,
      muteParticipantsOnEntry: settings.muteParticipantsOnEntry ?? false,
      allowRecording: settings.allowRecording ?? true,
      autoRecord: settings.autoRecord ?? false,
      allowScreenSharing: settings.allowScreenSharing ?? true,
      enableChat: settings.enableChat ?? true,
    },
  });

  if (emails.length > 0) {
    const User = (await import("../models/User.js")).default;
    const host = await User.findById(userId);
    const inviterName = host ? host.fullName || host.username : "Someone";
    const emailPromises = emails.map((email) =>
      sendMeetingInvitationEmail(
        email,
        {
          meetingId,
          title,
          description,
          meetingLink,
          scheduledFor: scheduledDate,
          password,
          isPasswordProtected: !!password,
        },
        inviterName,
      ),
    );
    Promise.allSettled(emailPromises).then((results) => {
      const sent = results.filter(
        (r) => r.status === "fulfilled" && r.value.success,
      ).length;
      console.log(`📧 Sent ${sent}/${emails.length} meeting invitations`);
    });
  }

  const populatedMeeting = await Meeting.findById(meeting._id).populate(
    "host",
    "username email firstName lastName",
  );

  res.status(201).json({
    success: true,
    message: "Meeting scheduled successfully",
    data: {
      meeting: populatedMeeting.toHostObject(),
      joinUrl: meetingLink,
      invitationsSent: emails.length,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. JOIN MEETING
// ─────────────────────────────────────────────────────────────────────────────
//
// CHANGES vs original:
//
// ── NEW: Expiry check for scheduled meetings ────────────────────────────────
//   A scheduled meeting is considered EXPIRED when:
//     now > scheduledFor + duration (minutes)
//   i.e. the entire meeting window has passed.
//
//   When expired AND still "pending" we auto-cancel it (saves DB clutter) and
//   return a 410 MEETING_EXPIRED error so the frontend can show a clear
//   "This meeting has expired" screen instead of silently connecting or
//   showing a generic error.
//
//   The expiry window uses `meeting.duration` (default 60 min) so hosts who
//   set a 3-hour meeting get the full window.
//
// ── UNCHANGED: everything else (password, waiting room, participant limits) ──

export const joinMeeting = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: errors.array().reduce((acc, err) => {
        if (!acc[err.path]) acc[err.path] = [];
        acc[err.path].push(err.msg);
        return acc;
      }, {}),
    });
  }

  const { meetingId } = req.params;
  const { password } = req.body;
  const userId = req.userId;

  const meeting = await Meeting.findOne({ meetingId }).populate(
    "host",
    "username email firstName lastName",
  );

  if (!meeting)
    throw new APIError(
      404,
      "Meeting not found. Please check the meeting ID.",
      "MEETING_NOT_FOUND",
    );
  if (meeting.status === "cancelled")
    throw new APIError(
      410,
      "This meeting has been cancelled.",
      "MEETING_CANCELLED",
    );
  if (meeting.status === "completed")
    throw new APIError(410, "This meeting has already ended.", "MEETING_ENDED");

  // ── NEW: Scheduled meeting expiry enforcement ─────────────────────────────
  // Only applies to scheduled meetings that are still "pending" (never activated).
  // If the meeting was already made "active" by a previous join we skip this —
  // the host can end it manually via the room controls.
  if (
    meeting.type === "scheduled" &&
    meeting.status === "pending" &&
    meeting.scheduledFor
  ) {
    const now = new Date();
    const durationMs = (meeting.duration ?? 60) * 60 * 1000;
    const expiresAt = new Date(meeting.scheduledFor.getTime() + durationMs);

    if (now > expiresAt) {
      // Auto-cancel the meeting so it won't keep showing as "pending" forever
      meeting.status = "cancelled";
      meeting.completedAt = now;
      await meeting.save();

      throw new APIError(
        410,
        "This meeting's scheduled time has passed and it was never started. The link has expired.",
        "MEETING_EXPIRED",
        {
          scheduledFor: meeting.scheduledFor,
          expiredAt: expiresAt.toISOString(),
        },
      );
    }
  }
  // ── END NEW ───────────────────────────────────────────────────────────────

  if (meeting.type === "scheduled" && meeting.status === "pending") {
    if (!meeting.canJoin()) {
      const now = new Date();
      const joinWindow = new Date(meeting.scheduledFor);
      joinWindow.setMinutes(joinWindow.getMinutes() - 15);
      const timeUntilStart = Math.ceil((joinWindow - now) / 60000);
      throw new APIError(
        403,
        `Meeting has not started yet. You can join ${timeUntilStart} minutes before the scheduled time.`,
        "MEETING_NOT_STARTED",
        {
          scheduledFor: meeting.scheduledFor,
          canJoinAt: joinWindow.toISOString(),
          minutesUntilStart: timeUntilStart,
        },
      );
    }
    await meeting.start();
    await meeting.openSession();
  }

  if (meeting.isPasswordProtected) {
    if (!password)
      throw new APIError(
        403,
        "This meeting requires a password.",
        "PASSWORD_REQUIRED",
      );
    const bcrypt = await import("bcryptjs");
    const isValid = await bcrypt.compare(password, meeting.password);
    if (!isValid)
      throw new APIError(
        403,
        "Incorrect meeting password.",
        "INVALID_PASSWORD",
      );
  }

  if (meeting.participantCount >= meeting.maxParticipants) {
    throw new APIError(
      403,
      "This meeting has reached the maximum number of participants.",
      "MEETING_FULL",
    );
  }

  if (userId) {
    const User = (await import("../models/User.js")).default;
    const user = await User.findById(userId);
    if (user)
      await meeting.addParticipant(user.email, user.fullName || user.username);
  }

  res.status(200).json({
    success: true,
    message: "You can join the meeting",
    data: {
      meeting: meeting.toPublicObject(),
      joinUrl: meeting.meetingLink,
      isHost: userId ? meeting.isHost(userId) : false,
      settings: meeting.settings,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. RECORD A "JOINED" MEETING LINK
// ─────────────────────────────────────────────────────────────────────────────

export const recordJoinedMeeting = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: errors.array().reduce((acc, err) => {
        if (!acc[err.path]) acc[err.path] = [];
        acc[err.path].push(err.msg);
        return acc;
      }, {}),
    });
  }

  const { meetingLink, title } = req.body;
  const userId = req.userId;

  let meetingId;
  try {
    const url = new URL(meetingLink);
    const parts = url.pathname.split("/").filter(Boolean);
    meetingId = parts[parts.length - 1];
    if (!meetingId) throw new Error("No ID in path");
  } catch {
    throw new APIError(
      400,
      "Could not extract meeting ID from link",
      "INVALID_LINK",
    );
  }

  let meeting = await Meeting.findOne({
    host: userId,
    meetingId,
    type: "joined",
  });

  if (!meeting) {
    const clientUrl = process.env.CLIENT_URL;
    const canonicalLink = `${clientUrl}/meeting/${meetingId}`;
    meeting = await Meeting.create({
      host: userId,
      meetingId,
      title,
      type: "joined",
      status: "active",
      meetingLink: canonicalLink,
      startedAt: new Date(),
      sessions: [],
    });
  }

  const populatedMeeting = await Meeting.findById(meeting._id).populate(
    "host",
    "username email firstName lastName",
  );

  res.status(201).json({
    success: true,
    message: "Meeting recorded in history",
    data: { meeting: populatedMeeting.toHostObject() },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. INVITE PARTICIPANTS
// ─────────────────────────────────────────────────────────────────────────────

export const inviteParticipants = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: errors.array().reduce((acc, err) => {
        if (!acc[err.path]) acc[err.path] = [];
        acc[err.path].push(err.msg);
        return acc;
      }, {}),
    });
  }

  const { meetingId, emails } = req.body;
  const userId = req.userId;

  const meeting = await Meeting.findOne({ meetingId }).populate(
    "host",
    "username email firstName lastName",
  );
  if (!meeting)
    throw new APIError(404, "Meeting not found", "MEETING_NOT_FOUND");
  if (!meeting.isHost(userId))
    throw new APIError(
      403,
      "Only the meeting host can send invitations",
      "NOT_HOST",
    );

  const newEmails = emails.filter(
    (email) => !meeting.invitedEmails.includes(email.toLowerCase()),
  );

  if (newEmails.length === 0) {
    return res.status(400).json({
      success: false,
      message: "All provided emails have already been invited.",
      data: { alreadyInvited: emails },
    });
  }

  const User = (await import("../models/User.js")).default;
  const host = await User.findById(userId);
  const inviterName = host ? host.fullName || host.username : "Someone";

  for (const email of newEmails) await meeting.addParticipant(email);

  const emailResults = await Promise.allSettled(
    newEmails.map((email) =>
      sendMeetingInvitationEmail(
        email,
        {
          meetingId: meeting.meetingId,
          title: meeting.title,
          description: meeting.description,
          meetingLink: meeting.meetingLink,
          scheduledFor: meeting.scheduledFor,
          password: meeting.isPasswordProtected ? req.body.password : null,
          isPasswordProtected: meeting.isPasswordProtected,
        },
        inviterName,
      ),
    ),
  );

  const sent = emailResults.filter(
    (r) => r.status === "fulfilled" && r.value.success,
  ).length;
  const failed = newEmails.length - sent;

  res.status(200).json({
    success: true,
    message: `Invitations sent: ${sent} successful, ${failed} failed`,
    data: {
      sent,
      failed,
      totalInvited: meeting.invitedEmails.length,
      newInvites: newEmails,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. MEETING MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export const getMeeting = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.userId;
  const meeting = await Meeting.findOne({ meetingId }).populate(
    "host",
    "username email firstName lastName",
  );
  if (!meeting)
    throw new APIError(404, "Meeting not found", "MEETING_NOT_FOUND");
  const isHost = userId && meeting.isHost(userId);
  res.status(200).json({
    success: true,
    data: {
      meeting: isHost ? meeting.toHostObject() : meeting.toPublicObject(),
      isHost,
    },
  });
});

export const updateMeeting = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.userId;
  const updates = req.body;
  const meeting = await Meeting.findOne({ meetingId });
  if (!meeting)
    throw new APIError(404, "Meeting not found", "MEETING_NOT_FOUND");
  if (!meeting.isHost(userId))
    throw new APIError(
      403,
      "Only the host can update this meeting",
      "NOT_HOST",
    );
  if (meeting.status === "completed" || meeting.status === "cancelled")
    throw new APIError(
      400,
      "Cannot update a completed or cancelled meeting",
      "MEETING_ENDED",
    );

  const allowedUpdates = [
    "title",
    "description",
    "duration",
    "settings",
    "maxParticipants",
  ];
  const actualUpdates = {};
  allowedUpdates.forEach((field) => {
    if (updates[field] !== undefined) actualUpdates[field] = updates[field];
  });

  if (updates.scheduledFor && meeting.status === "pending") {
    const newDate = new Date(updates.scheduledFor);
    if (newDate > new Date()) actualUpdates.scheduledFor = newDate;
    else
      throw new APIError(
        400,
        "Scheduled time must be in the future",
        "INVALID_TIME",
      );
  }

  const updatedMeeting = await Meeting.findByIdAndUpdate(
    meeting._id,
    actualUpdates,
    { new: true, runValidators: true },
  ).populate("host", "username email firstName lastName");
  res.status(200).json({
    success: true,
    message: "Meeting updated successfully",
    data: { meeting: updatedMeeting.toHostObject() },
  });
});

export const cancelMeeting = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.userId;
  const meeting = await Meeting.findOne({ meetingId });
  if (!meeting)
    throw new APIError(404, "Meeting not found", "MEETING_NOT_FOUND");
  if (!meeting.isHost(userId))
    throw new APIError(
      403,
      "Only the host can cancel this meeting",
      "NOT_HOST",
    );
  if (meeting.status === "completed")
    throw new APIError(
      400,
      "Cannot cancel a completed meeting",
      "ALREADY_COMPLETED",
    );
  if (meeting.status === "cancelled")
    throw new APIError(
      400,
      "Meeting is already cancelled",
      "ALREADY_CANCELLED",
    );
  meeting.status = "cancelled";
  await meeting.save();
  res.status(200).json({
    success: true,
    message: "Meeting cancelled successfully",
    data: { meetingId, status: "cancelled" },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. MEETING HISTORY
// ─────────────────────────────────────────────────────────────────────────────

export const getMeetingHistory = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: errors.array().reduce((acc, err) => {
        if (!acc[err.path]) acc[err.path] = [];
        acc[err.path].push(err.msg);
        return acc;
      }, {}),
    });
  }

  const userId = req.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  const status = req.query.status;

  const query = { $or: [{ host: userId }] };
  const User = (await import("../models/User.js")).default;
  const user = await User.findById(userId);
  if (user) {
    query.$or.push({ "participants.email": user.email.toLowerCase() });
    query.$or.push({ invitedEmails: user.email.toLowerCase() });
  }
  if (status) query.status = status;

  const [meetings, totalCount] = await Promise.all([
    Meeting.find(query)
      .populate("host", "username email firstName lastName")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Meeting.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  res.status(200).json({
    success: true,
    data: {
      meetings: meetings.map((m) => ({
        ...m.toPublicObject(),
        isHost: m.isHost(userId),
      })),
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    },
  });
});

export const getUpcomingMeetings = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  const query = {
    $or: [{ host: userId }],
    status: { $in: ["pending", "active"] },
  };
  const User = (await import("../models/User.js")).default;
  const user = await User.findById(userId);
  if (user) {
    query.$or.push({ "participants.email": user.email.toLowerCase() });
    query.$or.push({ invitedEmails: user.email.toLowerCase() });
  }

  const [meetings, totalCount] = await Promise.all([
    Meeting.find(query)
      .populate("host", "username email firstName lastName")
      .sort({ scheduledFor: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Meeting.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  res.status(200).json({
    success: true,
    data: {
      meetings: meetings.map((m) => ({
        ...m.toPublicObject(),
        isHost: m.isHost(userId),
      })),
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. END MEETING
// ─────────────────────────────────────────────────────────────────────────────

export const endMeeting = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.userId;

  const meeting = await Meeting.findOne({ meetingId });
  if (!meeting)
    throw new APIError(404, "Meeting not found", "MEETING_NOT_FOUND");
  if (!meeting.isHost(userId))
    throw new APIError(403, "Only the host can end this meeting", "NOT_HOST");
  if (meeting.status !== "active")
    throw new APIError(400, "Only active meetings can be ended", "NOT_ACTIVE");

  await meeting.closeCurrentSession();
  if (meeting.status !== "completed") await meeting.complete();

  try {
    const io = req.app.get("io");
    if (io?._teardownRoom) {
      await io._teardownRoom(meetingId);
    }
  } catch (socketErr) {
    console.error("[EndMeeting] Socket teardown error:", socketErr.message);
  }

  res.status(200).json({
    success: true,
    message: "Meeting ended successfully",
    data: {
      meetingId,
      status: "completed",
      completedAt: meeting.completedAt,
      duration: Math.ceil((meeting.completedAt - meeting.startedAt) / 60000),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. PERMANENTLY DELETE MEETING
//
// Hard-deletes the meeting document from MongoDB.
// Only the host can delete their own meeting.
// Cannot delete a meeting that is currently ACTIVE (someone is in the room).
// Cloudinary recordings are NOT deleted here — only the DB record is removed.
// ─────────────────────────────────────────────────────────────────────────────

export const deleteMeeting = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: errors.array().reduce((acc, err) => {
        if (!acc[err.path]) acc[err.path] = [];
        acc[err.path].push(err.msg);
        return acc;
      }, {}),
    });
  }

  const { meetingId } = req.params;
  const userId = req.userId;

  const meeting = await Meeting.findOne({ meetingId });

  if (!meeting) {
    throw new APIError(404, "Meeting not found", "MEETING_NOT_FOUND");
  }

  // Only the host can delete their meeting
  if (!meeting.isHost(userId)) {
    throw new APIError(
      403,
      "Only the meeting host can delete this meeting",
      "NOT_HOST",
    );
  }

  // Prevent deletion of an actively running meeting — end it first
  if (meeting.status === "active") {
    throw new APIError(
      409,
      "Cannot delete an active meeting. Please end the meeting first.",
      "MEETING_ACTIVE",
    );
  }

  await Meeting.deleteOne({ meetingId });

  res.status(200).json({
    success: true,
    message: "Meeting permanently deleted",
    data: { meetingId },
  });
});

export default {
  generateInstantMeeting,
  generateAndInvite,
  scheduleMeeting,
  joinMeeting,
  recordJoinedMeeting,
  inviteParticipants,
  getMeeting,
  updateMeeting,
  cancelMeeting,
  getMeetingHistory,
  getUpcomingMeetings,
  endMeeting,
  deleteMeeting,
};
