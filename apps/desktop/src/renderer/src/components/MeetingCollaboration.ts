import { useEffect, useState } from "react";
import { Room, RoomEvent } from "livekit-client";

const CHAT_TOPIC = "gemeinde-stream.chat.v1";
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

export function useMeetingChat(room: Room, connected: boolean, localName: string) {
  const [messages, setMessages] = useState<MeetingMessage[]>([]);

  useEffect(() => {
    if (!connected) return;

    const receive = (payload: Uint8Array, participant?: { identity: string; name?: string }, _kind?: unknown, topic?: string) => {
      if (topic !== CHAT_TOPIC) return;
      try {
        const message = JSON.parse(decoder.decode(payload)) as WireMessage;
        if (message.type !== "chat" || !message.id || !message.text) return;
        setMessages((current) => current.some((item) => item.id === message.id)
          ? current
          : [...current, {
              ...message,
              senderIdentity: participant?.identity || message.senderIdentity,
              senderName: participant?.name || message.senderName,
              isLocal: false,
            }].slice(-100));
      } catch {
        // Ignore data packets from other features or older clients.
      }
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

export async function setHandRaised(room: Room, raised: boolean): Promise<void> {
  await room.localParticipant.setAttributes({ handRaised: raised ? "true" : "false" });
}
