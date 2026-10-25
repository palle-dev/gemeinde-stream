import { describe, expect, it } from "vitest";
import { canModerateRole, participantRole, roleCanModerate, roleLabel } from "./MeetingModeration";

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
