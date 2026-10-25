import { describe, expect, it } from "vitest";
import { broadcastTallyState } from "./BroadcastTally";

describe("broadcast tally", () => {
  it("marks a participant as on air when camera or screen is in program", () => {
    expect(broadcastTallyState(["camera-1-camera"], "camera-1")).toBe("on-air");
    expect(broadcastTallyState(["camera-1-screen"], "camera-1")).toBe("on-air");
  });

  it("keeps unrelated source clients on standby", () => {
    expect(broadcastTallyState(["camera-2-camera", "media-intro"], "camera-1")).toBe("standby");
  });
});
