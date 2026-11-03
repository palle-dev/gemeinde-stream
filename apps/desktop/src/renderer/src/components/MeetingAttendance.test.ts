import { describe, expect, it } from "vitest";
import { aggregateAttendance, attendanceCsv, safeAttendanceReport, type AttendanceSession } from "./MeetingAttendance";
import { attendanceDuration, attendanceRecordForReport, validAttendanceDisplayName } from "../../../../../../base44/functions/meeting-attendance/logic";

describe("meeting attendance", () => {
  const sessions: AttendanceSession[] = [
    { id: "1", participantIdentity: "a", displayName: "Anna; Beispiel", email: "anna@example.de", role: "participant", guest: false, joinedAt: "2026-10-25T10:00:00.000Z", lastSeenAt: "2026-10-25T10:10:00.000Z", leftAt: "2026-10-25T10:10:00.000Z", durationSeconds: 600 },
    { id: "2", participantIdentity: "a", displayName: "Anna; Beispiel", email: "anna@example.de", role: "participant", guest: false, joinedAt: "2026-10-25T10:15:00.000Z", lastSeenAt: "2026-10-25T10:20:00.000Z", leftAt: "2026-10-25T10:20:00.000Z", durationSeconds: 300 },
  ];

  it("aggregates repeated joins for one person", () => {
    expect(aggregateAttendance(sessions)).toMatchObject([{ participantIdentity: "a", durationSeconds: 900, visits: 2, currentlyPresent: false }]);
  });

  it("creates an Excel-friendly semicolon CSV", () => {
    const csv = attendanceCsv(aggregateAttendance(sessions));
    expect(csv.startsWith("\uFEFFName;E-Mail")).toBe(true);
    expect(csv).toContain('"Anna; Beispiel"');
    expect(csv).toContain(";15;2;Nein");
  });

  it("neutralizes spreadsheet formulas in exported participant fields", () => {
    const csv = attendanceCsv([{ ...aggregateAttendance(sessions)[0], displayName: "=HYPERLINK(\"https://example.invalid\")", email: "+1@example.invalid" }]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+1@example.invalid");
  });

  it("filters malformed server sessions and reports them", () => {
    const result = safeAttendanceReport({ sessions: [sessions[0], { ...sessions[0], id: "bad", lastSeenAt: "not-a-date" }], truncated: false, invalidRecords: 2 });
    expect(result.sessions).toHaveLength(1);
    expect(result.invalidRecords).toBe(3);
  });

  it("rejects oversized reports and invalid participant names", () => {
    expect(() => safeAttendanceReport({ sessions: new Array(100_001) })).toThrow("kein gültiges Anwesenheitsprotokoll");
    expect(validAttendanceDisplayName("Name\u0000")).toBe(false);
    expect(attendanceDuration("invalid", "2026-10-25T10:00:00.000Z")).toBe(0);
  });

  it("removes internal guest addresses from a normalized backend report", () => {
    expect(attendanceRecordForReport({ id: "one", participant_identity: "guest-one", user_email: "guest+one@guest.invalid", display_name: "Gast", role: "participant", guest: true, joined_at: "2026-10-25T10:00:00.000Z", last_seen_at: "2026-10-25T10:01:00.000Z", duration_seconds: 60 })).toMatchObject({ email: "", durationSeconds: 60 });
    expect(attendanceRecordForReport({ id: "bad", participant_identity: "one", user_email: "a@example.de", display_name: "Anna", role: "participant", guest: false, joined_at: "invalid", last_seen_at: "2026-10-25T10:01:00.000Z" })).toBeNull();
  });
});
