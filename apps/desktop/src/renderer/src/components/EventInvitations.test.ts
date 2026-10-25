import { describe, expect, it } from "vitest";
import { invitationText } from "./EventInvitations";

describe("event invitations", () => {
  it("creates a shareable invitation containing title and room code", () => {
    const text = invitationText({ id: "1", title: "Gottesdienst", mode: "broadcast", status: "scheduled", host_email: "host@example.de", join_code: "ABC23456", livekit_room_name: "room" });
    expect(text).toContain("Einladung: Gottesdienst");
    expect(text).toContain("Raumcode: ABC23456");
  });
});
