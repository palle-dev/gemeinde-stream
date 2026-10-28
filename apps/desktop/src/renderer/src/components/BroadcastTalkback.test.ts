import { describe, expect, it } from "vitest";
import {
  canSendTalkback,
  parseTalkbackMessage,
  talkbackSubscriptionPermissions,
} from "./BroadcastTalkback";

describe("broadcast talkback", () => {
  it("accepts only valid talkback state messages", () => {
    const encoder = new TextEncoder();
    expect(parseTalkbackMessage(encoder.encode('{"active":true}'))).toEqual({ active: true });
    expect(parseTalkbackMessage(encoder.encode('{"active":"yes"}'))).toBeNull();
    expect(parseTalkbackMessage(encoder.encode("invalid"))).toBeNull();
  });

  it("accepts talkback audio only from signed control roles", () => {
    expect(canSendTalkback({ metadata: JSON.stringify({ role: "host" }) })).toBe(true);
    expect(canSendTalkback({ metadata: JSON.stringify({ role: "operator" }) })).toBe(true);
    expect(canSendTalkback({ metadata: JSON.stringify({ role: "speaker" }) })).toBe(false);
    expect(canSendTalkback({ metadata: "invalid" })).toBe(false);
    expect(canSendTalkback()).toBe(false);
  });

  it("exposes the private track only to its selected destination", () => {
    expect(
      talkbackSubscriptionPermissions(
        "speaker",
        ["speaker", "viewer", "viewer"],
        ["camera-sid", "microphone-sid"],
      ),
    ).toEqual([
      { participantIdentity: "speaker", allowAll: true },
      {
        participantIdentity: "viewer",
        allowedTrackSids: ["camera-sid", "microphone-sid"],
      },
    ]);
  });
});
