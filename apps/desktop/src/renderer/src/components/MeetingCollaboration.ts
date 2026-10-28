import { useEffect, useState } from "react";
import { Room, RoomEvent } from "livekit-client";

const CHAT_TOPIC = "gemeinde-stream.chat.v1";
const HAND_TOPIC = "gemeinde-stream.hand.v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface MeetingMessage {
  id: string;
  senderIdentity: string;
  senderName: string;
  text: string;
  sentAt: number;
  isLocal: boolean;
}

type WireMessage = Omit<MeetingMessage, "isLocal"> & { type: "chat" };
type HandWireMessage = { type: "hand"; id: string; raised: boolean; sentAt: number };

export function parseMeetingMessage(
  payload: Uint8Array,
  participant?: { identity: string; name?: string },
): MeetingMessage | null {
  if (!participant?.identity) return null;
  try {
    const message = JSON.parse(decoder.decode(payload)) as Partial<WireMessage>;
    if (
      message.type !== "chat" ||
      typeof message.id !== "string" ||
      message.id.length < 1 ||
      message.id.length > 100 ||
      typeof message.text !== "string" ||
      !message.text.trim() ||
      message.text.length > 2_000 ||
      typeof message.sentAt !== "number" ||
      !Number.isFinite(message.sentAt)
    )
      return null;
    return {
      id: message.id,
      senderIdentity: participant.identity,
      senderName: participant.name || participant.identity,
      text: message.text,
      sentAt: message.sentAt,
      isLocal: false,
    };
  } catch {
    return null;
  }
}

export function useMeetingChat(room: Room, connected: boolean, localName: string) {
  const [messages, setMessages] = useState<MeetingMessage[]>([]);

  useEffect(() => {
    if (!connected) return;

    const receive = (payload: Uint8Array, participant?: { identity: string; name?: string }, _kind?: unknown, topic?: string) => {
      if (topic !== CHAT_TOPIC) return;
      const message = parseMeetingMessage(payload, participant);
      if (!message) return;
      setMessages((current) => current.some((item) => item.id === message.id)
        ? current
        : [...current, message].slice(-100));
    };

    room.on(RoomEvent.DataReceived, receive);
    return () => { room.off(RoomEvent.DataReceived, receive); };
  }, [connected, room]);

  async function send(text: string) {
    const cleanText = text.trim().slice(0, 2000);
    if (!connected || !cleanText) return;
    const message: WireMessage = {
      type: "chat",
      id: crypto.randomUUID(),
      senderIdentity: room.localParticipant.identity,
      senderName: room.localParticipant.name || localName,
      text: cleanText,
      sentAt: Date.now(),
    };
    await room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), {
      reliable: true,
      topic: CHAT_TOPIC,
    });
    setMessages((current) => [...current, { ...message, isLocal: true }].slice(-100));
  }

  return { messages, send };
}

export function useRaisedHands(room: Room, connected: boolean) {
  const [raisedIdentities, setRaisedIdentities] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!connected) {
      setRaisedIdentities(new Set());
      return;
    }
    const receive = (payload: Uint8Array, participant?: { identity: string }, _kind?: unknown, topic?: string) => {
      if (topic !== HAND_TOPIC || !participant?.identity) return;
      try {
        const message = JSON.parse(decoder.decode(payload)) as HandWireMessage;
        if (message.type !== "hand" || typeof message.raised !== "boolean") return;
        setRaisedIdentities((current) => {
          const next = new Set(current);
          if (message.raised) next.add(participant.identity); else next.delete(participant.identity);
          return next;
        });
      } catch {
        // Ignore malformed packets.
      }
    };
    const disconnected = (participant: { identity: string }) => {
      setRaisedIdentities((current) => {
        const next = new Set(current);
        next.delete(participant.identity);
        return next;
      });
    };
    room.on(RoomEvent.DataReceived, receive);
    room.on(RoomEvent.ParticipantDisconnected, disconnected);
    return () => {
      room.off(RoomEvent.DataReceived, receive);
      room.off(RoomEvent.ParticipantDisconnected, disconnected);
    };
  }, [connected, room]);

  async function setRaised(raised: boolean) {
    if (!connected) return;
    const identity = room.localParticipant.identity;
    const message: HandWireMessage = { type: "hand", id: crypto.randomUUID(), raised, sentAt: Date.now() };
    await room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), { reliable: true, topic: HAND_TOPIC });
    setRaisedIdentities((current) => {
      const next = new Set(current);
      if (raised) next.add(identity); else next.delete(identity);
      return next;
    });
  }

  return { raisedIdentities, setRaised };
}
