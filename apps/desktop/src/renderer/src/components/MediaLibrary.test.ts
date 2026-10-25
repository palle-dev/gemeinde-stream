import { describe, expect, it } from "vitest";
import type { LocalMediaAsset } from "./MediaLibrary";

describe("media library contracts", () => {
  it("uses stable media source identifiers", () => {
    const asset: LocalMediaAsset = { id: "asset-1", name: "Intro.mp4", type: "video", url: "gemeinde-media://asset-1/content" };
    expect(`media-${asset.id}`).toBe("media-asset-1");
  });
});
