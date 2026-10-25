import { describe, expect, it } from "vitest";
import { mediaTypeFromPath, publicMediaAsset } from "./mediaLibrary";

describe("media library", () => {
  it("recognizes supported production media", () => {
    expect(mediaTypeFromPath("intro.MP4")).toBe("video");
    expect(mediaTypeFromPath("folie.png")).toBe("image");
    expect(mediaTypeFromPath("lied.mp3")).toBe("audio");
    expect(mediaTypeFromPath("notizen.pdf")).toBeNull();
  });

  it("does not expose the local file path to the renderer", () => {
    expect(publicMediaAsset({ id: "abc", name: "Intro", path: "C:/secret/intro.mp4", type: "video" }))
      .toEqual({ id: "abc", name: "Intro", type: "video", url: "gemeinde-media://abc/content" });
  });
});
