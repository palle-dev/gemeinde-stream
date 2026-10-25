import { describe, expect, it } from "vitest";
import { participantRole } from "./MeetingModeration";

describe("room lifecycle authority", () => {
  it("recognizes only signed host metadata as host", () => {
    expect(participantRole(JSON.stringify({ role: "host" }))).toBe("host");
    expect(participantRole(JSON.stringify({ role: "operator" }))).not.toBe("host");
    expect(participantRole("invalid")).not.toBe("host");
  });
});
