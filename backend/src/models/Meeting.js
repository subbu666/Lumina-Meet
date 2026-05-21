import mongoose from "mongoose";

/**
 * Meeting Model
 * Stores video meeting sessions with scheduling and participant tracking
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
      // Format: vm-XXXX-XXXX-XXXX (vm = Lumina Meet)
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
    // Meeting type
    type: {
      type: String,
      enum: ["instant", "scheduled"],
      required: true,
      default: "instant",
    },
    // Scheduled time (for scheduled meetings)
    scheduledFor: {
      type: Date,
      default: null,
    },
    // Meeting duration in minutes
    duration: {
      type: Number,
      default: 60,
      min: [5, "Minimum duration is 5 minutes"],
      max: [480, "Maximum duration is 480 minutes (8 hours)"],
    },
    // Meeting status
    status: {
      type: String,
      enum: ["pending", "active", "completed", "cancelled"],
      default: "pending",
    },
    // Password protection
    password: {
      type: String,
      default: null,
      select: false,
    },
    isPasswordProtected: {
      type: Boolean,
      default: false,
    },
    // Participants
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
    // Invited emails (for tracking invites sent)
    invitedEmails: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    // Meeting settings
    settings: {
      // Video
      hostVideo: {
        type: Boolean,
        default: true,
      },
      participantVideo: {
        type: Boolean,
        default: true,
      },
      // Audio
      hostAudio: {
        type: Boolean,
        default: true,
      },
      participantAudio: {
        type: Boolean,
        default: true,
      },
      // Security
      waitingRoom: {
        type: Boolean,
        default: false,
      },
      allowJoinBeforeHost: {
        type: Boolean,
        default: false,
      },
      muteParticipantsOnEntry: {
        type: Boolean,
        default: false,
      },
      // Recording
      allowRecording: {
        type: Boolean,
        default: true,
      },
      autoRecord: {
        type: Boolean,
        default: false,
      },
      // Screen sharing
      allowScreenSharing: {
        type: Boolean,
        default: true,
      },
      // Chat
      enableChat: {
        type: Boolean,
        default: true,
      },
    },
    // Meeting started/completed timestamps
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    // Recording info
    recordingUrl: {
      type: String,
      default: null,
    },
    // Maximum participants allowed
    maxParticipants: {
      type: Number,
      default: 100,
      min: 2,
      max: 1000,
    },
    // Meeting link
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

// Compound indexes for efficient queries
meetingSchema.index({ host: 1, status: 1 });
meetingSchema.index({ meetingId: 1, status: 1 });
meetingSchema.index({ scheduledFor: 1, status: 1 });
meetingSchema.index({ createdAt: -1 }); // For recent meetings query
meetingSchema.index({ type: 1, status: 1 });

// Virtual for participant count
meetingSchema.virtual("participantCount").get(function () {
  return this.participants.filter((p) => p.status === "joined").length;
});

// Virtual for total invites
meetingSchema.virtual("totalInvites").get(function () {
  return this.invitedEmails.length;
});

// Virtual for isActive
meetingSchema.virtual("isActive").get(function () {
  return this.status === "active";
});

// Virtual for isScheduled
meetingSchema.virtual("isScheduled").get(function () {
  return this.type === "scheduled" && this.scheduledFor > new Date();
});

// Instance method to check if meeting can be joined
meetingSchema.methods.canJoin = function () {
  // Instant meetings can be joined anytime
  if (this.type === "instant") return true;

  // Scheduled meetings can be joined 15 minutes before scheduled time
  if (this.type === "scheduled") {
    const now = new Date();
    const joinWindow = new Date(this.scheduledFor);
    joinWindow.setMinutes(joinWindow.getMinutes() - 15);
    return now >= joinWindow;
  }

  return false;
};

// Instance method to check if user is host
meetingSchema.methods.isHost = function (userId) {
  return this.host.toString() === userId.toString();
};

// Instance method to check if user is a participant
meetingSchema.methods.isParticipant = function (email) {
  return this.participants.some(
    (p) => p.email.toLowerCase() === email.toLowerCase(),
  );
};

// Instance method to add participant
meetingSchema.methods.addParticipant = async function (email, name = null) {
  const exists = this.isParticipant(email);
  if (!exists) {
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

// Instance method to mark participant as joined
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

// Instance method to start meeting
meetingSchema.methods.start = async function () {
  this.status = "active";
  this.startedAt = new Date();
  await this.save();
  return this;
};

// Instance method to complete meeting
meetingSchema.methods.complete = async function () {
  this.status = "completed";
  this.completedAt = new Date();
  // Mark all active participants as left
  this.participants.forEach((p) => {
    if (p.status === "joined") {
      p.status = "left";
      p.leftAt = new Date();
    }
  });
  await this.save();
  return this;
};

// Instance method to sanitize meeting data for public view
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
  };
};

// Instance method to get full meeting data (for host)
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

// Static method to find by meetingId
meetingSchema.statics.findByMeetingId = function (meetingId) {
  return this.findOne({ meetingId }).populate(
    "host",
    "username email firstName lastName",
  );
};

// Static method to find active meetings by host
meetingSchema.statics.findActiveByHost = function (hostId) {
  return this.find({
    host: hostId,
    status: { $in: ["pending", "active"] },
  }).sort({ createdAt: -1 });
};

// Static method to get meeting history for a user
meetingSchema.statics.getHistoryForUser = function (userId, options = {}) {
  const { page = 1, limit = 10, status = null } = options;
  const query = {
    $or: [
      { host: userId },
      { "participants.email": { $exists: true } }, // Will be refined with actual email
    ],
  };

  if (status) {
    query.status = status;
  }

  return this.find(query)
    .populate("host", "username email firstName lastName")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

const Meeting = mongoose.model("Meeting", meetingSchema);

export default Meeting;
