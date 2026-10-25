import { describe, expect, it } from "vitest";
import { fallbackDeviceLabel } from "./DeviceSettings";

describe("device settings", () => {
  it("provides understandable labels for devices without driver names", () => {
    expect(fallbackDeviceLabel("audioinput", 0)).toBe("Mikrofon 1");
    expect(fallbackDeviceLabel("videoinput", 1)).toBe("Kamera 2");
    expect(fallbackDeviceLabel("audiooutput", 2)).toBe("Lautsprecher 3");
  });
});
