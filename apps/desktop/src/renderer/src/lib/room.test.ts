import { describe, expect, it, vi } from "vitest";
import { RoomEvent } from "livekit-client";
import { MediaRoom, connectionStatusMessage, mediaConnectionMessage, mediaServerScope } from "./room";

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

describe("connection recovery", () => {
  it("reports interrupted signaling, media reconnection and successful recovery", () => {
    const listener = vi.fn();
    const media = new MediaRoom(listener);
    media.room.emit(RoomEvent.Connected);
    media.room.emit(RoomEvent.SignalReconnecting);
    media.room.emit(RoomEvent.Reconnected);
    media.room.emit(RoomEvent.Reconnecting);
    media.room.emit(RoomEvent.Reconnected);
    media.room.emit(RoomEvent.Disconnected);
    expect(listener.mock.calls.map(([state]) => state)).toEqual([
      "connected", "signal-reconnecting", "connected", "reconnecting", "connected", "disconnected",
    ]);
  });

  it("never shows a stale success message during an outage", () => {
    expect(connectionStatusMessage("reconnecting", "Verbunden")).toContain("unterbrochen");
    expect(connectionStatusMessage("signal-reconnecting", "Verbunden")).toContain("Steuerverbindung");
    expect(connectionStatusMessage("disconnected", "Verbunden")).toContain("getrennt");
    expect(connectionStatusMessage("connected", "Verbunden")).toBe("Verbunden");
  });
});
