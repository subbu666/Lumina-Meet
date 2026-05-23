import mongoose from "mongoose";

/**
 * Meeting Model
 * Stores video meeting sessions with scheduling, participant tracking,
 * and per-usage session history so the dashboard can show how many
 * times a link was used and the duration of each use.
 *
 * Types:
 *   "instant"   — created by the host via "Instant meeting" button
 *   "scheduled" — created via the schedule flow, has a scheduledFor date
 *   "joined"    — a foreign link the user joined (not hosted by them);
 *                 recorded in history so they can see it later
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
      // "joined" = user joined someone else's meeting; we store it for history
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
    /**
     * Each time someone joins this meeting link a new session document is
     * pushed here.  When the meeting ends (host clicks "End" or last
     * participant disconnects) the open session is closed with leftAt and
     * durationMin computed server-side.
     *
     * Enabled for: instant, joined
     * Disabled for: scheduled (single-use by design)
     *
     * This is what powers the hierarchical history in the dashboard:
     *   Video Lecture – 1   [instant]
     *     └ 21 May 2026, 9:19 PM  ·  30m
     *     └ 21 May 2026, 9:16 PM  ·  2h
     *     └ 21 May 2026, 9:01 PM  ·  45m
     */
    sessions: [
      {
        /** Unique ID for this usage, used as React key and for lookups */
        sessionId: {
          type: String,
          required: true,
        },
        /** When the first participant (usually the host) joined */
        joinedAt: {
          type: Date,
          required: true,
          default: () => new Date(),
        },
        /** When the last participant left / host ended the meeting */
        leftAt: {
          type: Date,
          default: null,
        },
        /**
         * Pre-computed duration in whole minutes so the API response is
         * cheap to read without arithmetic on the client.
         * Set to 0 while the session is still open (leftAt is null).
         */
        durationMin: {
          type: Number,
          default: 0,
          min: 0,
        },
        /** How many distinct participants joined in this session */
        participantCount: {
          type: Number,
          default: 0,
          min: 0,
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
      waitingRoom: { type: Boolean, default: false },
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

/** Total combined duration (minutes) across all closed sessions */
meetingSchema.virtual("totalDurationMin").get(function () {
  return this.sessions.reduce((sum, s) => sum + (s.durationMin ?? 0), 0);
});

/**
 * Whether this meeting type supports multiple sessions.
 * instant and joined links can be reused; scheduled meetings cannot.
 */
meetingSchema.virtual("supportsMultipleSessions").get(function () {
  return this.type === "instant" || this.type === "joined";
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

/**
 * Open a new session when the meeting starts (first participant joins).
 * For scheduled meetings, only one session is allowed — if one already
 * exists this is a no-op and the existing session is returned.
 * Returns the new (or existing) session document.
 */
meetingSchema.methods.openSession = async function () {
  // Scheduled meetings: single-use — don't open a second session
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

/**
 * Close the most-recent open session (leftAt === null).
 * Computes durationMin and saves the document.
 * For instant/joined meetings the meeting stays "active" so the link
 * can be reused; for scheduled meetings it is marked "completed".
 */
meetingSchema.methods.closeCurrentSession = async function () {
  const open = [...this.sessions].reverse().find((s) => s.leftAt == null);
  if (!open) return this;

  const now = new Date();
  open.leftAt = now;
  open.durationMin = Math.round((now - open.joinedAt) / 60_000);

  // Scheduled meetings are single-use — mark completed
  if (this.type === "scheduled") {
    this.status = "completed";
    this.completedAt = now;
  }
  // instant / joined stay active for reuse

  await this.save();
  return this;
};

/**
 * Increment participant count on the current open session.
 * Call this whenever a new socket joins the room.
 */
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
