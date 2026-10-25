import { describe, expect, it } from "vitest";
import { formatRundownDuration } from "./RundownPanel";

describe("rundown", () => {
  it("formats planned durations for the operator", () => {
    expect(formatRundownDuration(0)).toBe("0:00");
    expect(formatRundownDuration(305)).toBe("5:05");
  });
});
