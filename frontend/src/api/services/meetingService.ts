import { apiClient } from "../apiClient";
import { API_ENDPOINTS } from "../endpoints";

export interface HistoryItem {
  id: string;
  title: string;
  date: number;
  durationMin: number;
}

export const meetingService = {
  generate: (): Promise<{ link: string }> =>
    apiClient.post(API_ENDPOINTS.GENERATE_MEETING).then((r) => ({ link: r.data.data.joinUrl })),

  schedule: (data: {
    title: string;
    scheduledFor: string;
    description?: string;
    duration?: number;
  }) =>
    apiClient
      .post(API_ENDPOINTS.SCHEDULE_MEETING, data)
      .then((r) => ({ link: r.data.data.joinUrl, meeting: r.data.data.meeting })),

  /**
   * Invite participants to an existing meeting.
   * The caller must be the host of that meeting.
   */
  invite: (data: { meetingId: string; emails: string[] }) =>
    apiClient.post(API_ENDPOINTS.SEND_INVITE, data).then((r) => r.data.data),

  /**
   * Generate a new instant meeting and immediately invite the given emails.
   * Used by the dashboard "Send invites" dialog where no prior meeting exists.
   * Returns the meeting link so the host can share / join it too.
   */
  generateAndInvite: (data: {
    emails: string[];
    title?: string;
  }): Promise<{ link: string; meetingId: string; sent: number; failed: number }> =>
    apiClient.post(API_ENDPOINTS.GENERATE_AND_INVITE, data).then((r) => r.data.data),

  history: (): Promise<{ items: HistoryItem[] }> =>
    apiClient.get(API_ENDPOINTS.MEETING_HISTORY).then((r) => {
      const meetings = r.data.data?.meetings ?? [];
      const items: HistoryItem[] = meetings.map((m: Record<string, unknown>) => ({
        id: m.meetingId as string,
        title: m.title as string,
        date: m.startedAt
          ? new Date(m.startedAt as string).getTime()
          : new Date(m.createdAt as string).getTime(),
        durationMin: (m.duration as number) ?? 0,
      }));
      return { items };
    }),
};
