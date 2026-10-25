import { useCallback, useEffect, useState } from "react";
import { Room, RoomEvent } from "livekit-client";

const REACTION_TOPIC = "gemeinde-stream.reaction.v1";
const REACTION_LIFETIME_MS = 4_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const MEETING_REACTIONS = ["👍", "❤️", "🎉", "👏", "😂"] as const;
export type MeetingReactionEmoji = typeof MEETING_REACTIONS[number];

interface ReactionWireMessage {
  type: "reaction";
  id: string;
  emoji: MeetingReactionEmoji;
  sentAt: number;
}

export interface MeetingReaction extends ReactionWireMessage {
  senderIdentity: string;
  senderName: string;
  expiresAt: number;
}

export function parseMeetingReaction(
  payload: Uint8Array,
  participant?: { identity: string; name?: string },
  now = Date.now(),
): MeetingReaction | null {
  if (!participant?.identity) return null;
  try {
    const message = JSON.parse(decoder.decode(payload)) as Partial<ReactionWireMessage>;
    if (
      message.type !== "reaction"
      || typeof message.id !== "string"
      || message.id.length < 1
      || message.id.length > 100
      || !MEETING_REACTIONS.includes(message.emoji as MeetingReactionEmoji)
      || typeof message.sentAt !== "number"
    ) return null;
    return {
      type: "reaction",
      id: message.id,
      emoji: message.emoji as MeetingReactionEmoji,
      sentAt: message.sentAt,
      senderIdentity: participant.identity,
      senderName: participant.name || participant.identity,
      expiresAt: now + REACTION_LIFETIME_MS,
    };
  } catch {
    return null;
  }
}

export function useMeetingReactions(room: Room, connected: boolean) {
  const [reactions, setReactions] = useState<MeetingReaction[]>([]);
  const addReaction = useCallback((reaction: MeetingReaction) => {
    setReactions((current) => [...current.filter((item) => item.id !== reaction.id), reaction].slice(-40));
  }, []);

  useEffect(() => {
    if (!connected) {
      setReactions([]);
      return;
    }
    const receive = (
      payload: Uint8Array,
      participant?: { identity: string; name?: string },
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== REACTION_TOPIC) return;
      const reaction = parseMeetingReaction(payload, participant);
      if (reaction) addReaction(reaction);
    };
    const expiryTimer = window.setInterval(() => {
      const now = Date.now();
      setReactions((current) => current.filter((reaction) => reaction.expiresAt > now));
    }, 500);
    room.on(RoomEvent.DataReceived, receive);
    return () => {
      window.clearInterval(expiryTimer);
      room.off(RoomEvent.DataReceived, receive);
    };
  }, [addReaction, connected, room]);

  const sendReaction = useCallback(async (emoji: MeetingReactionEmoji) => {
    if (!connected || !MEETING_REACTIONS.includes(emoji)) return;
    const message: ReactionWireMessage = {
      type: "reaction",
      id: crypto.randomUUID(),
      emoji,
      sentAt: Date.now(),
    };
    await room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), {
      reliable: false,
      topic: REACTION_TOPIC,
    });
    addReaction({
      ...message,
      senderIdentity: room.localParticipant.identity,
      senderName: room.localParticipant.name || room.localParticipant.identity,
      expiresAt: Date.now() + REACTION_LIFETIME_MS,
    });
  }, [addReaction, connected, room]);

  return { reactions, sendReaction };
}
