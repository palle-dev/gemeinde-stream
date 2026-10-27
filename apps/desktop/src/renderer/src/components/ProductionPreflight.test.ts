import { describe, expect, it } from "vitest";
import { buildPreflightChecks, preflightIsReady } from "./ProductionPreflight";

const healthySystem = { ffmpegAvailable: true, freeDiskBytes: 20 * 1024 ** 3, logicalCpuCount: 10, totalMemoryBytes: 32 * 1024 ** 3, platform: "darwin" };

describe("production preflight", () => {
  it("passes all required checks on a ready production system", () => {
    const checks = buildPreflightChecks(healthySystem, { hasProgram: true, hasSources: true, roomConnected: true, requireFfmpeg: true, requireNetwork: true, online: true, mediaRecorder: true });
    expect(checks.filter((check) => check.required).every((check) => check.state === "pass")).toBe(true);
    expect(preflightIsReady(checks)).toBe(true);
  });

  it("blocks streaming without program, media room, network, encoder, disk or ffmpeg", () => {
    const checks = buildPreflightChecks({ ...healthySystem, ffmpegAvailable: false, freeDiskBytes: 1024 }, { hasProgram: false, hasSources: false, roomConnected: false, requireFfmpeg: true, requireNetwork: true, online: false, mediaRecorder: false });
    expect(checks.filter((check) => check.required && check.state === "fail").map((check) => check.id)).toEqual(["program", "sources", "recorder", "room", "network", "ffmpeg", "disk"]);
    expect(preflightIsReady(checks)).toBe(false);
  });

  it("does not require internet or ffmpeg for local recording", () => {
    const checks = buildPreflightChecks({ ...healthySystem, ffmpegAvailable: false }, { hasProgram: true, hasSources: true, roomConnected: true, requireFfmpeg: false, requireNetwork: false, online: false, mediaRecorder: true });
    expect(checks.find((check) => check.id === "ffmpeg")?.state).toBe("pass");
    expect(checks.find((check) => check.id === "network")?.required).toBe(false);
    expect(preflightIsReady(checks)).toBe(true);
  });

  it("waits for required system checks instead of treating warnings as ready", () => {
    const checks = buildPreflightChecks(null, { hasProgram: true, hasSources: true, roomConnected: true, requireFfmpeg: true, requireNetwork: true, online: true, mediaRecorder: true });
    expect(checks.find((check) => check.id === "ffmpeg")?.state).toBe("warning");
    expect(preflightIsReady(checks)).toBe(false);
  });
});
