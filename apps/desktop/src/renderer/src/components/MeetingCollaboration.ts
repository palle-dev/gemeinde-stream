import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import { base44 } from "../lib/base44";
import { participantRole } from "./MeetingModeration";

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
  recipientIdentity?: string;
  recipientName?: string;
}

function csvCell(value: unknown): string {
  const raw = String(value ?? "").replace(/\u0000/g, "");
  const text = /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function meetingChatCsv(messages: MeetingMessage[]): string {
  const rows = messages.map((message) => [new Date(message.sentAt).toISOString(), message.senderName, message.recipientName || "Alle", message.text].map(csvCell).join(";"));
  return `\uFEFFZeit;Absender;Empfänger;Nachricht\r\n${rows.join("\r\n")}`;
}

export function unreadMeetingMessageIds(messages: MeetingMessage[], readIds: ReadonlySet<string>): string[] {
  return messages.filter((message) => !message.isLocal && !readIds.has(message.id)).map((message) => message.id);
}

interface ChatRefreshSignal { type: "refresh"; id: string; messageId: string; sentAt: number }
type HandWireMessage = { type: "hand"; id: string; raised: boolean; sentAt: number };
type HandCommandWireMessage = { type: "hand-command"; id: string; targetIdentity: string; sentAt: number };
type HandSyncRequestWireMessage = { type: "hand-sync-request"; id: string; sentAt: number };
type ParsedHandWireMessage = HandWireMessage | HandCommandWireMessage | HandSyncRequestWireMessage;

export function parseHandWire(payload: Uint8Array, now = Date.now()): ParsedHandWireMessage | null {
  try {
    const value: unknown = JSON.parse(decoder.decode(payload));
    if (!record(value) || typeof value.type !== "string" || typeof value.id !== "string" || !value.id || value.id.length > 100 || typeof value.sentAt !== "number" || !Number.isFinite(value.sentAt) || Math.abs(now - value.sentAt) > 60_000) return null;
    if (value.type === "hand" && typeof value.raised === "boolean") return { type: "hand", id: value.id, raised: value.raised, sentAt: value.sentAt };
    if (value.type === "hand-sync-request") return { type: "hand-sync-request", id: value.id, sentAt: value.sentAt };
    if (value.type === "hand-command" && typeof value.targetIdentity === "string" && value.targetIdentity.length > 0 && value.targetIdentity.length <= 200) return { type: "hand-command", id: value.id, targetIdentity: value.targetIdentity, sentAt: value.sentAt };
    return null;
  } catch { return null; }
}

export function canControlRaisedHands(metadata?: string): boolean {
  return ["host", "cohost", "operator"].includes(participantRole(metadata));
}

export function shouldAnswerHandSync(raisedIdentities: ReadonlySet<string>, localIdentity: string): boolean {
  return raisedIdentities.has(localIdentity);
}

export function chatMessageVisibleTo(message: Pick<MeetingMessage, "recipientIdentity" | "senderIdentity">, localIdentity: string): boolean {
  return !message.recipientIdentity || message.recipientIdentity === localIdentity || message.senderIdentity === localIdentity;
}

type StoredMeetingMessage = Omit<MeetingMessage, "isLocal">;

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
export function normalizeStoredMeetingMessage(value: unknown, now = Date.now()): StoredMeetingMessage | null {
  if (!record(value) || typeof value.id !== "string" || !value.id || value.id.length > 80 || /[\u0000-\u001f\u007f]/.test(value.id) || typeof value.senderIdentity !== "string" || !value.senderIdentity || value.senderIdentity.length > 200 || /[\u0000-\u001f\u007f]/.test(value.senderIdentity) || typeof value.senderName !== "string" || !value.senderName.trim() || value.senderName.length > 80 || /[\u0000-\u001f\u007f]/.test(value.senderName) || typeof value.text !== "string" || !value.text.trim() || value.text.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.text) || typeof value.sentAt !== "number" || !Number.isFinite(value.sentAt) || value.sentAt <= 0 || value.sentAt > now + 300_000) return null;
  const recipientIdentity = value.recipientIdentity;
  const recipientName = value.recipientName;
  if (recipientIdentity !== undefined && (typeof recipientIdentity !== "string" || !recipientIdentity || recipientIdentity.length > 200 || /[\u0000-\u001f\u007f]/.test(recipientIdentity))) return null;
  if (recipientName !== undefined && (typeof recipientName !== "string" || !recipientName.trim() || recipientName.length > 80 || /[\u0000-\u001f\u007f]/.test(recipientName))) return null;
  if (Boolean(recipientIdentity) !== Boolean(recipientName)) return null;
  return { id: value.id, senderIdentity: value.senderIdentity, senderName: value.senderName.trim(), text: value.text, sentAt: value.sentAt, ...(recipientIdentity ? { recipientIdentity, recipientName: recipientName as string } : {}) };
}

export function parseMeetingChatRefreshSignal(payload: Uint8Array, now = Date.now()): ChatRefreshSignal | null {
  try {
    const value = JSON.parse(decoder.decode(payload)) as Record<string, unknown>;
    if (!value || value.type !== "refresh" || typeof value.id !== "string" || !/^[a-zA-Z0-9-]{8,100}$/.test(value.id) || typeof value.messageId !== "string" || !value.messageId || value.messageId.length > 80 || /[\u0000-\u001f\u007f]/.test(value.messageId)
      || typeof value.sentAt !== "number" || !Number.isFinite(value.sentAt) || Math.abs(now - value.sentAt) > 60_000) return null;
    return { type: "refresh", id: value.id, messageId: value.messageId, sentAt: value.sentAt };
  } catch { return null; }
}

export function safeMeetingChatResponse(value: unknown): StoredMeetingMessage[] {
  if (!record(value) || !Array.isArray(value.messages) || value.messages.length > 100) throw new Error("Der Server hat einen ungültigen Chatverlauf geliefert.");
  const messages = value.messages.map((message) => normalizeStoredMeetingMessage(message));
  if (messages.some((message) => !message)) throw new Error("Der Server hat einen ungültigen Chatverlauf geliefert.");
  return messages as StoredMeetingMessage[];
}

export function mergeMeetingMessages(current: MeetingMessage[], incoming: StoredMeetingMessage[], localIdentity: string): MeetingMessage[] {
  const merged = new Map(current.filter((message) => chatMessageVisibleTo(message, localIdentity)).map((message) => [message.id, message]));
  incoming.forEach((candidate) => {
    const message = normalizeStoredMeetingMessage(candidate);
    if (!message || !chatMessageVisibleTo(message, localIdentity)) return;
    const existing = merged.get(message.id);
    if (existing && (existing.senderIdentity !== message.senderIdentity || existing.text !== message.text || existing.recipientIdentity !== message.recipientIdentity)) return;
    merged.set(message.id, { ...message, isLocal: message.senderIdentity === localIdentity });
  });
  return [...merged.values()].sort((left, right) => left.sentAt - right.sentAt).slice(-100);
}

export function reconcileMeetingMessages(incoming: StoredMeetingMessage[], localIdentity: string): MeetingMessage[] {
  return mergeMeetingMessages([], incoming, localIdentity);
}

function unwrap<T>(response: unknown): T {
  return response && typeof response === "object" && "data" in response ? (response as { data: T }).data : response as T;
}

export function useMeetingChat(room: Room, connected: boolean, eventId: string, guestSession?: string) {
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false); const sendingRef = useRef(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const deletingIdsRef = useRef(new Set<string>());
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const lastSignalRefreshRef = useRef(0);

  const refresh = useCallback(() => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    const operation = (async () => {
      try {
        const result = unwrap<unknown>(await base44.functions.invoke("meeting-chat", { action: "list", eventId, guestSession }));
        const incoming = safeMeetingChatResponse(result);
        setMessages(reconcileMeetingMessages(incoming, room.localParticipant.identity));
        setError("");
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Chatverlauf konnte nicht geladen werden"); }
    })().finally(() => { if (refreshPromiseRef.current === operation) refreshPromiseRef.current = null; });
    refreshPromiseRef.current = operation;
    return operation;
  }, [eventId, guestSession, room]);

  useEffect(() => {
    if (!connected) return;

    const receive = (payload: Uint8Array, participant?: { identity: string }, _kind?: unknown, topic?: string) => {
      if (topic !== CHAT_TOPIC || !participant?.identity || !parseMeetingChatRefreshSignal(payload) || Date.now() - lastSignalRefreshRef.current < 1_000) return;
      lastSignalRefreshRef.current = Date.now();
      const pending = refreshPromiseRef.current;
      if (pending) void pending.then(() => refresh()); else void refresh();
    };
    room.on(RoomEvent.DataReceived, receive);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => { window.clearInterval(timer); room.off(RoomEvent.DataReceived, receive); };
  }, [connected, refresh, room]);

  async function send(text: string, recipient?: { identity: string; name: string }) {
    const cleanText = text.trim();
    if (!connected || !cleanText || sendingRef.current) return;
    sendingRef.current = true; setSending(true);
    const id = crypto.randomUUID();
    try {
      const result = unwrap<{ message?: unknown }>(await base44.functions.invoke("meeting-chat", {
        action: "send", eventId, guestSession, id, text: cleanText,
        recipientIdentity: recipient?.identity ?? "", recipientName: recipient?.name ?? "",
      }));
      const message = normalizeStoredMeetingMessage(result.message);
      if (!message || message.senderIdentity !== room.localParticipant.identity) throw new Error("Der Server hat eine ungültige Chatnachricht geliefert.");
      setMessages((current) => mergeMeetingMessages(current, [message], room.localParticipant.identity));
      try {
        const signal: ChatRefreshSignal = { type: "refresh", id: crypto.randomUUID(), messageId: message.id, sentAt: Date.now() };
        await room.localParticipant.publishData(encoder.encode(JSON.stringify(signal)), { reliable: true, topic: CHAT_TOPIC, ...(recipient ? { destinationIdentities: [recipient.identity] } : {}) });
        setError("");
        return true;
      } catch {
        setError("Nachricht wurde gespeichert und wird beim nächsten Chat-Abgleich zugestellt.");
        return false;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nachricht konnte nicht gesendet werden.");
      throw cause;
    } finally {
      sendingRef.current = false; setSending(false);
    }
  }

  async function remove(message: MeetingMessage) {
    if (!connected || deletingIdsRef.current.has(message.id)) return;
    deletingIdsRef.current.add(message.id);
    setDeletingIds((current) => new Set(current).add(message.id));
    try {
      const result = unwrap<{ removed?: unknown; messageId?: unknown }>(await base44.functions.invoke("meeting-chat", { action: "delete", eventId, guestSession, messageId: message.id }));
      if (result.removed !== true || result.messageId !== message.id) throw new Error("Der Server hat das Löschen nicht bestätigt.");
      setMessages((current) => current.filter((candidate) => candidate.id !== message.id));
      try {
        const signal: ChatRefreshSignal = { type: "refresh", id: crypto.randomUUID(), messageId: message.id, sentAt: Date.now() };
        const destinationIdentities = message.recipientIdentity && message.recipientIdentity !== room.localParticipant.identity ? [message.recipientIdentity] : undefined;
        await room.localParticipant.publishData(encoder.encode(JSON.stringify(signal)), { reliable: true, topic: CHAT_TOPIC, ...(destinationIdentities ? { destinationIdentities } : {}) });
        setError("");
      } catch { setError("Nachricht wurde gelöscht; andere Clients gleichen den Chat automatisch ab."); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nachricht konnte nicht gelöscht werden.");
      throw cause;
    } finally {
      deletingIdsRef.current.delete(message.id);
      setDeletingIds((current) => { const next = new Set(current); next.delete(message.id); return next; });
    }
  }

  return { messages, send, remove, sending, deletingIds, error };
}

export function useRaisedHands(room: Room, connected: boolean, canManage = false) {
  const [raisedIdentities, setRaisedIdentities] = useState<Set<string>>(() => new Set());
  const raisedRef = useRef(raisedIdentities); raisedRef.current = raisedIdentities;
  const latestStateAtRef = useRef(new Map<string, number>());
  const lastSyncResponseAtRef = useRef(new Map<string, number>());

  useEffect(() => {
    if (!connected) {
      setRaisedIdentities(new Set());
      latestStateAtRef.current.clear(); lastSyncResponseAtRef.current.clear();
      return;
    }
    const receive = (payload: Uint8Array, participant?: { identity: string; metadata?: string }, _kind?: unknown, topic?: string) => {
      if (topic !== HAND_TOPIC || !participant?.identity) return;
      try {
        const message = parseHandWire(payload);
        if (!message) return;
        if (message.type === "hand-sync-request") {
          if (!shouldAnswerHandSync(raisedRef.current, room.localParticipant.identity)) return;
          const lastResponse = lastSyncResponseAtRef.current.get(participant.identity) ?? 0;
          if (Date.now() - lastResponse < 1_000) return;
          lastSyncResponseAtRef.current.set(participant.identity, Date.now());
          const response: HandWireMessage = { type: "hand", id: crypto.randomUUID(), raised: true, sentAt: Date.now() };
          void room.localParticipant.publishData(encoder.encode(JSON.stringify(response)), { reliable: true, topic: HAND_TOPIC, destinationIdentities: [participant.identity] }).catch(() => undefined);
          return;
        }
        if (message.type === "hand-command") {
          if (!canControlRaisedHands(participant.metadata) || message.targetIdentity !== room.localParticipant.identity) return;
          setRaisedIdentities((current) => { const next = new Set(current); next.delete(room.localParticipant.identity); return next; });
          const response: HandWireMessage = { type: "hand", id: crypto.randomUUID(), raised: false, sentAt: Date.now() };
          latestStateAtRef.current.set(room.localParticipant.identity, response.sentAt);
          void room.localParticipant.publishData(encoder.encode(JSON.stringify(response)), { reliable: true, topic: HAND_TOPIC });
          return;
        }
        if (message.type !== "hand") return;
        const latest = latestStateAtRef.current.get(participant.identity) ?? 0;
        if (message.sentAt < latest) return;
        latestStateAtRef.current.set(participant.identity, message.sentAt);
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
      latestStateAtRef.current.delete(participant.identity); lastSyncResponseAtRef.current.delete(participant.identity);
    };
    room.on(RoomEvent.DataReceived, receive);
    room.on(RoomEvent.ParticipantDisconnected, disconnected);
    const syncRequest: HandSyncRequestWireMessage = { type: "hand-sync-request", id: crypto.randomUUID(), sentAt: Date.now() };
    void room.localParticipant.publishData(encoder.encode(JSON.stringify(syncRequest)), { reliable: true, topic: HAND_TOPIC }).catch(() => undefined);
    return () => {
      room.off(RoomEvent.DataReceived, receive);
      room.off(RoomEvent.ParticipantDisconnected, disconnected);
    };
  }, [canManage, connected, room]);

  async function setRaised(raised: boolean) {
    if (!connected) return;
    const identity = room.localParticipant.identity;
    const message: HandWireMessage = { type: "hand", id: crypto.randomUUID(), raised, sentAt: Date.now() };
    await room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), { reliable: true, topic: HAND_TOPIC });
    latestStateAtRef.current.set(identity, message.sentAt);
    setRaisedIdentities((current) => {
      const next = new Set(current);
      if (raised) next.add(identity); else next.delete(identity);
      return next;
    });
  }

  async function lowerRaised(identity: string) {
    if (!connected || !canManage || !identity || identity === room.localParticipant.identity) return;
    const message: HandCommandWireMessage = { type: "hand-command", id: crypto.randomUUID(), targetIdentity: identity, sentAt: Date.now() };
    await room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), { reliable: true, topic: HAND_TOPIC, destinationIdentities: [identity] });
    setRaisedIdentities((current) => { const next = new Set(current); next.delete(identity); return next; });
  }

  return { raisedIdentities, setRaised, lowerRaised };
}
