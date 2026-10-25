import { describe, expect, it } from "vitest";
import { isAssignableRole } from "./RoomRoleManagement";

describe("assignable room roles", () => {
  it.each(["cohost", "operator", "speaker", "participant", "viewer"])("accepts %s", (role) => {
    expect(isAssignableRole(role)).toBe(true);
  });

  it("never allows assigning the host role", () => {
    expect(isAssignableRole("host")).toBe(false);
    expect(isAssignableRole("administrator")).toBe(false);
  });
});
