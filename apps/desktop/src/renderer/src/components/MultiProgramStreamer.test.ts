import { describe, expect, it } from "vitest";
import { isStreamingUrl, profilesForStorage, type StreamProfile } from "./MultiProgramStreamer";

describe("multi destination streaming", () => {
  it("accepts RTMP ingest addresses only", () => { expect(isStreamingUrl("rtmp://localhost/live")).toBe(true); expect(isStreamingUrl("rtmps://example.test/app")).toBe(true); expect(isStreamingUrl("https://example.test")).toBe(false); });
  it("never persists secret stream keys", () => { const profiles: StreamProfile[] = [{ id: "1", label: "YouTube", platform: "youtube", serverUrl: "rtmps://example.test/live", streamKey: "secret", enabled: true }]; const stored = profilesForStorage(profiles); expect(stored).toEqual([{ id: "1", label: "YouTube", platform: "youtube", serverUrl: "rtmps://example.test/live", enabled: true }]); expect(JSON.stringify(stored)).not.toContain("secret"); });
});
