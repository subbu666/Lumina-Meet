/**
 * recordingController.js — Lumina Meet
 *
 * Two endpoints:
 *
 *  POST /api/meeting/recording/signature
 *    — Generates a Cloudinary upload signature so the frontend can upload
 *      directly without routing the binary through our server.
 *    — Auth required (host or co-host only enforced client-side; backend
 *      verifies the user is authenticated and is associated with the meeting).
 *    — SERVER-SIDE LIMIT: rejects any request where durationSec exceeds
 *      MAX_RECORDING_DURATION_SEC (900 s = 15 min). The client enforces
 *      the same limit and auto-stops the MediaRecorder, but we double-check
 *      here so a tampered client cannot bypass the cap and upload an
 *      oversized file to our Cloudinary account.
 *
 *  POST /api/meeting/recording/save
 *    — Called after the Cloudinary upload completes.
 *    — Saves the recording metadata to Meeting.recordings[].
 *    — Sends the recording-ready email to the host.
 *    — Returns the full RecordingEntry.
 *
 * Cloudinary credentials live in env:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *
 * FIX: publicId already contains the full folder path
 * (lumina-meet/{meetingId}/{mode}-{ts}), so we must NOT also pass `folder`
 * to Cloudinary — doing so caused double-nesting and a 404 on delivery.
 * The signature now only covers: public_id + timestamp (+ transformation).
 */

import crypto from "crypto";
import Meeting from "../models/Meeting.js";
import { APIError, asyncHandler } from "../middlewares/errorHandler.js";
import { sendRecordingReadyEmail } from "../utils/sendEmail.js";
import { body, validationResult } from "express-validator";
import {
  MAX_RECORDING_DURATION_SEC,
  MAX_RECORDING_DURATION_MIN,
} from "../constants/index.js";

// ─── Validation rules ─────────────────────────────────────────────────────────

export const signatureValidation = [
  body("meetingId").trim().notEmpty().withMessage("meetingId is required"),
  body("mode")
    .isIn(["screen_voice", "voice", "screen"])
    .withMessage("mode must be screen_voice | voice | screen"),
  body("durationSec")
    .isInt({ min: 1, max: MAX_RECORDING_DURATION_SEC })
    .withMessage(
      `durationSec must be between 1 and ${MAX_RECORDING_DURATION_SEC} (${MAX_RECORDING_DURATION_MIN} minutes)`,
    ),
  body("fileType").trim().notEmpty().withMessage("fileType is required"),
];

export const saveRecordingValidation = [
  body("meetingId").trim().notEmpty().withMessage("meetingId is required"),
  body("publicId").trim().notEmpty().withMessage("publicId is required"),
  body("mode")
    .isIn(["screen_voice", "voice", "screen"])
    .withMessage("invalid mode"),
  body("durationSec")
    .isInt({ min: 1, max: MAX_RECORDING_DURATION_SEC })
    .withMessage(
      `durationSec must be between 1 and ${MAX_RECORDING_DURATION_SEC}`,
    ),
  body("fileSizeBytes")
    .isInt({ min: 1 })
    .withMessage("fileSizeBytes must be >= 1"),
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a Cloudinary signed upload signature.
 * Signs the params that Cloudinary requires for a server-verified upload.
 */
function generateCloudinarySignature(params, apiSecret) {
  const sortedKeys = Object.keys(params).sort();
  const str = sortedKeys.map((k) => `${k}=${params[k]}`).join("&");
  return crypto
    .createHash("sha256")
    .update(str + apiSecret)
    .digest("hex");
}

/**
 * Build the full Cloudinary public_id, which doubles as the storage path.
 * Pattern: lumina-meet/{meetingId}/{mode}-{timestamp}
 *
 * IMPORTANT: Because public_id encodes the full path, do NOT also pass
 * a `folder` param to Cloudinary — it would prepend the folder a second
 * time and produce a double-nested path that 404s on delivery.
 */
function buildPublicId(meetingId, mode) {
  return `lumina-meet/${meetingId}/${mode}-${Date.now()}`;
}

/**
 * Derive the Cloudinary resource_type from the recording mode and mime type.
 * voice → "raw" (audio/webm is not a "video" to Cloudinary)
 * screen / screen_voice → "video"
 */
function getResourceType(mode, fileType) {
  if (mode === "voice") {
    return fileType?.startsWith("video") ? "video" : "raw";
  }
  return "video";
}

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/meeting/recording/signature
 *
 * Returns everything the frontend needs to upload directly to Cloudinary.
 * The signature covers timestamp + public_id (+ transformation for video).
 * `folder` is intentionally excluded — public_id already contains the path.
 *
 * LIMIT ENFORCEMENT:
 * The express-validator rule above already rejects durationSec >
 * MAX_RECORDING_DURATION_SEC with a 400. We add a secondary explicit guard
 * inside the handler body so the error code is unambiguous for the client
 * (RECORDING_LIMIT_EXCEEDED vs a generic validation array).
 */
export const getUploadSignature = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Surface a clean, dedicated error when only the duration field failed.
    const durationError = errors.array().find((e) => e.path === "durationSec");

    if (durationError) {
      return res.status(400).json({
        success: false,
        message: `Recording exceeds the ${MAX_RECORDING_DURATION_MIN}-minute limit.`,
        code: "RECORDING_LIMIT_EXCEEDED",
        limitSec: MAX_RECORDING_DURATION_SEC,
        limitMin: MAX_RECORDING_DURATION_MIN,
      });
    }

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

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new APIError(
      500,
      "Cloudinary credentials not configured",
      "CLOUDINARY_NOT_CONFIGURED",
    );
  }

  const { meetingId, mode, durationSec, fileType } = req.body;

  // ── Secondary hard guard (belt-and-suspenders after express-validator) ──
  // Catches edge cases where the validator was somehow bypassed or durationSec
  // was coerced to a float that slipped through isInt().
  if (Number(durationSec) > MAX_RECORDING_DURATION_SEC) {
    return res.status(400).json({
      success: false,
      message: `Recording duration ${durationSec}s exceeds the ${MAX_RECORDING_DURATION_MIN}-minute (${MAX_RECORDING_DURATION_SEC}s) limit.`,
      code: "RECORDING_LIMIT_EXCEEDED",
      limitSec: MAX_RECORDING_DURATION_SEC,
      limitMin: MAX_RECORDING_DURATION_MIN,
    });
  }

  // Verify meeting exists and user is authenticated
  const meeting = await Meeting.findOne({ meetingId });
  if (!meeting) {
    throw new APIError(404, "Meeting not found", "MEETING_NOT_FOUND");
  }

  const timestamp = Math.round(Date.now() / 1000);
  const publicId = buildPublicId(meetingId, mode);
  const resourceType = getResourceType(mode, fileType);

  // For video uploads we add a transformation that generates a thumbnail
  const transformation = resourceType === "video" ? "q_auto,f_auto" : undefined;

  // ─── FIX ────────────────────────────────────────────────────────────────────
  // Do NOT include `folder` here. publicId is already the full path
  // (e.g. "lumina-meet/vm-xxx/screen_voice-1234567890"). Adding folder
  // would make Cloudinary store it at:
  //   lumina-meet/vm-xxx/lumina-meet/vm-xxx/screen_voice-1234567890
  // causing a 404 when the URL is later built from publicId alone.
  // ────────────────────────────────────────────────────────────────────────────
  const signParams = {
    public_id: publicId,
    timestamp,
    ...(transformation ? { transformation } : {}),
  };

  const signature = generateCloudinarySignature(signParams, apiSecret);

  res.status(200).json({
    success: true,
    data: {
      signature,
      timestamp,
      cloudName,
      apiKey,
      // folder is intentionally omitted — public_id encodes the full path
      publicId,
      resourceType,
      transformation: transformation || null,
    },
  });
});

/**
 * POST /api/meeting/recording/save
 *
 * Called by the frontend after the Cloudinary upload finishes.
 * Saves the recording to the Meeting document and sends the email.
 */
export const saveRecording = asyncHandler(async (req, res) => {
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

  const { meetingId, publicId, mode, durationSec, fileSizeBytes, mimeType } =
    req.body;
  const userId = req.userId;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) {
    throw new APIError(
      500,
      "Cloudinary not configured",
      "CLOUDINARY_NOT_CONFIGURED",
    );
  }

  const meeting = await Meeting.findOne({ meetingId }).populate(
    "host",
    "username email firstName lastName",
  );
  if (!meeting) {
    throw new APIError(404, "Meeting not found", "MEETING_NOT_FOUND");
  }

  // Build the Cloudinary URL from the public_id
  const resourceType = getResourceType(mode, mimeType);
  const ext =
    resourceType === "raw" ? "webm" : mode === "voice" ? "webm" : "mp4";
  const cloudinaryUrl = `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${publicId}.${ext}`;

  // Thumbnail only for video recordings
  const thumbnailUrl =
    resourceType === "video"
      ? `https://res.cloudinary.com/${cloudName}/video/upload/so_0,w_480,h_270,c_fill,q_60/${publicId}.jpg`
      : undefined;

  // Build recording entry
  const recordingEntry = {
    recordingId: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    mode,
    cloudinaryUrl,
    cloudinaryPublicId: publicId,
    durationSec: Number(durationSec),
    fileSizeBytes: Number(fileSizeBytes),
    thumbnailUrl: thumbnailUrl || null,
    createdAt: new Date(),
    recordedBy: userId,
  };

  // Push to meeting recordings array
  if (!meeting.recordings) meeting.recordings = [];
  meeting.recordings.push(recordingEntry);
  await meeting.save();

  // Send email notification (fire and forget — don't fail the API if email fails)
  try {
    const host = meeting.host;
    const hostEmail = host?.email;
    const hostName = host?.firstName || host?.username || "there";
    if (hostEmail) {
      await sendRecordingReadyEmail(hostEmail, {
        hostName,
        meetingTitle: meeting.title,
        meetingId,
        mode,
        durationSec: Number(durationSec),
        cloudinaryUrl,
        thumbnailUrl,
        recordedAt: new Date(),
      });
    }
  } catch (emailErr) {
    console.error("[Recording] Email send failed:", emailErr.message);
  }

  res.status(201).json({
    success: true,
    message: "Recording saved successfully",
    data: {
      recording: {
        ...recordingEntry,
        createdAt: recordingEntry.createdAt.getTime(),
        meetingId,
      },
    },
  });
});

/**
 * GET /api/meeting/recordings
 *
 * Returns all recordings for meetings hosted by the authenticated user.
 * Powers the dashboard recordings history tab.
 */
export const getUserRecordings = asyncHandler(async (req, res) => {
  const userId = req.userId;

  const meetings = await Meeting.find({
    host: userId,
    "recordings.0": { $exists: true }, // only meetings that have at least 1 recording
  })
    .select("meetingId title recordings createdAt")
    .sort({ createdAt: -1 })
    .limit(100);

  // Flatten recordings with meeting context
  const recordings = [];
  for (const m of meetings) {
    for (const r of m.recordings || []) {
      recordings.push({
        recordingId: r.recordingId,
        mode: r.mode,
        cloudinaryUrl: r.cloudinaryUrl,
        cloudinaryPublicId: r.cloudinaryPublicId,
        durationSec: r.durationSec,
        fileSizeBytes: r.fileSizeBytes,
        thumbnailUrl: r.thumbnailUrl,
        meetingId: m.meetingId,
        meetingTitle: m.title,
        createdAt: r.createdAt.getTime(),
      });
    }
  }

  // Sort newest first
  recordings.sort((a, b) => b.createdAt - a.createdAt);

  res.status(200).json({
    success: true,
    data: { recordings },
  });
});

export default {
  getUploadSignature,
  saveRecording,
  getUserRecordings,
};
