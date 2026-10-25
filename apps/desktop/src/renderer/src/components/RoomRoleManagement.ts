import { useCallback, useEffect } from "react";
import { Room, RoomEvent } from "livekit-client";
import { participantRole, type ParticipantRole } from "./MeetingModeration";

const ROLE_TOPIC = "gemeinde-stream.role.v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type AssignableRole = Exclude<ParticipantRole, "host">;

interface RoleChangedMessage {
  type: "role-changed";
  id: string;
  targetIdentity: string;
  role: AssignableRole;
  sentAt: number;
}

const assignableRoles: AssignableRole[] = ["cohost", "operator", "speaker", "participant", "viewer"];

export function isAssignableRole(value: unknown): value is AssignableRole {
  return assignableRoles.includes(value as AssignableRole);
}

export function useRoomRoleManagement(
  room: Room,
  connected: boolean,
  localRole: ParticipantRole,
  onRoleChanged: (role: AssignableRole) => void,
) {
  useEffect(() => {
    if (!connected) return;
    const receive = async (payload: Uint8Array, participant?: { metadata?: string }, _kind?: unknown, topic?: string) => {
      if (topic !== ROLE_TOPIC || participantRole(participant?.metadata) !== "host") return;
      try {
        const message = JSON.parse(decoder.decode(payload)) as Partial<RoleChangedMessage>;
        if (message.type !== "role-changed" || message.targetIdentity !== room.localParticipant.identity || !isAssignableRole(message.role)) return;
        await room.disconnect();
        onRoleChanged(message.role);
      } catch {
        // Ignore malformed role messages.
      }
    };
    room.on(RoomEvent.DataReceived, receive);
    return () => { room.off(RoomEvent.DataReceived, receive); };
  }, [connected, onRoleChanged, room]);

  const notifyRoleChange = useCallback(async (targetIdentity: string, role: AssignableRole) => {
    if (localRole !== "host") throw new Error("Nur der Host darf Rollen vergeben.");
    const message: RoleChangedMessage = { type: "role-changed", id: crypto.randomUUID(), targetIdentity, role, sentAt: Date.now() };
    await room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), {
      reliable: true,
      topic: ROLE_TOPIC,
      destinationIdentities: [targetIdentity],
    });
  }, [localRole, room]);

  return { notifyRoleChange };
}
