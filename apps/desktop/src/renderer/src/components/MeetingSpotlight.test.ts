import { describe, expect, it } from "vitest";
import { newerSpotlightState, normalizeSpotlightState, parseSpotlightRefreshSignal } from "./MeetingSpotlight";
import { nextSpotlightRevision, normalizeSpotlightKey } from "../../../../../../base44/functions/meeting-spotlight/logic";

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe("meeting spotlight", () => {
  it("accepts camera and screen keys while rejecting malformed state", () => {
    expect(normalizeSpotlightState({ key: "anna-screen", revision: 3, updatedAt: "2026-10-25T12:00:00.000Z" })?.key).toBe("anna-screen");
    expect(normalizeSpotlightState({ key: "anna-audio", revision: 3, updatedAt: "" })).toBeNull();
    expect(normalizeSpotlightState({ key: null, revision: -1, updatedAt: "" })).toBeNull();
    expect(normalizeSpotlightState({ key: "anna-camera", revision: "3", updatedAt: "2026-10-25T12:00:00.000Z" })).toBeNull();
    expect(normalizeSpotlightState({ key: "x".repeat(241), revision: 3, updatedAt: "2026-10-25T12:00:00.000Z" })).toBeNull();
  });
  it("keeps the newest server revision", () => {
    const current = { key: "anna-camera", revision: 4, updatedAt: "2026-10-25T12:00:00.000Z" };
    expect(newerSpotlightState(current, { key: "bernd-camera", revision: 3, updatedAt: "2026-10-25T13:00:00.000Z" })).toBe(current);
    expect(newerSpotlightState(current, { key: "bernd-camera", revision: 5, updatedAt: "2026-10-25T11:00:00.000Z" }).key).toBe("bernd-camera");
  });
  it("accepts only fresh refresh hints without trusting a transported state", () => {
    const now = Date.parse("2026-10-25T12:00:00.000Z");
    expect(parseSpotlightRefreshSignal(encode({ type: "refresh", id: "12345678-abcd", revision: 5, sentAt: now }), now)).toMatchObject({ revision: 5 });
    expect(parseSpotlightRefreshSignal(encode({ type: "spotlight", id: "12345678-abcd", revision: Number.MAX_SAFE_INTEGER, key: "forged-camera", sentAt: now }), now)).toBeNull();
    expect(parseSpotlightRefreshSignal(encode({ type: "refresh", id: "12345678-abcd", revision: 5, sentAt: now - 60_001 }), now)).toBeNull();
  });
  it("validates server-side keys and revisions without truncation", () => {
    expect(normalizeSpotlightKey(" anna-camera ")).toBe("anna-camera");
    expect(normalizeSpotlightKey("")).toBe("");
    expect(() => normalizeSpotlightKey("anna-audio")).toThrow();
    expect(() => normalizeSpotlightKey(`${"x".repeat(240)}-camera`)).toThrow();
    expect(nextSpotlightRevision(4)).toBe(5);
    expect(() => nextSpotlightRevision(Number.MAX_SAFE_INTEGER)).toThrow();
  });
});
