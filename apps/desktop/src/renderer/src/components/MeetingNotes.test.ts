import { describe, expect, it } from "vitest";
import { meetingNotesDocument, meetingNotesRetryDelayMs, parseMeetingNoteSignal, remoteMeetingNoteAction, safeMeetingNote, safeMeetingNoteDraft, safeMeetingNoteHistory, type MeetingNote } from "./MeetingNotes";
import { maximumMeetingNoteVersions, meetingNoteVersionsToDelete, nextMeetingNoteRevision, normalizeMeetingNoteSave } from "../../../../../../base44/functions/meeting-notes/logic";

describe("meeting notes", () => {
  it("creates a portable markdown document with provenance", () => {
    const document = meetingNotesDocument("Teamtreffen", { content: "- [ ] Aufgabe", revision: 2, updatedBy: "Anna", updatedAt: "2026-10-25T10:00:00.000Z" });
    expect(document).toContain("# Teamtreffen");
    expect(document).toContain("- [ ] Aufgabe");
    expect(document).toContain("Anna");
  });

  it("backs transient save retries off to a bounded interval", () => {
    expect([1, 2, 3, 4, 8].map(meetingNotesRetryDelayMs)).toEqual([2_000, 5_000, 10_000, 30_000, 30_000]);
  });

  it("preserves a dirty draft when the server has a different revision", () => {
    const local: MeetingNote = { content: "Lokaler Entwurf", revision: 10, updatedBy: "Anna", updatedAt: "" };
    expect(remoteMeetingNoteAction(local, { ...local, content: "Serverfassung", revision: 11 }, true, true)).toBe("conflict");
    expect(remoteMeetingNoteAction(local, { ...local, content: "Lokaler Entwurf", revision: 11 }, true, true)).toBe("replace");
    expect(remoteMeetingNoteAction(local, { ...local, content: "Serverfassung" }, true, true)).toBe("ignore");
  });

  it("rejects malformed server notes and preserves valid unsaved drafts", () => {
    expect(safeMeetingNote({ content: "Beschluss", revision: 12, updatedBy: "Anna", updatedAt: "2026-10-25T10:00:00.000Z" })).toMatchObject({ content: "Beschluss", revision: 12 });
    expect(() => safeMeetingNote({ content: "Manipuliert", revision: 0, updatedBy: "", updatedAt: "" })).toThrow();
    expect(() => safeMeetingNote({ content: "Text", revision: 12, updatedBy: "Anna\nHost", updatedAt: "2026-10-25T10:00:00.000Z" })).toThrow();
    expect(safeMeetingNoteDraft({ content: "Noch nicht gespeichert", revision: 0, updatedBy: "", updatedAt: "" })).toMatchObject({ content: "Noch nicht gespeichert", revision: 0 });
    expect(safeMeetingNoteDraft({ content: "Text", revision: -1, updatedBy: "", updatedAt: "" })).toBeNull();
  });

  it("accepts only fresh and well-formed note refresh signals", () => {
    const now = Date.parse("2026-10-25T10:00:00.000Z");
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    expect(parseMeetingNoteSignal(encode({ type: "refresh", id: "12345678-abcd", revision: 17, sentAt: now }), now)).toMatchObject({ revision: 17 });
    expect(parseMeetingNoteSignal(encode({ type: "refresh", id: "too-short", revision: 0, sentAt: now }), now)).toBeNull();
    expect(parseMeetingNoteSignal(encode({ type: "refresh", id: "12345678-abcd", revision: 17, sentAt: now - 60_001 }), now)).toBeNull();
    expect(parseMeetingNoteSignal(new Uint8Array([255]), now)).toBeNull();
  });

  it("strictly validates saves and creates unique monotonic revisions", () => {
    expect(normalizeMeetingNoteSave({ content: "Zeile 1\r\nZeile 2", expectedRevision: 7 })).toEqual({ content: "Zeile 1\nZeile 2", expectedRevision: 7 });
    expect(normalizeMeetingNoteSave({ content: { text: "ungültig" }, expectedRevision: 0 })).toBeNull();
    expect(normalizeMeetingNoteSave({ content: "Text", expectedRevision: -1 })).toBeNull();
    expect(nextMeetingNoteRevision(5, 1_000, 12)).toBe(4_096_012);
    expect(nextMeetingNoteRevision(5_000_000, 1_000, 12)).toBe(5_000_001);
  });

  it("retains a bounded append-only recovery history", () => {
    const versions = Array.from({ length: maximumMeetingNoteVersions + 3 }, (_value, index) => ({ revision: maximumMeetingNoteVersions + 3 - index }));
    expect(meetingNoteVersionsToDelete(versions).map((version) => version.revision)).toEqual([3, 2, 1]);
    expect(meetingNoteVersionsToDelete(versions, 0)).toHaveLength(versions.length - 1);
  });

  it("accepts only newest-first note histories", () => {
    const version = (revision: number) => ({ content: `Stand ${revision}`, revision, updatedBy: "Anna", updatedAt: new Date(1_000 + revision).toISOString() });
    expect(safeMeetingNoteHistory([version(3), version(2), version(1)])).toHaveLength(3);
    expect(() => safeMeetingNoteHistory([version(2), version(3)])).toThrow("Notizhistorie");
    expect(() => safeMeetingNoteHistory(Array.from({ length: 21 }, (_value, index) => version(21 - index)))).toThrow("Notizhistorie");
  });
});
