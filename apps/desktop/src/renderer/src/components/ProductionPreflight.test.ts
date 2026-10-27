import { describe, expect, it } from "vitest";
import { buildPreflightChecks } from "./ProductionPreflight";

const healthySystem = { ffmpegAvailable: true, freeDiskBytes: 20 * 1024 ** 3, logicalCpuCount: 10, totalMemoryBytes: 32 * 1024 ** 3, platform: "darwin" };

describe("production preflight", () => {
  it("passes all required checks on a ready production system", () => {
    const checks = buildPreflightChecks(healthySystem, { hasProgram: true, hasSources: true, requireFfmpeg: true, online: true, mediaRecorder: true });
    expect(checks.filter((check) => check.required).every((check) => check.state === "pass")).toBe(true);
  });

  it("blocks streaming without program, network, encoder, disk or ffmpeg", () => {
    const checks = buildPreflightChecks({ ...healthySystem, ffmpegAvailable: false, freeDiskBytes: 1024 }, { hasProgram: false, hasSources: false, requireFfmpeg: true, online: false, mediaRecorder: false });
    expect(checks.filter((check) => check.required && check.state === "fail").map((check) => check.id)).toEqual(["program", "sources", "recorder", "network", "ffmpeg", "disk"]);
  });

  it("does not require ffmpeg for local recording", () => {
    const checks = buildPreflightChecks({ ...healthySystem, ffmpegAvailable: false }, { hasProgram: true, hasSources: true, requireFfmpeg: false, online: true, mediaRecorder: true });
    expect(checks.find((check) => check.id === "ffmpeg")?.state).toBe("pass");
  });
});
