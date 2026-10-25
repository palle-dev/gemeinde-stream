import { describe, expect, it } from "vitest";
import { createJoinCode, createLiveKitRoomName } from "./domain";

describe("room identifiers", () => {
  it("creates an easy-to-read eight character join code", () => {
    expect(createJoinCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it("creates a namespaced LiveKit room name", () => {
    expect(createLiveKitRoomName()).toMatch(/^gemeinde-[0-9a-f-]{36}$/);
  });
});
