export const attendancePageSize = 500;
export const maximumAttendanceSessions = 100_000;
const attendanceRoles = new Set(["host", "cohost", "operator", "speaker", "participant", "viewer"]);

export function attendanceDuration(joinedAt: string, endedAt: string): number {
  const joined = Date.parse(joinedAt); const ended = Date.parse(endedAt);
  return Number.isFinite(joined) && Number.isFinite(ended) ? Math.max(0, Math.round((ended - joined) / 1000)) : 0;
}

export function validAttendanceId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

export function validAttendanceDisplayName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 80 && !/[\u0000-\u001f\u007f]/.test(value);
}

export function attendanceRecordForReport(session: Record<string, unknown>): Record<string, unknown> | null {
  const joined = typeof session.joined_at === "string" ? Date.parse(session.joined_at) : Number.NaN;
  const lastSeen = typeof session.last_seen_at === "string" ? Date.parse(session.last_seen_at) : Number.NaN;
  const left = typeof session.left_at === "string" ? Date.parse(session.left_at) : undefined;
  const durationSeconds = session.duration_seconds === undefined ? 0 : session.duration_seconds;
  if (!validAttendanceId(session.id) || !validAttendanceId(session.participant_identity) || !validAttendanceDisplayName(session.display_name) || typeof session.user_email !== "string" || session.user_email.length > 254 || !attendanceRoles.has(String(session.role)) || typeof session.guest !== "boolean" || !Number.isFinite(joined) || !Number.isFinite(lastSeen) || lastSeen < joined || (left !== undefined && (!Number.isFinite(left) || left < joined)) || typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 2_678_400) return null;
  return { id: session.id, participantIdentity: session.participant_identity, email: session.user_email.endsWith("@guest.invalid") ? "" : session.user_email, displayName: session.display_name, role: session.role, guest: session.guest, joinedAt: session.joined_at, lastSeenAt: session.last_seen_at, leftAt: typeof session.left_at === "string" ? session.left_at : undefined, durationSeconds };
}
