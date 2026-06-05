import mongoose from "mongoose";

/**
 * Meeting Model - Lumina Meet
 *
 * ADDED IN THIS VERSION:
 *   recordings[] subdocument - stores per-recording metadata after
 *   each Cloudinary upload. Powers the dashboard Recordings tab and
 *   the recording-ready email.
 *
 * All other fields/methods/virtuals are unchanged from the previous version.
 */
const meetingSchema = new mongoose.Schema(
  {
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Meeting host is required"],
      index: true,
    },
    meetingId: {
      type: String,
      required: [true, "Meeting ID is required"],
      unique: true,
      index: true,
      match: [/^vm-[a-z0-9-]+$/, "Invalid meeting ID format"],
    },
    title: {
      type: String,
      required: [true, "Meeting title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
      default: null,
    },
    type: {
      type: String,
      enum: ["instant", "scheduled", "joined"],
      required: true,
      default: "instant",
    },
    scheduledFor: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number,
      default: 60,
      min: [5, "Minimum duration is 5 minutes"],
      max: [480, "Maximum duration is 480 minutes (8 hours)"],
    },
    status: {
      type: String,
      enum: ["pending", "active", "completed", "cancelled"],
      default: "pending",
    },
    password: {
      type: String,
      default: null,
      select: false,
    },
    isPasswordProtected: {
      type: Boolean,
      default: false,
    },

    // ─── Per-usage sessions ──────────────────────────────────────────────────
    sessions: [
      {
        sessionId: {
          type: String,
          required: true,
        },
        joinedAt: {
          type: Date,
          required: true,
          default: () => new Date(),
        },
        leftAt: {
          type: Date,
          default: null,
        },
        durationMin: {
          type: Number,
          default: 0,
          min: 0,
        },
        participantCount: {
          type: Number,
          default: 0,
          min: 0,
        },
      },
    ],

    // ─── Recordings ──────────────────────────────────────────────────────────
    /**
     * Each entry is created by recordingController.saveRecording() after the
     * frontend finishes uploading to Cloudinary.
     *
     * mode values:
     *   "screen_voice" - screen video + microphone audio
     *   "screen"       - screen video only
     *   "voice"        - microphone audio only
     */
    recordings: [
      {
        /** Unique ID generated server-side (rec-{ts}-{rand}) */
        recordingId: {
          type: String,
          required: true,
        },
        /** Who triggered the recording (host or co-host userId) */
        recordedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        mode: {
          type: String,
          enum: ["screen_voice", "screen", "voice"],
          required: true,
        },
        /** Direct Cloudinary delivery URL (HTTPS, auto-format) */
        cloudinaryUrl: {
          type: String,
          required: true,
        },
        /** Cloudinary public_id - needed for deletion or transformations */
        cloudinaryPublicId: {
          type: String,
          required: true,
        },
        /** Video thumbnail URL (null for voice-only recordings) */
        thumbnailUrl: {
          type: String,
          default: null,
        },
        /** Recording length in whole seconds */
        durationSec: {
          type: Number,
          required: true,
          min: 1,
        },
        /** Raw blob size in bytes as reported by the MediaRecorder Blob */
        fileSizeBytes: {
          type: Number,
          required: true,
          min: 1,
        },
        createdAt: {
          type: Date,
          default: () => new Date(),
        },
      },
    ],

    // ─── Participants ────────────────────────────────────────────────────────
    participants: [
      {
        email: {
          type: String,
          required: true,
          lowercase: true,
          trim: true,
        },
        name: {
          type: String,
          trim: true,
          default: null,
        },
        status: {
          type: String,
          enum: ["invited", "joined", "declined", "left"],
          default: "invited",
        },
        joinedAt: {
          type: Date,
          default: null,
        },
        leftAt: {
          type: Date,
          default: null,
        },
        isHost: {
          type: Boolean,
          default: false,
        },
      },
    ],
    invitedEmails: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    settings: {
      hostVideo: { type: Boolean, default: true },
      participantVideo: { type: Boolean, default: true },
      hostAudio: { type: Boolean, default: true },
      participantAudio: { type: Boolean, default: true },
      waitingRoom: { type: Boolean, default: true },
      allowJoinBeforeHost: { type: Boolean, default: false },
      muteParticipantsOnEntry: { type: Boolean, default: false },
      allowRecording: { type: Boolean, default: true },
      autoRecord: { type: Boolean, default: false },
      allowScreenSharing: { type: Boolean, default: true },
      enableChat: { type: Boolean, default: true },
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    recordingUrl: {
      type: String,
      default: null,
    },
    maxParticipants: {
      type: Number,
      default: 100,
      min: 2,
      max: 1000,
    },
    meetingLink: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
meetingSchema.index({ host: 1, status: 1 });
meetingSchema.index({ meetingId: 1, status: 1 });
meetingSchema.index({ scheduledFor: 1, status: 1 });
meetingSchema.index({ createdAt: -1 });
meetingSchema.index({ type: 1, status: 1 });
// Index for recordings tab query (host + has recordings)
meetingSchema.index({ host: 1, "recordings.0": 1 });

// ─── Pre-save middleware: enforce waitingRoom default ─────────────────────────
meetingSchema.pre("save", function (next) {
  if (!this.settings || typeof this.settings !== "object") {
    this.settings = {};
  }
  if (typeof this.settings.waitingRoom !== "boolean") {
    this.settings.waitingRoom = true;
  }
  next();
});

meetingSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  if (update?.settings && typeof update.settings.waitingRoom !== "boolean") {
    update.settings.waitingRoom = true;
  }
  next();
});

// ─── Virtuals ─────────────────────────────────────────────────────────────────
meetingSchema.virtual("participantCount").get(function () {
  return this.participants.filter((p) => p.status === "joined").length;
});

meetingSchema.virtual("totalInvites").get(function () {
  return this.invitedEmails.length;
});

meetingSchema.virtual("isActive").get(function () {
  return this.status === "active";
});

meetingSchema.virtual("isScheduled").get(function () {
  return this.type === "scheduled" && this.scheduledFor > new Date();
});

meetingSchema.virtual("totalDurationMin").get(function () {
  return this.sessions.reduce((sum, s) => sum + (s.durationMin ?? 0), 0);
});

meetingSchema.virtual("supportsMultipleSessions").get(function () {
  return this.type === "instant" || this.type === "joined";
});

/** Total number of recordings for this meeting */
meetingSchema.virtual("recordingCount").get(function () {
  return (this.recordings || []).length;
});

// ─── Instance methods ─────────────────────────────────────────────────────────

meetingSchema.methods.canJoin = function () {
  if (this.type === "instant" || this.type === "joined") return true;
  if (this.type === "scheduled") {
    const now = new Date();
    const joinWindow = new Date(this.scheduledFor);
    joinWindow.setMinutes(joinWindow.getMinutes() - 15);
    return now >= joinWindow;
  }
  return false;
};

meetingSchema.methods.isHost = function (userId) {
  return this.host.toString() === userId.toString();
};

meetingSchema.methods.isParticipant = function (email) {
  return this.participants.some(
    (p) => p.email.toLowerCase() === email.toLowerCase(),
  );
};

meetingSchema.methods.addParticipant = async function (email, name = null) {
  if (!this.isParticipant(email)) {
    this.participants.push({
      email: email.toLowerCase(),
      name,
      status: "invited",
      isHost: false,
    });
    if (!this.invitedEmails.includes(email.toLowerCase())) {
      this.invitedEmails.push(email.toLowerCase());
    }
    await this.save();
  }
  return this;
};

meetingSchema.methods.markJoined = async function (email) {
  const participant = this.participants.find(
    (p) => p.email.toLowerCase() === email.toLowerCase(),
  );
  if (participant) {
    participant.status = "joined";
    participant.joinedAt = new Date();
    await this.save();
  }
  return this;
};

meetingSchema.methods.start = async function () {
  this.status = "active";
  this.startedAt = new Date();
  await this.save();
  return this;
};

meetingSchema.methods.complete = async function () {
  this.status = "completed";
  this.completedAt = new Date();
  this.participants.forEach((p) => {
    if (p.status === "joined") {
      p.status = "left";
      p.leftAt = new Date();
    }
  });
  await this.save();
  return this;
};

// ─── Session helpers ──────────────────────────────────────────────────────────

meetingSchema.methods.openSession = async function () {
  if (this.type === "scheduled" && this.sessions.length > 0) {
    return this.sessions[this.sessions.length - 1];
  }

  const { v4: uuidv4 } = await import("uuid");
  const session = {
    sessionId: uuidv4(),
    joinedAt: new Date(),
    leftAt: null,
    durationMin: 0,
    participantCount: 0,
  };
  this.sessions.push(session);

  if (this.status !== "active") {
    this.status = "active";
    this.startedAt = this.startedAt ?? new Date();
  }
  await this.save();
  return this.sessions[this.sessions.length - 1];
};

meetingSchema.methods.closeCurrentSession = async function () {
  const open = [...this.sessions].reverse().find((s) => s.leftAt == null);
  if (!open) return this;

  const now = new Date();
  open.leftAt = now;
  open.durationMin = Math.round((now - open.joinedAt) / 60_000);

  if (this.type === "scheduled") {
    this.status = "completed";
    this.completedAt = now;
  }

  await this.save();
  return this;
};

meetingSchema.methods.incrementSessionParticipants = async function () {
  const open = [...this.sessions].reverse().find((s) => s.leftAt == null);
  if (open) {
    open.participantCount += 1;
    await this.save();
  }
  return this;
};

// ─── Public view helpers ──────────────────────────────────────────────────────

meetingSchema.methods.toPublicObject = function () {
  return {
    id: this._id,
    meetingId: this.meetingId,
    title: this.title,
    description: this.description,
    type: this.type,
    scheduledFor: this.scheduledFor,
    status: this.status,
    meetingLink: this.meetingLink,
    settings: this.settings,
    maxParticipants: this.maxParticipants,
    isPasswordProtected: this.isPasswordProtected,
    host: this.host,
    participantCount: this.participantCount,
    createdAt: this.createdAt,
    sessions: this.sessions,
    totalDurationMin: this.totalDurationMin,
    supportsMultipleSessions: this.supportsMultipleSessions,
    recordingCount: this.recordingCount,
  };
};

meetingSchema.methods.toHostObject = function () {
  return {
    ...this.toPublicObject(),
    participants: this.participants,
    invitedEmails: this.invitedEmails,
    totalInvites: this.totalInvites,
    startedAt: this.startedAt,
    completedAt: this.completedAt,
    recordingUrl: this.recordingUrl,
    recordings: this.recordings,
  };
};

// ─── Static methods ───────────────────────────────────────────────────────────

meetingSchema.statics.findByMeetingId = function (meetingId) {
  return this.findOne({ meetingId }).populate(
    "host",
    "username email firstName lastName",
  );
};

meetingSchema.statics.findActiveByHost = function (hostId) {
  return this.find({
    host: hostId,
    status: { $in: ["pending", "active"] },
  }).sort({ createdAt: -1 });
};

meetingSchema.statics.getHistoryForUser = function (userId, options = {}) {
  const { page = 1, limit = 20, status = null } = options;
  const query = { host: userId };
  if (status) query.status = status;
  return this.find(query)
    .populate("host", "username email firstName lastName")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

const Meeting = mongoose.model("Meeting", meetingSchema);

export default Meeting;
