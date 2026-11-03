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

  it("gives a moderator spotlight priority over screen shares and speakers", () => {
    expect(selectMeetingStage([tile("spotlight"), tile("screen", { isScreenShare: true }), tile("speaker", { isSpeaking: true })], undefined, "spotlight")?.key).toBe("spotlight");
  });

  it("keeps a personal pin above automatic selection but below moderator spotlight", () => {
    const tiles = [tile("spotlight"), tile("pinned"), tile("screen", { isScreenShare: true }), tile("speaker", { isSpeaking: true })];
    expect(selectMeetingStage(tiles, undefined, null, "pinned")?.key).toBe("pinned");
    expect(selectMeetingStage(tiles, undefined, "spotlight", "pinned")?.key).toBe("spotlight");
  });
});
