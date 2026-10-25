import { describe, expect, it } from "vitest";
import { defaultStartTime, toDateTimeInput, toIsoDateTime } from "./EventScheduling";

describe("event scheduling", () => {
  it("rounds a default start to the next quarter hour after one hour", () => {
    expect(defaultStartTime(new Date(2026, 0, 1, 9, 7))).toBe("2026-01-01T10:15");
  });

  it("round-trips a local date-time value", () => {
    const input = "2026-10-25T10:30";
    expect(toDateTimeInput(toIsoDateTime(input))).toBe(input);
  });

  it("rejects malformed dates", () => {
    expect(() => toIsoDateTime("not-a-date")).toThrow("gültige Startzeit");
  });
});
