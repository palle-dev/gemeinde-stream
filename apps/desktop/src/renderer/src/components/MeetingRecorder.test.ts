import { describe, expect, it } from "vitest";
import { meetingGridSlots } from "./MeetingRecorder";

describe("meeting recorder", () => {
  it("uses the full recording area for one participant", () => {
    expect(meetingGridSlots(1, 1920, 1080, 16)).toEqual([{ x: 16, y: 16, width: 1888, height: 1048 }]);
  });

  it("creates an even two-by-two grid for four participants", () => {
    const slots = meetingGridSlots(4, 1920, 1080, 16);
    expect(slots).toHaveLength(4);
    expect(slots[0]).toEqual({ x: 16, y: 16, width: 936, height: 516 });
    expect(slots[3]).toEqual({ x: 968, y: 548, width: 936, height: 516 });
  });

  it("returns no slots without participants", () => {
    expect(meetingGridSlots(0)).toEqual([]);
  });
});
