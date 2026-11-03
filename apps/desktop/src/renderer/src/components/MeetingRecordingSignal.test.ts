import { describe, expect, it } from "vitest";
import { parseMeetingRecordingSignal } from "./MeetingRecordingSignal";

const encoder = new TextEncoder();
const payload = (value: unknown) => encoder.encode(JSON.stringify(value));
const moderator = { identity: "host-1", name: "Miriam", metadata: JSON.stringify({ role: "host" }) };

describe("meeting recording signals", () => {
  it("accepts a fresh status from an authorized moderator", () => {
    expect(parseMeetingRecordingSignal(payload({ type: "meeting-recording", active: true, sentAt: 10_000 }), moderator, 10_500)).toMatchObject({
      active: true,
      senderIdentity: "host-1",
      senderName: "Miriam",
    });
  });

  it("rejects recording claims from ordinary participants", () => {
    expect(parseMeetingRecordingSignal(payload({ type: "meeting-recording", active: true, sentAt: 10_000 }), {
      ...moderator,
      metadata: JSON.stringify({ role: "participant" }),
    }, 10_500)).toBeNull();
  });

  it("rejects stale, future and malformed signals", () => {
    expect(parseMeetingRecordingSignal(payload({ type: "meeting-recording", active: true, sentAt: 10_000 }), moderator, 70_001)).toBeNull();
    expect(parseMeetingRecordingSignal(payload({ type: "meeting-recording", active: true, sentAt: 16_000 }), moderator, 10_500)).toBeNull();
    expect(parseMeetingRecordingSignal(payload({ type: "meeting-recording", active: "yes", sentAt: 10_000 }), moderator, 10_500)).toBeNull();
    expect(parseMeetingRecordingSignal(payload("broken"), moderator, 10_500)).toBeNull();
  });
});
