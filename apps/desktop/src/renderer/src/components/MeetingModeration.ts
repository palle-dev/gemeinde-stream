import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";

const MODERATION_TOPIC = "gemeinde-stream.moderation.v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type ParticipantRole = "host" | "cohost" | "operator" | "speaker" | "participant" | "viewer";
export type ModerationAction = "mute" | "camera_off" | "remove" | "request_unmute";

interface ModerationMessage {
  type: "moderation";
  id: string;
  action: ModerationAction;
  targetIdentity: string;
  sentAt: number;
}

export interface UnmuteRequest { id: string; senderName: string; expiresAt: number; }

export function validModerationMessage(value: unknown, targetIdentity: string, now = Date.now()): value is ModerationMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ModerationMessage>;
  return message.type === "moderation"
    && typeof message.id === "string" && /^[a-zA-Z0-9-]{8,100}$/.test(message.id)
    && ["mute", "camera_off", "remove", "request_unmute"].includes(String(message.action))
    && message.targetIdentity === targetIdentity
    && Number.isSafeInteger(message.sentAt)
    && Number(message.sentAt) >= now - 30_000
    && Number(message.sentAt) <= now + 5_000;
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
  onUnmuted?: () => void,
) {
  const [unmuteRequest, setUnmuteRequest] = useState<UnmuteRequest | null>(null);
  const seenMessageIds = useRef(new Set<string>());

  useEffect(() => {
    if (!connected) {
      setUnmuteRequest(null);
      seenMessageIds.current.clear();
      return;
    }
    const receive = async (
      payload: Uint8Array,
      participant?: { metadata?: string; name?: string; identity?: string },
      _kind?: unknown,
      topic?: string,
    ) => {
      const senderRole = participantRole(participant?.metadata);
      if (topic !== MODERATION_TOPIC || !canModerateRole(senderRole, localRole)) return;
      try {
        const message = JSON.parse(decoder.decode(payload)) as unknown;
        if (!validModerationMessage(message, room.localParticipant.identity) || seenMessageIds.current.has(message.id)) return;
        if (seenMessageIds.current.size >= 500) seenMessageIds.current.clear();
        seenMessageIds.current.add(message.id);
        if (message.action === "mute") {
          await room.localParticipant.setMicrophoneEnabled(false);
          onMuted();
        } else if (message.action === "camera_off") {
          await room.localParticipant.setCameraEnabled(false);
          onCameraDisabled?.();
        } else if (message.action === "remove") {
          await room.disconnect();
          onRemoved();
        } else if (message.action === "request_unmute" && !room.localParticipant.isMicrophoneEnabled) {
          setUnmuteRequest({
            id: message.id,
            senderName: (participant?.name || participant?.identity || roleLabel(senderRole)).slice(0, 120),
            expiresAt: message.sentAt + 30_000,
          });
        }
      } catch {
        // Ignore malformed or unrelated control packets.
      }
    };
    room.on(RoomEvent.DataReceived, receive);
    return () => { room.off(RoomEvent.DataReceived, receive); };
  }, [connected, localRole, onCameraDisabled, onMuted, onRemoved, room]);

  useEffect(() => {
    if (!unmuteRequest) return;
    const remaining = unmuteRequest.expiresAt - Date.now();
    if (remaining <= 0) {
      setUnmuteRequest(null);
      return;
    }
    const timeout = window.setTimeout(
      () => setUnmuteRequest((current) => current?.id === unmuteRequest.id ? null : current),
      remaining,
    );
    return () => window.clearTimeout(timeout);
  }, [unmuteRequest]);

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

  const acceptUnmute = useCallback(async () => {
    const pending = unmuteRequest;
    if (!pending) return;
    setUnmuteRequest(null);
    if (pending.expiresAt <= Date.now()) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
      onUnmuted?.();
    } catch (cause) {
      setUnmuteRequest(pending);
      throw cause;
    }
  }, [onUnmuted, room, unmuteRequest]);
  const declineUnmute = useCallback(() => setUnmuteRequest(null), []);

  return { moderate, unmuteRequest, acceptUnmute, declineUnmute };
}
