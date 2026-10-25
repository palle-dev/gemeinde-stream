import { useCallback, useEffect, useState } from "react";
import { base44 } from "../lib/base44";
import type { BroadcastLayout } from "./BroadcastCoordination";

export type SceneTrackSource = "camera" | "screen";

export interface SceneSourceSlot {
  slot: number;
  participant_identity: string;
  track_source: SceneTrackSource;
}

export interface BroadcastScene {
  id: string;
  name: string;
  layout: BroadcastLayout;
  source_slots: SceneSourceSlot[];
}

export interface AvailableSceneSource {
  id: string;
  participantIdentity: string;
  trackSource: SceneTrackSource;
}

function unwrap<T>(response: unknown): T {
  if (response && typeof response === "object" && "data" in response) return (response as { data: T }).data;
  return response as T;
}

export function resolveSceneSourceIds(scene: BroadcastScene, sources: AvailableSceneSource[]): string[] {
  return [...scene.source_slots]
    .sort((left, right) => left.slot - right.slot)
    .map((slot) => sources.find((source) => source.participantIdentity === slot.participant_identity && source.trackSource === slot.track_source)?.id)
    .filter((id): id is string => Boolean(id));
}

export function useBroadcastScenes(eventId: string, enabled: boolean) {
  const [scenes, setScenes] = useState<BroadcastScene[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const invoke = useCallback(async (data: Record<string, unknown>) => {
    const result = unwrap<{ scenes: BroadcastScene[] }>(await base44.functions.invoke("manage-broadcast-scenes", { eventId, ...data }));
    setScenes(result.scenes);
    setError("");
    return result.scenes;
  }, [eventId]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      await invoke({ action: "list" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Szenen konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [enabled, invoke]);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (name: string, layout: BroadcastLayout, sources: AvailableSceneSource[]) => {
    await invoke({
      action: "save",
      name,
      layout,
      sourceSlots: sources.map((source, index) => ({ slot: index + 1, participant_identity: source.participantIdentity, track_source: source.trackSource })),
    });
  }, [invoke]);

  const remove = useCallback(async (sceneId: string) => {
    await invoke({ action: "delete", sceneId });
  }, [invoke]);

  return { scenes, loading, error, refresh, save, remove };
}
