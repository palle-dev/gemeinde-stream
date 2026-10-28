import { describe, expect, it } from "vitest";
import { participantRole } from "./MeetingModeration";
import { shouldBroadcastRoomEnd } from "./RoomLifecycle";

describe("room lifecycle authority", () => {
  it("recognizes only signed host metadata as host", () => {
    expect(participantRole(JSON.stringify({ role: "host" }))).toBe("host");
    expect(participantRole(JSON.stringify({ role: "operator" }))).not.toBe("host");
    expect(participantRole("invalid")).not.toBe("host");
  });
});

describe("room shutdown coordination", () => {
  it("does not publish into a room that the backend already deleted", () => {
    expect(shouldBroadcastRoomEnd(true)).toBe(false);
  });

  it("keeps the local-server broadcast and older backend responses compatible", () => {
    expect(shouldBroadcastRoomEnd(false)).toBe(true);
    expect(shouldBroadcastRoomEnd(undefined)).toBe(true);
  });
});
