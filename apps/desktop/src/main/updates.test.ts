import { describe, expect, it } from "vitest";
import {
  isNewerVersion,
  normalizeVersion,
  trustedReleaseUrl,
} from "./updates";

describe("release updates", () => {
  it("normalizes stable semantic versions", () => {
    expect(normalizeVersion("v0.3.0")).toBe("0.3.0");
    expect(normalizeVersion("0.10.2")).toBe("0.10.2");
    expect(normalizeVersion("v0.3.0-beta")).toBeNull();
  });

  it("compares all semantic version components numerically", () => {
    expect(isNewerVersion("0.3.1", "0.3.0")).toBe(true);
    expect(isNewerVersion("0.10.0", "0.9.9")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.99.99")).toBe(true);
    expect(isNewerVersion("0.3.0", "0.3.0")).toBe(false);
    expect(isNewerVersion("0.2.9", "0.3.0")).toBe(false);
  });

  it("only trusts the official release path", () => {
    expect(
      trustedReleaseUrl(
        "https://github.com/palle-dev/gemeinde-stream/releases/tag/v0.3.0",
      ),
    ).toBe(true);
    expect(
      trustedReleaseUrl("https://github.com/other/repository/releases/latest"),
    ).toBe(false);
    expect(
      trustedReleaseUrl(
        "https://github.com.evil.test/palle-dev/gemeinde-stream/releases/latest",
      ),
    ).toBe(false);
  });
});
