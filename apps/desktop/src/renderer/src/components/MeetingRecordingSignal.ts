import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import { participantRole } from "./MeetingModeration";

export const MEETING_RECORDING_TOPIC = "gemeinde-stream.meeting-recording.v1";
const HEARTBEAT_MS = 5_000;
const SIGNAL_TIMEOUT_MS = 13_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface MeetingRecordingWireMessage {
  type: "meeting-recording";
  active: boolean;
  sentAt: number;
}

export interface RemoteMeetingRecording {
  senderIdentity: string;
  senderName: string;
  expiresAt: number;
}

export function parseMeetingRecordingSignal(
  payload: Uint8Array,
  participant?: { identity: string; name?: string; metadata?: string },
  now = Date.now(),
): (RemoteMeetingRecording & { active: boolean }) | null {
  if (!participant?.identity || !["host", "cohost", "operator"].includes(participantRole(participant.metadata))) return null;
  try {
    const message = JSON.parse(decoder.decode(payload)) as Partial<MeetingRecordingWireMessage>;
    if (
      message.type !== "meeting-recording"
      || typeof message.active !== "boolean"
      || !Number.isSafeInteger(message.sentAt)
      || Number(message.sentAt) < now - 60_000
      || Number(message.sentAt) > now + 5_000
    ) return null;
    return {
      active: message.active,
      senderIdentity: participant.identity,
      senderName: (participant.name || participant.identity).slice(0, 120),
      expiresAt: now + SIGNAL_TIMEOUT_MS,
    };
  } catch {
    return null;
  }
}

export function useMeetingRecordingSignal(
  room: Room,
  connected: boolean,
  active: boolean,
  canAnnounce: boolean,
) {
  const [remoteRecordings, setRemoteRecordings] = useState<RemoteMeetingRecording[]>([]);
  const stateRef = useRef({ active, canAnnounce });
  stateRef.current = { active, canAnnounce };

  const announce = useCallback(async (nextActive = stateRef.current.active) => {
    if (!connected || !stateRef.current.canAnnounce) return;
    const message: MeetingRecordingWireMessage = {
      type: "meeting-recording",
      active: nextActive,
      sentAt: Date.now(),
    };
    await room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), {
      reliable: true,
      topic: MEETING_RECORDING_TOPIC,
    });
  }, [connected, room]);

  useEffect(() => {
    if (!connected) {
      setRemoteRecordings([]);
      return;
    }
    const receive = (
      payload: Uint8Array,
      participant?: { identity: string; name?: string; metadata?: string },
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== MEETING_RECORDING_TOPIC) return;
      const signal = parseMeetingRecordingSignal(payload, participant);
      if (!signal) return;
      setRemoteRecordings((current) => signal.active
        ? [...current.filter((item) => item.senderIdentity !== signal.senderIdentity), signal]
        : current.filter((item) => item.senderIdentity !== signal.senderIdentity));
    };
    const participantJoined = () => { if (stateRef.current.active) void announce(); };
    const expiry = window.setInterval(() => {
      const now = Date.now();
      setRemoteRecordings((current) => current.filter((item) => item.expiresAt > now));
    }, 1_000);
    room.on(RoomEvent.DataReceived, receive);
    room.on(RoomEvent.ParticipantConnected, participantJoined);
    return () => {
      window.clearInterval(expiry);
      room.off(RoomEvent.DataReceived, receive);
      room.off(RoomEvent.ParticipantConnected, participantJoined);
    };
  }, [announce, connected, room]);

  useEffect(() => {
    if (!connected || !canAnnounce) return;
    void announce(active);
    if (!active) return;
    const heartbeat = window.setInterval(() => void announce(), HEARTBEAT_MS);
    return () => window.clearInterval(heartbeat);
  }, [active, announce, canAnnounce, connected]);

  useEffect(() => () => {
    if (stateRef.current.active && stateRef.current.canAnnounce) void announce(false);
  }, [announce]);

  return remoteRecordings;
}
