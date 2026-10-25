import { describe, expect, it } from "vitest";
import { coverCrop, recordingFileName } from "./ProgramRecorder";

describe("program recorder", () => {
  it("center-crops a wide source for a square target", () => {
    expect(coverCrop(1920, 1080, 500, 500)).toEqual({ sx: 420, sy: 0, sw: 1080, sh: 1080 });
  });

  it("center-crops a tall source for a widescreen target", () => {
    expect(coverCrop(1080, 1920, 1920, 1080)).toEqual({ sx: 0, sy: 656.25, sw: 1080, sh: 607.5 });
  });

  it("creates a Windows-safe recording filename", () => {
    expect(recordingFileName('Gottesdienst: "Live"', new Date("2026-10-25T09:30:00.000Z"))).toBe("Gottesdienst- -Live--2026-10-25T09-30-00-000Z.webm");
  });
});
