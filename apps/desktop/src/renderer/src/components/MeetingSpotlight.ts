import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import { base44 } from "../lib/base44";
import { participantRole } from "./MeetingModeration";

const SPOTLIGHT_TOPIC = "gemeinde-stream.spotlight.v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface MeetingSpotlightState { key: string | null; revision: number; updatedAt: string }
interface SpotlightRefreshSignal { type: "refresh"; id: string; revision: number; sentAt: number }

export function normalizeSpotlightState(value: unknown): MeetingSpotlightState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!(candidate.key === null || candidate.key === "" || typeof candidate.key === "string") || !Number.isSafeInteger(candidate.revision) || Number(candidate.revision) < 0 || typeof candidate.updatedAt !== "string") return null;
  const key = candidate.key === null || candidate.key === "" ? null : candidate.key;
  const revision = Number(candidate.revision);
  const updatedAt = candidate.updatedAt;
  if ((key && (key.length > 240 || !/^.+-(?:camera|screen)$/.test(key) || /[\u0000-\u001f\u007f]/.test(key)))
    || (revision === 0 && (key !== null || updatedAt !== "")) || (revision > 0 && (!updatedAt || Number.isNaN(Date.parse(updatedAt))))) return null;
  return { key, revision, updatedAt };
}

export function parseSpotlightRefreshSignal(payload: Uint8Array, now = Date.now()): SpotlightRefreshSignal | null {
  try {
    const value = JSON.parse(decoder.decode(payload)) as Record<string, unknown>;
    if (!value || value.type !== "refresh" || typeof value.id !== "string" || !/^[a-zA-Z0-9-]{8,100}$/.test(value.id) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1
      || typeof value.sentAt !== "number" || !Number.isFinite(value.sentAt) || Math.abs(now - value.sentAt) > 60_000) return null;
    return { type: "refresh", id: value.id, revision: Number(value.revision), sentAt: value.sentAt };
  } catch { return null; }
}

export function newerSpotlightState(current: MeetingSpotlightState, next: MeetingSpotlightState): MeetingSpotlightState {
  if (next.revision > current.revision) return next;
  if (next.revision === current.revision && Date.parse(next.updatedAt || "1970-01-01") > Date.parse(current.updatedAt || "1970-01-01")) return next;
  return current;
}

function unwrap<T>(response: unknown): T { return response && typeof response === "object" && "data" in response ? (response as { data: T }).data : response as T; }
function canSendSpotlight(metadata?: string): boolean { return ["host", "cohost", "operator"].includes(participantRole(metadata)); }

export function useMeetingSpotlight(room: Room, connected: boolean, eventId: string, guestSession: string | undefined, canManage: boolean) {
  const [state, setState] = useState<MeetingSpotlightState>({ key: null, revision: 0, updatedAt: "" });
  const [error, setError] = useState("");
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const mutationRef = useRef(false);
  const requestVersionRef = useRef(0);
  const lastSignalRefreshRef = useRef(0);
  const apply = useCallback((value: unknown) => {
    const next = normalizeSpotlightState(value);
    if (next) setState((current) => newerSpotlightState(current, next));
  }, []);

  const refresh = useCallback(() => {
    if (mutationRef.current) return Promise.resolve();
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    const version = ++requestVersionRef.current;
    const operation = (async () => {
      try {
        const result = unwrap<{ state?: unknown }>(await base44.functions.invoke("meeting-spotlight", { action: "get", eventId, guestSession }));
        const next = normalizeSpotlightState(result.state);
        if (!next) throw new Error("Der Spotlight-Zustand des Servers ist ungültig");
        if (version === requestVersionRef.current) { apply(next); setError(""); }
      } catch (cause) { if (version === requestVersionRef.current) setError(cause instanceof Error ? cause.message : "Spotlight konnte nicht geladen werden"); }
    })().finally(() => { if (refreshPromiseRef.current === operation) refreshPromiseRef.current = null; });
    refreshPromiseRef.current = operation;
    return operation;
  }, [apply, eventId, guestSession]);

  useEffect(() => {
    if (!connected) return;
    const receive = (payload: Uint8Array, participant?: { metadata?: string }, _kind?: unknown, topic?: string) => {
      if (topic !== SPOTLIGHT_TOPIC || !canSendSpotlight(participant?.metadata)) return;
      const signal = parseSpotlightRefreshSignal(payload);
      if (!signal || Date.now() - lastSignalRefreshRef.current < 1_500) return;
      lastSignalRefreshRef.current = Date.now();
      const pending = refreshPromiseRef.current;
      if (pending) void pending.then(() => refresh()); else void refresh();
    };
    room.on(RoomEvent.DataReceived, receive);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 12_000);
    return () => { window.clearInterval(timer); room.off(RoomEvent.DataReceived, receive); };
  }, [connected, refresh, room]);

  const setSpotlight = useCallback(async (key: string | null) => {
    if (!connected || !canManage || mutationRef.current) return;
    mutationRef.current = true;
    ++requestVersionRef.current;
    try {
      const result = unwrap<{ state?: unknown }>(await base44.functions.invoke("meeting-spotlight", { action: "set", eventId, key: key ?? "" }));
      const next = normalizeSpotlightState(result.state);
      if (!next) throw new Error("Der Spotlight-Zustand des Servers ist ungültig");
      apply(next);
      try {
        const signal: SpotlightRefreshSignal = { type: "refresh", id: crypto.randomUUID(), revision: next.revision, sentAt: Date.now() };
        await room.localParticipant.publishData(encoder.encode(JSON.stringify(signal)), { reliable: true, topic: SPOTLIGHT_TOPIC });
        setError("");
      } catch { setError("Spotlight wurde gespeichert und wird beim nächsten Abgleich übernommen."); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Spotlight konnte nicht geändert werden"); }
    finally { mutationRef.current = false; }
  }, [apply, canManage, connected, eventId, room]);

  return { state, error, setSpotlight };
}
