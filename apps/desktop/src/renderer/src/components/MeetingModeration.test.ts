import { describe, expect, it } from "vitest";
import { canModerateRole, participantRole, roleCanModerate, roleLabel, validModerationMessage } from "./MeetingModeration";
import { memberCanModerate, validParticipantIdentity } from "../../../../../../base44/functions/manage-room-member/logic";

describe("meeting moderation roles", () => {
  it.each(["host", "cohost", "operator"])("allows %s to moderate", (role) => {
    expect(roleCanModerate(JSON.stringify({ role }))).toBe(true);
  });
  it.each(["speaker", "participant", "viewer"])("keeps %s read-only", (role) => {
    expect(roleCanModerate(JSON.stringify({ role }))).toBe(false);
  });
  it("falls back safely for malformed metadata", () => {
    expect(participantRole("invalid")).toBe("participant");
    expect(roleLabel(participantRole("invalid"))).toBe("Teilnehmer");
  });
  it("protects hosts and equal-ranked moderators", () => {
    expect(canModerateRole("operator", "host")).toBe(false);
    expect(canModerateRole("cohost", "operator")).toBe(false);
    expect(canModerateRole("host", "cohost")).toBe(true);
    expect(canModerateRole("operator", "participant")).toBe(true);
  });
});

describe("meeting moderation messages", () => {
  const now = 1_800_000_000_000;
  const message = { type: "moderation", id: "12345678-abcd", action: "request_unmute", targetIdentity: "target-1", sentAt: now };

  it("accepts a fresh targeted unmute request", () => {
    expect(validModerationMessage(message, "target-1", now)).toBe(true);
  });
  it("rejects stale, future, malformed and misdirected packets", () => {
    expect(validModerationMessage({ ...message, sentAt: now - 30_001 }, "target-1", now)).toBe(false);
    expect(validModerationMessage({ ...message, sentAt: now + 5_001 }, "target-1", now)).toBe(false);
    expect(validModerationMessage({ ...message, id: "short" }, "target-1", now)).toBe(false);
    expect(validModerationMessage(message, "someone-else", now)).toBe(false);
  });
});

describe("server moderation enforcement", () => {
  it("uses the same strict role hierarchy on the server", () => {
    expect(memberCanModerate("host", "cohost")).toBe(true);
    expect(memberCanModerate("operator", "participant")).toBe(true);
    expect(memberCanModerate("cohost", "operator")).toBe(false);
    expect(memberCanModerate("participant", "viewer")).toBe(false);
    expect(memberCanModerate(undefined, "participant", true)).toBe(true);
  });

  it("rejects missing, oversized and control-character identities", () => {
    expect(validParticipantIdentity("participant-123")).toBe(true);
    expect(validParticipantIdentity("")).toBe(false);
    expect(validParticipantIdentity("x".repeat(201))).toBe(false);
    expect(validParticipantIdentity("bad\nidentity")).toBe(false);
  });
});
