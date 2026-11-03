import { describe, expect, it } from "vitest";
import { distributeParticipants, parseBreakoutWire, safeBreakoutCredentials, safeBreakoutStatus } from "./BreakoutRooms";
import { eligibleBreakoutIdentities, normalizeBreakoutAssignments } from "../../../../../../base44/functions/breakout-room/logic";

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe("breakout rooms", () => {
  it("distributes remote participants evenly and excludes the local moderator", () => {
    const assignments = distributeParticipants([
      { identity: "host", name: "Host", isLocal: true },
      { identity: "a", name: "A", isLocal: false },
      { identity: "b", name: "B", isLocal: false },
      { identity: "c", name: "C", isLocal: false },
    ], 2);
    expect(assignments).toEqual({ a: "room-1", b: "room-2", c: "room-1" });
  });

  it("accepts only known coordination messages", () => {
    const sentAt = Date.now();
    expect(parseBreakoutWire(encode({ type: "refresh", id: "12345678-abcd", sentAt }))).toEqual({ type: "refresh", id: "12345678-abcd", sentAt });
    expect(parseBreakoutWire(encode({ type: "refresh", id: "12345678-abcd", sentAt: sentAt - 60_001 }))).toBeNull();
    expect(parseBreakoutWire(encode({ type: "token", participantToken: "secret" }))).toBeNull();
  });

  it("validates status and keeps access tokens out of coordination messages", () => {
    expect(safeBreakoutStatus({ assignment: { breakoutId: "room-1", breakoutName: "Gebet", active: true }, activeCount: 4 })).toEqual({ assignment: { breakoutId: "room-1", breakoutName: "Gebet", active: true }, activeCount: 4 });
    expect(() => safeBreakoutStatus({ assignment: { breakoutId: "../room", breakoutName: "Gebet", active: true } })).toThrow();
    expect(() => safeBreakoutStatus({ assignment: null, activeCount: 501 })).toThrow();
    const token = `${"a".repeat(20)}.${"b".repeat(20)}.${"c".repeat(20)}`;
    expect(safeBreakoutCredentials({ breakoutId: "room-1", breakoutName: "Gebet", active: true, serverUrl: "ws://127.0.0.1:7880", participantToken: token })).toMatchObject({ breakoutId: "room-1", participantToken: token });
    expect(() => safeBreakoutCredentials({ breakoutId: "room-1", breakoutName: "Gebet", active: true, serverUrl: "https://example.org", participantToken: token })).toThrow();
  });

  it("allows only admitted non-moderators to be assigned", () => {
    expect([...eligibleBreakoutIdentities([
      { participant_identity: "participant-a", role: "participant", status: "joined" },
      { participant_identity: "speaker-a", role: "speaker", status: "joined" },
      { participant_identity: "operator-a", role: "operator", status: "joined" },
      { participant_identity: "waiting-a", role: "participant", status: "waiting" },
      { participant_identity: "participant-a", role: "participant", status: "joined" },
    ])]).toEqual(["participant-a", "speaker-a"]);
  });

  it("validates unique, consistent server-side assignments", () => {
    const known = new Set(["participant-a", "participant-b"]);
    expect(normalizeBreakoutAssignments([
      { participantIdentity: "participant-a", breakoutId: "room-1", breakoutName: "Gebet" },
      { participantIdentity: "participant-b", breakoutId: "room-1", breakoutName: "Gebet" },
    ], known)).toHaveLength(2);
    expect(normalizeBreakoutAssignments([
      { participantIdentity: "participant-a", breakoutId: "room-1", breakoutName: "Gebet" },
      { participantIdentity: "participant-a", breakoutId: "room-2", breakoutName: "Austausch" },
    ], known)).toBeNull();
    expect(normalizeBreakoutAssignments([
      { participantIdentity: "participant-a", breakoutId: "room-1", breakoutName: "Gebet" },
      { participantIdentity: "participant-b", breakoutId: "room-1", breakoutName: "Anderer Name" },
    ], known)).toBeNull();
  });

  it("rejects unknown participants and more than eight rooms", () => {
    expect(normalizeBreakoutAssignments([{ participantIdentity: "unknown", breakoutId: "room-1", breakoutName: "Gruppe" }], new Set(["known"]))).toBeNull();
    const identities = new Set(Array.from({ length: 9 }, (_, index) => `participant-${index}`));
    expect(normalizeBreakoutAssignments(Array.from(identities, (participantIdentity, index) => ({ participantIdentity, breakoutId: `room-${index}`, breakoutName: `Gruppe ${index}` })), identities)).toBeNull();
  });
});
