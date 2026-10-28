import { describe, expect, it } from "vitest";
import { parseMeetingMessage } from "./MeetingCollaboration";

const encoder = new TextEncoder();

describe("meeting chat identity", () => {
  it("uses the authenticated LiveKit sender instead of packet claims", () => {
    const payload = encoder.encode(JSON.stringify({
      type: "chat",
      id: "message-1",
      senderIdentity: "spoofed-host",
      senderName: "Spoofed Host",
      text: "Willkommen",
      sentAt: 1_000,
    }));
    expect(
      parseMeetingMessage(payload, { identity: "real-user", name: "Lea" }),
    ).toMatchObject({
      senderIdentity: "real-user",
      senderName: "Lea",
      text: "Willkommen",
      isLocal: false,
    });
  });

  it("rejects anonymous, malformed and oversized messages", () => {
    const valid = encoder.encode(JSON.stringify({
      type: "chat",
      id: "message-1",
      text: "Hallo",
      sentAt: 1_000,
    }));
    expect(parseMeetingMessage(valid)).toBeNull();
    expect(parseMeetingMessage(encoder.encode("invalid"), { identity: "user" })).toBeNull();
    expect(
      parseMeetingMessage(
        encoder.encode(JSON.stringify({
          type: "chat",
          id: "message-2",
          text: "x".repeat(2_001),
          sentAt: 1_000,
        })),
        { identity: "user" },
      ),
    ).toBeNull();
  });
});
