import { describe, expect, it } from "vitest";
import { roleCanControlProgram } from "./BroadcastCoordination";

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
