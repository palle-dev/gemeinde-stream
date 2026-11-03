import { describe, expect, it } from "vitest";
import { formatMeetingFileSize, meetingFileValidation, parseMeetingFileSignal, safeMeetingFileRecords } from "./MeetingFiles";
import { meetingFileAuthorizationMatches, meetingFileStorageReference, normalizeMeetingFileMetadata, sameMeetingFileRegistration, validPrivateFileUri, validPublicFileUrl } from "../../../../../../base44/functions/meeting-files/logic";

describe("meeting file sharing", () => {
  it("accepts office documents within the size limit", () => { expect(meetingFileValidation({ name: "Ablaufplan.pdf", size: 2_000_000 })).toBeNull(); });
  it("rejects executable and oversized files", () => { expect(meetingFileValidation({ name: "setup.exe", size: 100 })).toContain("Dateityp"); expect(meetingFileValidation({ name: "video.pdf", size: 26 * 1024 * 1024 })).toContain("25 MB"); });
  it("rejects unsafe names and mismatched MIME types", () => { expect(meetingFileValidation({ name: "../plan.pdf", size: 100 })).toContain("Dateiname"); expect(normalizeMeetingFileMetadata({ id: "file-id-123", name: "plan.pdf", mimeType: "text/html", sizeBytes: 100 })).toBeNull(); expect(normalizeMeetingFileMetadata({ id: "file-id-123", name: "plan.pdf", mimeType: "application/pdf", sizeBytes: 100 })).not.toBeNull(); });
  it("formats file sizes for the meeting UI", () => { expect(formatMeetingFileSize(2 * 1024 * 1024)).toBe("2.0 MB"); });
  it("accepts only bounded private storage references", () => {
    expect(validPrivateFileUri("private/user-1/document.pdf")).toBe("private/user-1/document.pdf");
    expect(validPrivateFileUri("https://public.example/document.pdf")).toBeNull();
    expect(validPrivateFileUri("private/../other/document.pdf")).toBeNull();
    expect(meetingFileStorageReference("private", "private/user-1/document.pdf", "https://public.example/document.pdf")).toEqual({ file_uri: "private/user-1/document.pdf" });
    expect(meetingFileStorageReference("private", "", "https://public.example/document.pdf")).toBeNull();
    expect(meetingFileStorageReference(undefined, "", "https://legacy.example/document.pdf")).toEqual({ file_url: "https://legacy.example/document.pdf" });
    expect(validPublicFileUrl("https://files.example/document.pdf")).toBe("https://files.example/document.pdf");
    expect(validPublicFileUrl("https://user:secret@files.example/document.pdf")).toBeNull();
    expect(validPublicFileUrl("javascript:alert(1)")).toBeNull();
  });
  it("treats registration retries as idempotent only for the exact same private file", () => {
    const metadata = { id: "file-id-123", name: "Ablaufplan.pdf", mimeType: "application/pdf", sizeBytes: 42 };
    const stored = { name: metadata.name, mime_type: metadata.mimeType, size_bytes: 42, uploaded_by: "person@example.de", file_uri: "private/a.pdf" };
    expect(sameMeetingFileRegistration(stored, metadata, { file_uri: "private/a.pdf" }, "person@example.de")).toBe(true);
    expect(sameMeetingFileRegistration(stored, metadata, { file_uri: "private/b.pdf" }, "person@example.de")).toBe(false);
  });
  it("keeps only safe downloadable records from a server response", () => {
    const valid = { id: "file-id-123", name: "Plan.pdf", url: "https://files.example/plan.pdf", mimeType: "application/pdf", sizeBytes: 42, uploadedBy: "Anna", uploadedAt: "2026-10-26T10:00:00.000Z", canDelete: true };
    expect(safeMeetingFileRecords([valid, { ...valid }, { ...valid, id: "bad", url: "javascript:alert(1)" }])).toEqual([valid]);
    expect(safeMeetingFileRecords([{ ...valid, url: "https://user:secret@files.example/plan.pdf" }])).toEqual([]);
    expect(safeMeetingFileRecords([{ ...valid, name: "../Plan.pdf" }])).toEqual([]);
  });
  it("accepts only fresh, bounded refresh signals", () => {
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    expect(parseMeetingFileSignal(encode({ type: "refresh", id: "file-id-123", sentAt: 1_000 }), 1_000)).toEqual({ type: "refresh", id: "file-id-123", sentAt: 1_000 });
    expect(parseMeetingFileSignal(encode({ type: "refresh", id: "bad", sentAt: 1_000 }), 1_000)).toBeNull();
    expect(parseMeetingFileSignal(encode({ type: "refresh", id: "file-id-123", sentAt: 1_000 }), 70_001)).toBeNull();
  });
  it("binds upload permission to the exact user, meeting and file metadata", () => {
    const metadata = normalizeMeetingFileMetadata({ id: "file-id-123", name: "Ablaufplan.pdf", mimeType: "application/pdf", sizeBytes: 42 });
    expect(metadata).not.toBeNull();
    const authorization = { ...metadata!, eventId: "event-1", userEmail: "person@example.de", expiresAt: 2_000, storageMode: "private" as const };
    expect(meetingFileAuthorizationMatches(authorization, metadata!, "event-1", "person@example.de", 1_000)).toBe(true);
    expect(meetingFileAuthorizationMatches(authorization, { ...metadata!, sizeBytes: 43 }, "event-1", "person@example.de", 1_000)).toBe(false);
    expect(meetingFileAuthorizationMatches(authorization, metadata!, "event-2", "person@example.de", 1_000)).toBe(false);
    expect(meetingFileAuthorizationMatches(authorization, metadata!, "event-1", "other@example.de", 1_000)).toBe(false);
    expect(meetingFileAuthorizationMatches(authorization, metadata!, "event-1", "person@example.de", 2_000)).toBe(false);
    expect(meetingFileAuthorizationMatches({ ...authorization, storageMode: undefined }, metadata!, "event-1", "person@example.de", 1_000)).toBe(false);
  });
});
