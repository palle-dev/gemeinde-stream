import { useCallback, useEffect } from "react";
import { Room, RoomEvent } from "livekit-client";
import { participantRole, type ParticipantRole } from "./MeetingModeration";

const LIFECYCLE_TOPIC = "gemeinde-stream.lifecycle.v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface EndRoomMessage {
  type: "end-room";
  id: string;
  sentAt: number;
}

export function useRoomLifecycle(room: Room, connected: boolean, localRole: ParticipantRole, onEnded: () => void) {
  useEffect(() => {
    if (!connected) return;
    const receive = async (
      payload: Uint8Array,
      participant?: { metadata?: string },
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== LIFECYCLE_TOPIC || participantRole(participant?.metadata) !== "host") return;
      try {
        const message = JSON.parse(decoder.decode(payload)) as Partial<EndRoomMessage>;
        if (message.type !== "end-room") return;
        await room.disconnect();
        onEnded();
      } catch {
        // Ignore malformed lifecycle messages.
      }
    };
    room.on(RoomEvent.DataReceived, receive);
    return () => { room.off(RoomEvent.DataReceived, receive); };
  }, [connected, onEnded, room]);

  const broadcastEnd = useCallback(async () => {
    if (localRole !== "host") throw new Error("Nur der Host darf die Veranstaltung für alle beenden.");
    const message: EndRoomMessage = { type: "end-room", id: crypto.randomUUID(), sentAt: Date.now() };
    await room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), {
      reliable: true,
      topic: LIFECYCLE_TOPIC,
    });
  }, [localRole, room]);

  return { broadcastEnd };
}
