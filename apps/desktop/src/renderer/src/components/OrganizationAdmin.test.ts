import { describe, expect, it } from "vitest";
import { deviceFreshness } from "./OrganizationAdmin";

describe("organization device management", () => {
  it("classifies recently seen production devices", () => {
    const now = Date.parse("2026-10-25T20:00:00Z");
    expect(deviceFreshness("2026-10-25T19:58:00Z", now)).toBe("online");
    expect(deviceFreshness("2026-10-25T10:00:00Z", now)).toBe("recent");
    expect(deviceFreshness("2026-10-20T10:00:00Z", now)).toBe("offline");
  });
});
