import { describe, expect, it } from "vitest";
import { mediaConnectionMessage, mediaServerScope } from "./room";

describe("media server diagnostics", () => {
  it("distinguishes local, private and public media servers", () => {
    expect(mediaServerScope("ws://localhost:7880")).toBe("local");
    expect(mediaServerScope("ws://192.168.1.20:7880")).toBe("private");
    expect(mediaServerScope("wss://video.gemeinde.de")).toBe("public-secure");
    expect(mediaServerScope("ws://video.gemeinde.de")).toBe("public-insecure");
    expect(mediaServerScope("not a url")).toBe("invalid");
  });

  it("turns local connection failures into actionable guidance", () => {
    const message = mediaConnectionMessage(new Error("connection refused"), "ws://localhost:7880");
    expect(message).toContain("LiveKit auf diesem PC");
    expect(message).toContain("connection refused");
  });

  it("rejects an unencrypted public signaling address", () => {
    expect(mediaConnectionMessage(new Error("failed"), "ws://video.gemeinde.de"))
      .toContain("verschlüsselte WSS-Verbindung");
  });
});
