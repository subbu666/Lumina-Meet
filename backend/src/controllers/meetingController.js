import { validationResult, body, param, query } from "express-validator";
import Meeting from "../models/Meeting.js";
import { generateMeetingId } from "../utils/generateOTP.js";
import { sendMeetingInvitationEmail } from "../utils/sendEmail.js";
import { APIError, asyncHandler } from "../middlewares/errorHandler.js";

/**
 * Meeting Controller
 * Handles all meeting operations:
 * - Generate instant meeting
 * - Schedule meeting
 * - Join meeting
 * - Send invites
 * - Get meeting history
 */

// Validation rules
export const generateMeetingValidation = [
  body("title")
    .optional()
    .trim()
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
      if (invalid.length > 0) {
        throw new Error(`Invalid email(s): ${invalid.join(", ")}`);
      }
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
      if (invalid.length > 0) {
        throw new Error(`Invalid email(s): ${invalid.join(", ")}`);
      }
      return true;
    }),
];

export const joinMeetingValidation = [
  param("meetingId").trim().notEmpty().withMessage("Meeting ID is required"),
  body("password").optional().isString(),
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

/**
 * ==========================================
 * MEETING GENERATION
 * ==========================================
 */

/**
 * Generate Instant Meeting
 * Creates an instant meeting that can be joined immediately
 * POST /api/meeting/generate
 */
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

  const { title = "Instant Meeting", settings = {} } = req.body;
  const userId = req.userId;

  // Generate unique meeting ID
  let meetingId;
  let exists = true;
  let attempts = 0;
  const maxAttempts = 10;

  while (exists && attempts < maxAttempts) {
    meetingId = generateMeetingId();
    const existing = await Meeting.findOne({ meetingId });
    if (!existing) {
      exists = false;
    }
    attempts++;
  }

  if (exists) {
    throw new APIError(
      500,
      "Failed to generate unique meeting ID. Please try again.",
      "MEETING_ID_COLLISION",
    );
  }

  // Build meeting link
  const clientUrl = process.env.CLIENT_URL;
  const meetingLink = `${clientUrl}/meeting/${meetingId}`;

  // Create meeting
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
      waitingRoom: settings.waitingRoom ?? false,
      allowJoinBeforeHost: settings.allowJoinBeforeHost ?? false,
      muteParticipantsOnEntry: settings.muteParticipantsOnEntry ?? false,
      allowRecording: settings.allowRecording ?? true,
      autoRecord: settings.autoRecord ?? false,
      allowScreenSharing: settings.allowScreenSharing ?? true,
      enableChat: settings.enableChat ?? true,
    },
  });

  // Populate host info
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

/**
 * ==========================================
 * SCHEDULE MEETING
 * ==========================================
 */

/**
 * Schedule Meeting
 * Creates a meeting for a future time
 * POST /api/meeting/schedule
 */
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

  // Validate scheduled time is in the future
  const scheduledDate = new Date(scheduledFor);
  const now = new Date();

  if (scheduledDate <= now) {
    throw new APIError(
      400,
      "Scheduled time must be in the future",
      "INVALID_SCHEDULE_TIME",
    );
  }

  // Maximum scheduling window (1 year)
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  if (scheduledDate > oneYearFromNow) {
    throw new APIError(
      400,
      "Cannot schedule meetings more than 1 year in advance",
      "SCHEDULE_TOO_FAR",
    );
  }

  // Generate unique meeting ID
  let meetingId;
  let exists = true;
  let attempts = 0;
  const maxAttempts = 10;

  while (exists && attempts < maxAttempts) {
    meetingId = generateMeetingId();
    const existing = await Meeting.findOne({ meetingId });
    if (!existing) {
      exists = false;
    }
    attempts++;
  }

  if (exists) {
    throw new APIError(
      500,
      "Failed to generate unique meeting ID",
      "MEETING_ID_COLLISION",
    );
  }

  // Build meeting link
  const clientUrl = process.env.CLIENT_URL;
  const meetingLink = `${clientUrl}/meeting/${meetingId}`;

  // Prepare participants from email list
  const participants = emails.map((email) => ({
    email: email.toLowerCase(),
    status: "invited",
    isHost: false,
  }));

  // Create meeting
  const meetingData = {
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
      waitingRoom: settings.waitingRoom ?? false,
      allowJoinBeforeHost: settings.allowJoinBeforeHost ?? true,
      muteParticipantsOnEntry: settings.muteParticipantsOnEntry ?? false,
      allowRecording: settings.allowRecording ?? true,
      autoRecord: settings.autoRecord ?? false,
      allowScreenSharing: settings.allowScreenSharing ?? true,
      enableChat: settings.enableChat ?? true,
    },
  };

  const meeting = await Meeting.create(meetingData);

  // Send invitation emails to participants
  if (emails.length > 0) {
    const host = await (
      await import("../models/User.js")
    ).default.findById(userId);
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

    // Send emails in background (don't block response)
    Promise.allSettled(emailPromises).then((results) => {
      const sent = results.filter(
        (r) => r.status === "fulfilled" && r.value.success,
      ).length;
      console.log(`📧 Sent ${sent}/${emails.length} meeting invitations`);
    });
  }

  // Populate host info
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

/**
 * ==========================================
 * JOIN MEETING
 * ==========================================
 */

/**
 * Join Meeting
 * Validates meeting and returns join info
 * POST /api/meeting/join/:meetingId
 */
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

  // Find meeting
  const meeting = await Meeting.findOne({ meetingId }).populate(
    "host",
    "username email firstName lastName",
  );

  if (!meeting) {
    throw new APIError(
      404,
      "Meeting not found. Please check the meeting ID.",
      "MEETING_NOT_FOUND",
    );
  }

  // Check if meeting is cancelled
  if (meeting.status === "cancelled") {
    throw new APIError(
      410,
      "This meeting has been cancelled.",
      "MEETING_CANCELLED",
    );
  }

  // Check if meeting is completed
  if (meeting.status === "completed") {
    throw new APIError(410, "This meeting has already ended.", "MEETING_ENDED");
  }

  // Check scheduled time for scheduled meetings
  if (meeting.type === "scheduled" && meeting.status === "pending") {
    if (!meeting.canJoin()) {
      const now = new Date();
      const joinWindow = new Date(meeting.scheduledFor);
      joinWindow.setMinutes(joinWindow.getMinutes() - 15);

      const timeUntilStart = Math.ceil((joinWindow - now) / 60000); // minutes

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

    // Auto-start the meeting when first person joins
    await meeting.start();
  }

  // Verify password if protected
  if (meeting.isPasswordProtected) {
    if (!password) {
      throw new APIError(
        403,
        "This meeting requires a password.",
        "PASSWORD_REQUIRED",
      );
    }

    const bcrypt = await import("bcryptjs");
    const isValid = await bcrypt.compare(password, meeting.password);

    if (!isValid) {
      throw new APIError(
        403,
        "Incorrect meeting password.",
        "INVALID_PASSWORD",
      );
    }
  }

  // Check max participants
  if (meeting.participantCount >= meeting.maxParticipants) {
    throw new APIError(
      403,
      "This meeting has reached the maximum number of participants.",
      "MEETING_FULL",
    );
  }

  // Add user as participant if authenticated
  if (userId) {
    const user = await (
      await import("../models/User.js")
    ).default.findById(userId);
    if (user) {
      await meeting.addParticipant(user.email, user.fullName || user.username);
    }
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

/**
 * ==========================================
 * INVITE PARTICIPANTS
 * ==========================================
 */

/**
 * Send Meeting Invitations
 * Sends email invites to participants
 * POST /api/meeting/invite
 */
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

  const { meetingId, emails, message: customMessage } = req.body;
  const userId = req.userId;

  // Find meeting
  const meeting = await Meeting.findOne({ meetingId }).populate(
    "host",
    "username email firstName lastName",
  );

  if (!meeting) {
    throw new APIError(404, "Meeting not found", "MEETING_NOT_FOUND");
  }

  // Verify user is host
  if (!meeting.isHost(userId)) {
    throw new APIError(
      403,
      "Only the meeting host can send invitations",
      "NOT_HOST",
    );
  }

  // Filter out already invited emails
  const newEmails = emails.filter(
    (email) => !meeting.invitedEmails.includes(email.toLowerCase()),
  );

  if (newEmails.length === 0) {
    return res.status(400).json({
      success: false,
      message: "All provided emails have already been invited.",
      data: {
        alreadyInvited: emails,
      },
    });
  }

  // Add new participants to meeting
  const host = await (
    await import("../models/User.js")
  ).default.findById(userId);
  const inviterName = host ? host.fullName || host.username : "Someone";

  // Add to meeting
  for (const email of newEmails) {
    await meeting.addParticipant(email);
  }

  // Send invitation emails
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

/**
 * ==========================================
 * MEETING MANAGEMENT
 * ==========================================
 */

/**
 * Get Meeting Details
 * GET /api/meeting/:meetingId
 */
export const getMeeting = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.userId;

  const meeting = await Meeting.findOne({ meetingId }).populate(
    "host",
    "username email firstName lastName",
  );

  if (!meeting) {
    throw new APIError(404, "Meeting not found", "MEETING_NOT_FOUND");
  }

  // Return full data if host, public data otherwise
  const isHost = userId && meeting.isHost(userId);

  res.status(200).json({
    success: true,
    data: {
      meeting: isHost ? meeting.toHostObject() : meeting.toPublicObject(),
      isHost,
    },
  });
});

/**
 * Update Meeting
 * PATCH /api/meeting/:meetingId
 */
export const updateMeeting = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.userId;
  const updates = req.body;

  const meeting = await Meeting.findOne({ meetingId });

  if (!meeting) {
    throw new APIError(404, "Meeting not found", "MEETING_NOT_FOUND");
  }

  if (!meeting.isHost(userId)) {
    throw new APIError(
      403,
      "Only the host can update this meeting",
      "NOT_HOST",
    );
  }

  // Prevent updating completed/cancelled meetings
  if (meeting.status === "completed" || meeting.status === "cancelled") {
    throw new APIError(
      400,
      "Cannot update a completed or cancelled meeting",
      "MEETING_ENDED",
    );
  }

  // Allowed updates
  const allowedUpdates = [
    "title",
    "description",
    "duration",
    "settings",
    "maxParticipants",
  ];
  const actualUpdates = {};

  allowedUpdates.forEach((field) => {
    if (updates[field] !== undefined) {
      actualUpdates[field] = updates[field];
    }
  });

  // Update scheduled time if meeting hasn't started
  if (updates.scheduledFor && meeting.status === "pending") {
    const newDate = new Date(updates.scheduledFor);
    if (newDate > new Date()) {
      actualUpdates.scheduledFor = newDate;
    } else {
      throw new APIError(
        400,
        "Scheduled time must be in the future",
        "INVALID_TIME",
      );
    }
  }

  const updatedMeeting = await Meeting.findByIdAndUpdate(
    meeting._id,
    actualUpdates,
    { new: true, runValidators: true },
  ).populate("host", "username email firstName lastName");

  res.status(200).json({
    success: true,
    message: "Meeting updated successfully",
    data: {
      meeting: updatedMeeting.toHostObject(),
    },
  });
});

/**
 * Cancel Meeting
 * DELETE /api/meeting/:meetingId
 */
export const cancelMeeting = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.userId;

  const meeting = await Meeting.findOne({ meetingId });

  if (!meeting) {
    throw new APIError(404, "Meeting not found", "MEETING_NOT_FOUND");
  }

  if (!meeting.isHost(userId)) {
    throw new APIError(
      403,
      "Only the host can cancel this meeting",
      "NOT_HOST",
    );
  }

  if (meeting.status === "completed") {
    throw new APIError(
      400,
      "Cannot cancel a completed meeting",
      "ALREADY_COMPLETED",
    );
  }

  if (meeting.status === "cancelled") {
    throw new APIError(
      400,
      "Meeting is already cancelled",
      "ALREADY_CANCELLED",
    );
  }

  meeting.status = "cancelled";
  await meeting.save();

  res.status(200).json({
    success: true,
    message: "Meeting cancelled successfully",
    data: {
      meetingId,
      status: "cancelled",
    },
  });
});

/**
 * ==========================================
 * MEETING HISTORY
 * ==========================================
 */

/**
 * Get Meeting History
 * Returns paginated meeting history for the authenticated user
 * GET /api/meeting/history
 */
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

  // Build query - find meetings where user is host OR participant
  const query = {
    $or: [{ host: userId }],
  };

  // For participant searches, we need the user's email
  const user = await (
    await import("../models/User.js")
  ).default.findById(userId);
  if (user) {
    query.$or.push({ "participants.email": user.email.toLowerCase() });
    query.$or.push({ invitedEmails: user.email.toLowerCase() });
  }

  // Filter by status if provided
  if (status) {
    query.status = status;
  }

  // Execute query with pagination
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

/**
 * Get Upcoming Meetings
 * Returns meetings scheduled for the future
 * GET /api/meeting/upcoming
 */
export const getUpcomingMeetings = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  const now = new Date();

  const query = {
    $or: [{ host: userId }],
    status: { $in: ["pending", "active"] },
  };

  const user = await (
    await import("../models/User.js")
  ).default.findById(userId);
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

/**
 * End Meeting (Host only)
 * Marks meeting as completed
 * POST /api/meeting/:meetingId/end
 */
export const endMeeting = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.userId;

  const meeting = await Meeting.findOne({ meetingId });

  if (!meeting) {
    throw new APIError(404, "Meeting not found", "MEETING_NOT_FOUND");
  }

  if (!meeting.isHost(userId)) {
    throw new APIError(403, "Only the host can end this meeting", "NOT_HOST");
  }

  if (meeting.status !== "active") {
    throw new APIError(400, "Only active meetings can be ended", "NOT_ACTIVE");
  }

  await meeting.complete();

  res.status(200).json({
    success: true,
    message: "Meeting ended successfully",
    data: {
      meetingId,
      status: "completed",
      completedAt: meeting.completedAt,
      duration: Math.ceil((meeting.completedAt - meeting.startedAt) / 60000), // minutes
    },
  });
});

export default {
  generateInstantMeeting,
  scheduleMeeting,
  joinMeeting,
  inviteParticipants,
  getMeeting,
  updateMeeting,
  cancelMeeting,
  getMeetingHistory,
  getUpcomingMeetings,
  endMeeting,
};
