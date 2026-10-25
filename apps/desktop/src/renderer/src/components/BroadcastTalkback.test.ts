import { describe, expect, it } from "vitest";
import { parseTalkbackMessage } from "./BroadcastTalkback";

describe("broadcast talkback", () => {
  it("accepts only valid talkback state messages", () => {
    const encoder = new TextEncoder();
    expect(parseTalkbackMessage(encoder.encode('{"active":true}'))).toEqual({ active: true });
    expect(parseTalkbackMessage(encoder.encode('{"active":"yes"}'))).toBeNull();
    expect(parseTalkbackMessage(encoder.encode("invalid"))).toBeNull();
  });
});
