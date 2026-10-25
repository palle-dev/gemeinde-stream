import { describe, expect, it } from "vitest";
import { selectMeetingStage, type MeetingStageCandidate } from "./MeetingLayout";

const tile = (key: string, values: Partial<MeetingStageCandidate> = {}): MeetingStageCandidate => ({ key, isScreenShare: false, isSpeaking: false, ...values });

describe("meeting stage selection", () => {
  it("gives a shared screen priority over active speakers", () => {
    expect(selectMeetingStage([tile("speaker", { isSpeaking: true }), tile("screen", { isScreenShare: true })])?.key).toBe("screen");
  });

  it("follows the active speaker when no screen is shared", () => {
    expect(selectMeetingStage([tile("first"), tile("speaker", { isSpeaking: true })])?.key).toBe("speaker");
  });

  it("keeps the current stage while nobody is speaking", () => {
    expect(selectMeetingStage([tile("first"), tile("current")], "current")?.key).toBe("current");
  });
});
