import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import { base44 } from "../lib/base44";

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

interface ControllerCandidate { identity: string; metadata?: string; name?: string }

export function electBroadcastController(candidates: ControllerCandidate[]): ControllerCandidate | null {
  const rank = (metadata?: string) => {
    try {
      const role = (JSON.parse(metadata || "{}") as { role?: string }).role;
      return role === "host" ? 0 : role === "cohost" ? 1 : role === "operator" ? 2 : 99;
    } catch { return 99; }
  };
  return candidates
    .filter((candidate) => roleCanControlProgram(candidate.metadata))
    .sort((left, right) => rank(left.metadata) - rank(right.metadata) || left.identity.localeCompare(right.identity))[0] ?? null;
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

export function useBroadcastCoordination(eventId: string, room: Room, connected: boolean, grantedControl: boolean) {
  const [programState, setProgramState] = useState<BroadcastProgramState | null>(null);
  const [controller, setController] = useState<ControllerCandidate | null>(null);
  const stateRef = useRef<BroadcastProgramState | null>(null);
  const canControl = useMemo(() => connected && grantedControl && controller?.identity === room.localParticipant.identity, [connected, controller?.identity, grantedControl, room]);

  const publishWireMessage = useCallback(async (message: BroadcastWireMessage) => {
    await room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), {
      reliable: true,
      topic: BROADCAST_TOPIC,
    });
  }, [room]);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    void base44.functions.invoke("manage-program-state", { eventId, action: "get" }).then((response) => {
      if (!active) return;
      const payload = ((response as { data?: { state?: unknown } }).data ?? response) as { state?: unknown };
      if (!isProgramState(payload.state)) return;
      stateRef.current = payload.state;
      setProgramState(payload.state);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [connected, eventId]);

  useEffect(() => {
    if (!connected) { setController(null); return; }
    const updateController = () => {
      const candidates: ControllerCandidate[] = [
        { identity: room.localParticipant.identity, metadata: room.localParticipant.metadata, name: room.localParticipant.name },
        ...[...room.remoteParticipants.values()].map((participant) => ({ identity: participant.identity, metadata: participant.metadata, name: participant.name })),
      ];
      setController(electBroadcastController(candidates));
    };
    updateController();
    room.on(RoomEvent.ParticipantConnected, updateController);
    room.on(RoomEvent.ParticipantDisconnected, updateController);
    room.on(RoomEvent.ParticipantMetadataChanged, updateController);
    return () => {
      room.off(RoomEvent.ParticipantConnected, updateController);
      room.off(RoomEvent.ParticipantDisconnected, updateController);
      room.off(RoomEvent.ParticipantMetadataChanged, updateController);
    };
  }, [connected, room]);

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
        if (participant?.identity !== controller?.identity) return;
        const current = stateRef.current;
        if (current && (message.updatedAt < current.updatedAt || (message.updatedAt === current.updatedAt && message.revision <= current.revision))) return;

        stateRef.current = message;
        setProgramState(message);
      } catch {
        // Ignore unrelated or malformed data packets.
      }
    };

    room.on(RoomEvent.DataReceived, receive);
    if (!canControl) void publishWireMessage({ type: "request-program-state" });
    return () => { room.off(RoomEvent.DataReceived, receive); };
  }, [canControl, connected, controller?.identity, publishWireMessage, room]);

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
    await base44.functions.invoke("manage-program-state", { eventId, action: "save", state: nextState });
    stateRef.current = nextState;
    setProgramState(nextState);
    await publishWireMessage(nextState);
  }, [canControl, eventId, publishWireMessage, room]);

  return { canControl, controllerIdentity: controller?.identity ?? null, controllerName: controller?.name || controller?.identity || null, programState, take };
}
