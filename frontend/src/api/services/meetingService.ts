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

export interface MeetingSession {
  sessionId: string;
  joinedAt: number;
  leftAt: number | null;
  durationMin: number;
}

export type MeetingBadgeType = "instant" | "scheduled" | "joined";

export interface MeetingGroup {
  meetingId: string;
  title: string;
  type: MeetingBadgeType;
  createdAt: number;
  scheduledFor: number | null;
  sessionCount: number;
  totalDurationMin: number;
  sessions: MeetingSession[];
  isActive: boolean;
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

// ─── Duplicate-title error detection ─────────────────────────────────────────

/**
 * Returns the conflicting title string if the API error is a DUPLICATE_TITLE
 * 409, otherwise returns null.
 *
 * Usage:
 *   const dup = extractDuplicateTitle(err);
 *   if (dup) { open modal with dup } else { toast generic error }
 */
export function extractDuplicateTitle(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const response = (err as any)?.response;
  if (!response) return null;

  const status = response.status;
  const data = response.data;

  if (status !== 409) return null;
  if (data?.code !== "DUPLICATE_TITLE") return null;

  // Prefer the server-returned conflicting title (exact casing from DB),
  // fall back to extracting it from the message string.
  if (data?.details?.conflictingTitle) return data.details.conflictingTitle as string;

  const match = (data?.message as string)?.match(/titled "(.+?)"/);
  return match ? match[1] : null;
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

  sessions.sort((a, b) => b.joinedAt - a.joinedAt);

  const totalDurationMin = sessions.reduce((sum, s) => sum + s.durationMin, 0);
  const isActive = raw.status === "active";
  const type: MeetingBadgeType = raw.type ?? "instant";
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
   * On DUPLICATE_TITLE (409) the error propagates - callers should use
   * extractDuplicateTitle() to detect it and open the DuplicateTitleModal.
   */
  generate: (data: { title: string }): Promise<{ link: string; meetingId: string }> =>
    apiClient.post(API_ENDPOINTS.GENERATE_MEETING, data).then((r) => ({
      link: r.data.data.joinUrl,
      meetingId: r.data.data.meeting.meetingId,
    })),

  /**
   * Schedule a meeting.
   * scheduledFor MUST be an ISO 8601 string.
   * On DUPLICATE_TITLE (409) the error propagates.
   */
  schedule: (data: {
    title: string;
    scheduledFor: string;
    description?: string;
    duration?: number;
  }): Promise<{ link: string; meeting: RawMeeting }> =>
    apiClient.post(API_ENDPOINTS.SCHEDULE_MEETING, data).then((r) => ({
      link: r.data.data.joinUrl,
      meeting: r.data.data.meeting,
    })),

  invite: (data: { meetingId: string; emails: string[] }) =>
    apiClient.post(API_ENDPOINTS.SEND_INVITE, data).then((r) => r.data.data),

  /**
   * Generate a meeting + email invitations in one shot.
   * On DUPLICATE_TITLE (409) the error propagates.
   */
  generateAndInvite: (data: {
    emails: string[];
    title: string;
  }): Promise<{ link: string; meetingId: string; title: string; sent: number; failed: number }> =>
    apiClient.post(API_ENDPOINTS.GENERATE_AND_INVITE, data).then((r) => r.data.data),

  /**
   * Record a "joined" meeting in the user's history.
   * On DUPLICATE_TITLE (409) the error propagates.
   */
  recordJoined: (data: { meetingLink: string; title: string }): Promise<void> =>
    apiClient.post(API_ENDPOINTS.RECORD_JOINED_MEETING, data).then(() => undefined),

  /**
   * Fetch meeting history and return it as grouped MeetingGroup[].
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

  /**
   * Permanently hard-delete a meeting from the database.
   */
  deleteMeeting: (meetingId: string): Promise<void> =>
    apiClient.delete(`${API_ENDPOINTS.DELETE_MEETING}/${meetingId}`).then(() => undefined),

  /**
   * Rename a meeting title.
   * Works for all types (instant, scheduled, joined).
   * Only the record owner (host) can call this.
   * On DUPLICATE_TITLE (409) the error propagates - use extractDuplicateTitle().
   * On success, a confirmation email is sent to the host automatically.
   */
  renameMeeting: (
    meetingId: string,
    title: string,
  ): Promise<{ meetingId: string; oldTitle: string; newTitle: string }> =>
    apiClient.patch(`${API_ENDPOINTS.RENAME_MEETING}/${meetingId}/rename`, { title }).then((r) => ({
      meetingId,
      oldTitle: r.data.data.oldTitle as string,
      newTitle: r.data.data.newTitle as string,
    })),
};
