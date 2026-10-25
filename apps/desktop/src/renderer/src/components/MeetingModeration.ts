import { useCallback, useEffect } from "react";
import { Room, RoomEvent } from "livekit-client";

const MODERATION_TOPIC = "gemeinde-stream.moderation.v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type ParticipantRole = "host" | "cohost" | "operator" | "speaker" | "participant" | "viewer";
export type ModerationAction = "mute" | "camera_off" | "remove";

interface ModerationMessage {
  type: "moderation";
  id: string;
  action: ModerationAction;
  targetIdentity: string;
  sentAt: number;
}

export function participantRole(metadata?: string): ParticipantRole {
  if (!metadata) return "participant";
  try {
    const role = (JSON.parse(metadata) as { role?: string }).role;
    return ["host", "cohost", "operator", "speaker", "participant", "viewer"].includes(String(role))
      ? role as ParticipantRole
      : "participant";
  } catch {
    return "participant";
  }
}

export function roleCanModerate(metadata?: string): boolean {
  return ["host", "cohost", "operator"].includes(participantRole(metadata));
}

export function canModerateRole(actor: ParticipantRole, target: ParticipantRole): boolean {
  const rank: Record<ParticipantRole, number> = { host: 3, cohost: 2, operator: 2, speaker: 1, participant: 1, viewer: 1 };
  return ["host", "cohost", "operator"].includes(actor) && rank[actor] > rank[target];
}

export function roleLabel(role: ParticipantRole): string {
  return ({ host: "Host", cohost: "Co-Host", operator: "Operator", speaker: "Sprecher", participant: "Teilnehmer", viewer: "Zuschauer" })[role];
}

export function useMeetingModeration(
  room: Room,
  connected: boolean,
  localRole: ParticipantRole,
  onMuted: () => void,
  onRemoved: () => void,
  onCameraDisabled?: () => void,
) {
  useEffect(() => {
    if (!connected) return;
    const receive = async (
      payload: Uint8Array,
      participant?: { metadata?: string },
      _kind?: unknown,
      topic?: string,
    ) => {
      const senderRole = participantRole(participant?.metadata);
      if (topic !== MODERATION_TOPIC || !canModerateRole(senderRole, localRole)) return;
      try {
        const message = JSON.parse(decoder.decode(payload)) as Partial<ModerationMessage>;
        if (message.type !== "moderation" || message.targetIdentity !== room.localParticipant.identity) return;
        if (message.action === "mute") {
          await room.localParticipant.setMicrophoneEnabled(false);
          onMuted();
        } else if (message.action === "camera_off") {
          await room.localParticipant.setCameraEnabled(false);
          onCameraDisabled?.();
        } else if (message.action === "remove") {
          await room.disconnect();
          onRemoved();
        }
      } catch {
        // Ignore malformed or unrelated control packets.
      }
    };
    room.on(RoomEvent.DataReceived, receive);
    return () => { room.off(RoomEvent.DataReceived, receive); };
  }, [connected, localRole, onCameraDisabled, onMuted, onRemoved, room]);

  const moderate = useCallback(async (targetIdentity: string, targetRole: ParticipantRole, action: ModerationAction) => {
    if (!canModerateRole(localRole, targetRole)) throw new Error("Sie haben keine Berechtigung für diese Person.");
    const message: ModerationMessage = {
      type: "moderation",
      id: crypto.randomUUID(),
      action,
      targetIdentity,
      sentAt: Date.now(),
    };
    await room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), {
      reliable: true,
      topic: MODERATION_TOPIC,
      destinationIdentities: [targetIdentity],
    });
  }, [localRole, room]);

  return { moderate };
}
