import { describe, expect, it } from "vitest";
import { audioMeterPercent, normalizedVolume } from "./BroadcastAudioMixer";

describe("broadcast audio mixer", () => {
  it("clamps volume to the supported range", () => {
    expect(normalizedVolume(-0.2)).toBe(0);
    expect(normalizedVolume(0.65)).toBe(0.65);
    expect(normalizedVolume(1.4)).toBe(1);
    expect(normalizedVolume(Number.NaN)).toBe(0);
  });

  it("turns LiveKit audio levels into a readable meter", () => {
    expect(audioMeterPercent(0)).toBe(0);
    expect(audioMeterPercent(0.25)).toBe(50);
    expect(audioMeterPercent(1)).toBe(100);
  });
});
