import { describe, expect, it } from "vitest";
import { electBroadcastController, normalizeBroadcastOverlay, roleCanControlProgram } from "./BroadcastCoordination";

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

describe("broadcast master election", () => {
  const candidate = (identity: string, role: string) => ({ identity, name: identity, metadata: JSON.stringify({ role }) });

  it("always elects the host before co-hosts and operators", () => {
    expect(electBroadcastController([candidate("operator", "operator"), candidate("host", "host"), candidate("cohost", "cohost")])?.identity).toBe("host");
  });

  it("uses identity as a stable tie breaker", () => {
    expect(electBroadcastController([candidate("zwei", "operator"), candidate("eins", "operator")])?.identity).toBe("eins");
  });

  it("never elects a participant without control rights", () => {
    expect(electBroadcastController([candidate("gast", "viewer")])).toBeNull();
  });
});
