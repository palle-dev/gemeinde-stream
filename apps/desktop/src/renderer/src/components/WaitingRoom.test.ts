import { describe, expect, it } from "vitest";
import { admissionState } from "./WaitingRoom";
import type { MembershipRecord } from "../domain";

function member(status: MembershipRecord["status"]): MembershipRecord {
  return { id: "member-1", event_id: "event-1", event_title: "Test", event_mode: "meeting", user_email: "gast@example.org", display_name: "Gast", role: "participant", status };
}

describe("waiting room", () => {
  it("recognizes waiting, admitted and rejected memberships", () => {
    expect(admissionState([member("waiting")], "GAST@example.org")).toBe("waiting");
    expect(admissionState([member("joined")], "gast@example.org")).toBe("admitted");
    expect(admissionState([member("blocked")], "gast@example.org")).toBe("rejected");
  });

  it("keeps unknown users outside", () => {
    expect(admissionState([], "gast@example.org")).toBe("unknown");
  });
});
