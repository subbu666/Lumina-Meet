import { apiClient } from "../apiClient";
import { API_ENDPOINTS } from "../endpoints";

// ─── Legacy flat item (kept for any code still importing it) ─────────────────
export interface HistoryItem {
  id: string;
  title: string;
  date: number;
  durationMin: number;
}

// ─── New grouped / session-aware types ───────────────────────────────────────

/** One discrete usage of a meeting link */
export interface MeetingSession {
  sessionId: string;
  joinedAt: number; // unix ms
  leftAt: number | null; // unix ms, null if still active
  durationMin: number;
}

/**
 * Badge type shown beside the meeting title in the dashboard.
 *  "instant"   — created by this user via "Instant meeting"
 *  "scheduled" — created via the schedule flow
 *  "joined"    — joined via a pasted link (someone else's meeting)
 */
export type MeetingBadgeType = "instant" | "scheduled" | "joined";

/**
 * A meeting "group" — one meeting link that may have been used multiple times.
 * Each entry in the dashboard history represents one of these.
 */
export interface MeetingGroup {
  meetingId: string;
  title: string;
  type: MeetingBadgeType;
  /** When the meeting link was first created / first joined */
  createdAt: number;
  /**
   * For scheduled meetings: the scheduled date (shown in the badge area).
   * null for instant and joined.
   */
  scheduledFor: number | null;
  /** Total number of sessions (how many times the link was used) */
  sessionCount: number;
  /** Total combined duration across all sessions, in minutes */
  totalDurationMin: number;
  /** Individual usage sessions, newest-first */
  sessions: MeetingSession[];
  /** Whether the meeting is currently active */
  isActive: boolean;
  /**
   * Whether this meeting supports multi-session tracking.
   * true for instant and joined; false for scheduled.
   */
  supportsMultipleSessions: boolean;
}

// ─── Response shapes ─────────────────────────────────────────────────────────

export interface MeetingHistoryResponse {
  groups: MeetingGroup[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatDuration(minutes: number): string {
  if (minutes === 0) return "0m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ─── Raw backend meeting shape ────────────────────────────────────────────────
interface RawMeeting {
  meetingId: string;
  title: string;
  type: "instant" | "scheduled" | "joined";
  status: string;
  createdAt: string;
  scheduledFor?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  duration?: number;
  supportsMultipleSessions?: boolean;
  sessions?: Array<{
    sessionId?: string;
    joinedAt: string;
    leftAt?: string | null;
    durationMin?: number;
  }>;
}

function toMeetingGroup(raw: RawMeeting, index: number): MeetingGroup {
  let sessions: MeetingSession[] = [];

  if (Array.isArray(raw.sessions) && raw.sessions.length > 0) {
    sessions = raw.sessions.map((s, i) => {
      const joinedAt = new Date(s.joinedAt).getTime();
      const leftAt = s.leftAt ? new Date(s.leftAt).getTime() : null;
      const durationMin =
        s.durationMin ?? (leftAt != null ? Math.round((leftAt - joinedAt) / 60_000) : 0);
      return {
        sessionId: s.sessionId ?? `${raw.meetingId}-session-${i}`,
        joinedAt,
        leftAt,
        durationMin,
      };
    });
  } else if (raw.startedAt) {
    const joinedAt = new Date(raw.startedAt).getTime();
    const leftAt = raw.completedAt ? new Date(raw.completedAt).getTime() : null;
    const durationMin =
      leftAt != null ? Math.round((leftAt - joinedAt) / 60_000) : (raw.duration ?? 0);
    sessions = [
      {
        sessionId: `${raw.meetingId}-session-0`,
        joinedAt,
        leftAt,
        durationMin,
      },
    ];
  }

  // Sort sessions newest-first
  sessions.sort((a, b) => b.joinedAt - a.joinedAt);

  const totalDurationMin = sessions.reduce((sum, s) => sum + s.durationMin, 0);
  const isActive = raw.status === "active";
  const type: MeetingBadgeType = raw.type ?? "instant";
  // scheduled meetings don't support multi-session; instant and joined do
  const supportsMultipleSessions = raw.supportsMultipleSessions ?? type !== "scheduled";

  return {
    meetingId: raw.meetingId,
    title: raw.title,
    type,
    createdAt: new Date(raw.createdAt).getTime(),
    scheduledFor: raw.scheduledFor ? new Date(raw.scheduledFor).getTime() : null,
    sessionCount: sessions.length,
    totalDurationMin,
    sessions,
    isActive,
    supportsMultipleSessions,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const meetingService = {
  /**
   * Create an instant meeting.
   * Title is now REQUIRED — the modal collects it before calling this.
   */
  generate: (data: { title: string }): Promise<{ link: string; meetingId: string }> =>
    apiClient.post(API_ENDPOINTS.GENERATE_MEETING, data).then((r) => ({
      link: r.data.data.joinUrl,
      meetingId: r.data.data.meeting.meetingId,
    })),

  /**
   * Schedule a meeting.
   *
   * FIX: scheduledFor MUST be an ISO 8601 string (e.g. "2026-05-26T05:31:00.000Z").
   * The backend validator uses .isISO8601() — sending a unix timestamp number
   * causes a 400 "Invalid date format" validation error.
   *
   * FIX: Backend returns { data: { meeting, joinUrl, invitationsSent } }.
   * scheduledFor lives inside `meeting`, not at the response root.
   */
  schedule: (data: {
    title: string;
    scheduledFor: string; // ISO 8601 string — NOT a unix timestamp number
    description?: string;
    duration?: number;
  }): Promise<{ link: string; meeting: RawMeeting }> =>
    apiClient.post(API_ENDPOINTS.SCHEDULE_MEETING, data).then((r) => ({
      link: r.data.data.joinUrl,
      meeting: r.data.data.meeting, // full meeting object; scheduledFor is inside here
    })),

  invite: (data: { meetingId: string; emails: string[] }) =>
    apiClient.post(API_ENDPOINTS.SEND_INVITE, data).then((r) => r.data.data),

  generateAndInvite: (data: {
    emails: string[];
    title: string;
  }): Promise<{ link: string; meetingId: string; title: string; sent: number; failed: number }> =>
    apiClient.post(API_ENDPOINTS.GENERATE_AND_INVITE, data).then((r) => r.data.data),

  /**
   * Record a "joined" meeting in the user's history.
   * Call this when the user joins via a pasted link.
   * Body: { meetingLink, title }
   */
  recordJoined: (data: { meetingLink: string; title: string }): Promise<void> =>
    apiClient.post(API_ENDPOINTS.RECORD_JOINED_MEETING, data).then(() => undefined),

  /**
   * Fetch meeting history and return it as grouped MeetingGroup[].
   * Also returns the legacy flat items[] for backward-compat.
   */
  history: (): Promise<{ groups: MeetingGroup[]; items: HistoryItem[] }> =>
    apiClient.get(API_ENDPOINTS.MEETING_HISTORY).then((r) => {
      const meetings: RawMeeting[] = r.data.data?.meetings ?? [];

      const groups: MeetingGroup[] = meetings.map((m, i) => toMeetingGroup(m, i));

      const items: HistoryItem[] = groups.map((g) => ({
        id: g.meetingId,
        title: g.title,
        date: g.createdAt,
        durationMin: g.totalDurationMin,
      }));

      return { groups, items };
    }),
};
