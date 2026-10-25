import { describe, expect, it } from "vitest";
import { ConnectionQuality } from "livekit-client";
import { formatBitrate, formatSignal, fpsFromRtpStats, signalLevel, type SourceQuality } from "./SourceQualityMonitor";

const quality = (overrides: Partial<SourceQuality> = {}): SourceQuality => ({
  width: 1920,
  height: 1080,
  framesPerSecond: 60,
  bitrateBps: 8_000_000,
  connectionQuality: ConnectionQuality.Excellent,
  ...overrides,
});

describe("source quality monitor", () => {
  it("reads the measured frame rate from a video RTP report", () => {
    expect(fpsFromRtpStats([
      { type: "inbound-rtp", kind: "audio", framesPerSecond: 99 },
      { type: "inbound-rtp", kind: "video", framesPerSecond: 59.94 },
    ])).toBe(59.94);
  });

  it("grades a full HD 60 fps signal as good", () => {
    expect(signalLevel(quality())).toBe("good");
    expect(signalLevel(quality({ framesPerSecond: 30 }))).toBe("warning");
    expect(signalLevel(quality({ connectionQuality: ConnectionQuality.Poor }))).toBe("poor");
  });

  it("formats measured video values for the operator", () => {
    expect(formatSignal(quality())).toBe("1920×1080 · 60 fps");
    expect(formatBitrate(8_250_000)).toBe("8.3 Mbit/s");
    expect(formatBitrate(0)).toBe("Bitrate wird gemessen");
  });
});
