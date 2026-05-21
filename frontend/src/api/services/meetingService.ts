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
    apiClient.post(API_ENDPOINTS.GENERATE_MEETING).then((r) => ({ link: r.data.data.joinUrl })), // backend sends joinUrl

  schedule: (data: {
    title: string;
    scheduledFor: string;
    description?: string;
    duration?: number;
  }) =>
    apiClient
      .post(API_ENDPOINTS.SCHEDULE_MEETING, data)
      .then((r) => ({ link: r.data.data.joinUrl, meeting: r.data.data.meeting })),

  invite: (data: { meetingId: string; emails: string[] }) =>
    apiClient.post(API_ENDPOINTS.SEND_INVITE, data).then((r) => r.data.data),

  history: (): Promise<{ items: HistoryItem[] }> =>
    apiClient.get(API_ENDPOINTS.MEETING_HISTORY).then((r) => {
      // Backend returns { meetings: [...], pagination: {...} }
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
