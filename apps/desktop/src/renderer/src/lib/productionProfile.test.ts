import { describe, expect, it } from "vitest";
import {
  productionProfile,
  recommendProductionProfile,
} from "./productionProfile";

describe("production profiles", () => {
  it("uses 1080p30 as the safe default", () =>
    expect(productionProfile("unknown").id).toBe("standard"));
  it("recommends 1080p60 only for strong systems", () =>
    expect(recommendProductionProfile(12, 32 * 1024 ** 3)).toBe("quality"));
  it("falls back to 720p30 for constrained systems", () =>
    expect(recommendProductionProfile(4, 8 * 1024 ** 3)).toBe("efficient"));
});
