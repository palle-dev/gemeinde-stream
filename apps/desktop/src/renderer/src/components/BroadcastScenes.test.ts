import { describe, expect, it } from "vitest";
import { resolveSceneSourceIds, type BroadcastScene } from "./BroadcastScenes";

const scene: BroadcastScene = {
  id: "scene-1",
  name: "Predigt",
  layout: "side_by_side",
  source_slots: [
    { slot: 2, participant_identity: "remote", track_source: "screen" },
    { slot: 1, participant_identity: "camera", track_source: "camera" },
  ],
};

describe("broadcast scenes", () => {
  it("resolves saved slots in their configured order", () => {
    expect(resolveSceneSourceIds(scene, [
      { id: "remote-screen", participantIdentity: "remote", trackSource: "screen" },
      { id: "camera-camera", participantIdentity: "camera", trackSource: "camera" },
    ])).toEqual(["camera-camera", "remote-screen"]);
  });

  it("ignores sources that are currently offline", () => {
    expect(resolveSceneSourceIds(scene, [
      { id: "camera-camera", participantIdentity: "camera", trackSource: "camera" },
    ])).toEqual(["camera-camera"]);
  });
});
