import { describe, expect, it } from "vitest";
import { isRtmpUrl } from "./ProgramStreamer";

describe("program streamer", () => {
  it("accepts RTMP and encrypted RTMPS ingest addresses", () => {
    expect(isRtmpUrl("rtmp://localhost/live")).toBe(true);
    expect(isRtmpUrl("rtmps://example.test/app")).toBe(true);
  });

  it("rejects web pages and malformed addresses", () => {
    expect(isRtmpUrl("https://example.test/live")).toBe(false);
    expect(isRtmpUrl("not a URL")).toBe(false);
  });
});
