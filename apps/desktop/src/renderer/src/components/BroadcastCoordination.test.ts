import { describe, expect, it } from "vitest";
import { normalizeBroadcastOverlay, roleCanControlProgram } from "./BroadcastCoordination";

describe("broadcast program permissions", () => {
  it.each(["host", "cohost", "operator"])("allows the %s role to control the program", (role) => {
    expect(roleCanControlProgram(JSON.stringify({ role }))).toBe(true);
  });

  it.each(["speaker", "participant", "viewer"])("keeps the %s role read-only", (role) => {
    expect(roleCanControlProgram(JSON.stringify({ role }))).toBe(false);
  });

  it("rejects missing or malformed participant metadata", () => {
    expect(roleCanControlProgram()).toBe(false);
    expect(roleCanControlProgram("not-json")).toBe(false);
  });
});

describe("broadcast overlays", () => {
  it("normalizes a lower third before it is sent to the program", () => {
    expect(normalizeBroadcastOverlay("  Pfarrer   Müller ", " Predigt ")).toEqual({ title: "Pfarrer Müller", subtitle: "Predigt" });
  });

  it("uses an empty title to remove the overlay", () => {
    expect(normalizeBroadcastOverlay("  ", "wird ignoriert")).toBeNull();
  });
});
