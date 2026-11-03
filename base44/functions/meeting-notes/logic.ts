export interface MeetingNoteSaveInput {
  content: string;
  expectedRevision: number;
}

export const maximumMeetingNoteVersions = 100;

export function meetingNoteVersionsToDelete<T>(versionsNewestFirst: T[], maximum = maximumMeetingNoteVersions): T[] {
  const boundedMaximum = Math.max(1, Math.floor(maximum));
  return versionsNewestFirst.slice(boundedMaximum);
}

export function normalizeMeetingNoteSave(value: Record<string, unknown>): MeetingNoteSaveInput | null {
  if (typeof value.content !== "string") return null;
  const expectedRevision = Number(value.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return null;
  return { content: value.content.replace(/\r\n/g, "\n").slice(0, 20_000), expectedRevision };
}

export function nextMeetingNoteRevision(currentRevision: number, now = Date.now(), entropy = crypto.getRandomValues(new Uint16Array(1))[0] % 4_096): number {
  const timeRevision = now * 4_096 + Math.max(0, Math.min(4_095, Math.floor(entropy)));
  return Math.max(Math.floor(currentRevision) + 1, timeRevision);
}
