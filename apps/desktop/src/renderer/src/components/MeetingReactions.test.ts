import { describe, expect, it } from "vitest";
import { parseMeetingReaction } from "./MeetingReactions";

const encoder = new TextEncoder();

describe("meeting reactions", () => {
  it("accepts an allowed reaction and trusts the LiveKit sender", () => {
    const payload = encoder.encode(JSON.stringify({
      type: "reaction",
      id: "reaction-1",
      emoji: "👏",
      sentAt: 1_000,
      senderIdentity: "spoofed",
    }));
    expect(parseMeetingReaction(payload, { identity: "real-user", name: "Lea" }, 2_000)).toMatchObject({
      id: "reaction-1",
      emoji: "👏",
      senderIdentity: "real-user",
      senderName: "Lea",
      expiresAt: 6_000,
    });
  });

  it("rejects malformed, unsupported, and anonymous reactions", () => {
    expect(parseMeetingReaction(encoder.encode("invalid"), { identity: "user" })).toBeNull();
    expect(parseMeetingReaction(encoder.encode(JSON.stringify({ type: "reaction", id: "1", emoji: "💣", sentAt: 1 })), { identity: "user" })).toBeNull();
    expect(parseMeetingReaction(encoder.encode(JSON.stringify({ type: "reaction", id: "1", emoji: "👍", sentAt: 1 })))).toBeNull();
  });
});
