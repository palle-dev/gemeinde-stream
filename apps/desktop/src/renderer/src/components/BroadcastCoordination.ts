import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";

const BROADCAST_TOPIC = "gemeinde-stream.broadcast.v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type BroadcastLayout = "single" | "side_by_side" | "picture_in_picture";
export type BroadcastTransition = "cut" | "fade";

export interface BroadcastOverlay {
  title: string;
  subtitle: string;
}

export function normalizeBroadcastOverlay(title: string, subtitle: string): BroadcastOverlay | null {
  const normalizedTitle = title.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!normalizedTitle) return null;
  return {
    title: normalizedTitle,
    subtitle: subtitle.trim().replace(/\s+/g, " ").slice(0, 120),
  };
}

export interface BroadcastProgramState {
  type: "program-state";
  revision: string;
  controllerIdentity: string;
  updatedAt: number;
  layout: BroadcastLayout;
  transition: BroadcastTransition;
  sourceIds: string[];
  overlay?: BroadcastOverlay | null;
}

interface BroadcastStateRequest {
  type: "request-program-state";
}

type BroadcastWireMessage = BroadcastProgramState | BroadcastStateRequest;

export function roleCanControlProgram(metadata?: string): boolean {
  if (!metadata) return false;
  try {
    const role = (JSON.parse(metadata) as { role?: string }).role;
    return role === "host" || role === "cohost" || role === "operator";
  } catch {
    return false;
  }
}

function isProgramState(value: unknown): value is BroadcastProgramState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<BroadcastProgramState>;
  return state.type === "program-state"
    && typeof state.revision === "string"
    && typeof state.controllerIdentity === "string"
    && typeof state.updatedAt === "number"
    && ["single", "side_by_side", "picture_in_picture"].includes(String(state.layout))
    && ["cut", "fade"].includes(String(state.transition))
    && Array.isArray(state.sourceIds)
    && state.sourceIds.every((sourceId) => typeof sourceId === "string")
    && (state.overlay == null || (
      typeof state.overlay === "object"
      && typeof state.overlay.title === "string"
      && state.overlay.title.length <= 80
      && typeof state.overlay.subtitle === "string"
      && state.overlay.subtitle.length <= 120
    ));
}

export function useBroadcastCoordination(room: Room, connected: boolean, grantedControl: boolean) {
  const [programState, setProgramState] = useState<BroadcastProgramState | null>(null);
  const stateRef = useRef<BroadcastProgramState | null>(null);
  const canControl = useMemo(() => connected && grantedControl, [connected, grantedControl]);

  const publishWireMessage = useCallback(async (message: BroadcastWireMessage) => {
    await room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), {
      reliable: true,
      topic: BROADCAST_TOPIC,
    });
  }, [room]);

  useEffect(() => {
    if (!connected) {
      stateRef.current = null;
      setProgramState(null);
      return;
    }

    const receive = (
      payload: Uint8Array,
      participant?: { identity: string; metadata?: string },
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== BROADCAST_TOPIC) return;
      try {
        const message = JSON.parse(decoder.decode(payload)) as BroadcastWireMessage;
        if (message.type === "request-program-state") {
          if (canControl && stateRef.current) {
            void publishWireMessage({ ...stateRef.current, controllerIdentity: room.localParticipant.identity });
          }
          return;
        }
        if (!isProgramState(message) || !roleCanControlProgram(participant?.metadata)) return;
        if (participant?.identity && message.controllerIdentity !== participant.identity) return;

        stateRef.current = message;
        setProgramState(message);
      } catch {
        // Ignore unrelated or malformed data packets.
      }
    };

    room.on(RoomEvent.DataReceived, receive);
    if (!canControl) void publishWireMessage({ type: "request-program-state" });
    return () => { room.off(RoomEvent.DataReceived, receive); };
  }, [canControl, connected, publishWireMessage, room]);

  const take = useCallback(async (
    sourceIds: string[],
    layout: BroadcastLayout,
    transition: BroadcastTransition,
    overlay: BroadcastOverlay | null = null,
  ) => {
    if (!canControl) throw new Error("Nur Master, Co-Host oder Operator dürfen das Programmbild schalten.");
    const nextState: BroadcastProgramState = {
      type: "program-state",
      revision: crypto.randomUUID(),
      controllerIdentity: room.localParticipant.identity,
      updatedAt: Date.now(),
      layout,
      transition,
      sourceIds: sourceIds.slice(0, layout === "single" ? 1 : 2),
      overlay,
    };
    stateRef.current = nextState;
    setProgramState(nextState);
    await publishWireMessage(nextState);
  }, [canControl, publishWireMessage, room]);

  return { canControl, programState, take };
}
