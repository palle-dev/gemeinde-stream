import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DoorOpen, LogOut, Plus, Users } from "lucide-react";
import { Room, RoomEvent } from "livekit-client";
import { base44 } from "../lib/base44";

const BREAKOUT_TOPIC = "gemeinde-stream.breakout.v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface BreakoutParticipant {
  identity: string;
  name: string;
  isLocal: boolean;
  role?: string;
}

export interface BreakoutAssignment {
  breakoutId: string;
  breakoutName: string;
  active: boolean;
}

interface BreakoutCredentials extends BreakoutAssignment {
  serverUrl: string;
  participantToken: string;
}

interface BreakoutWire { type: "refresh" | "close"; id: string; sentAt: number; }

function unwrap<T>(response: T | { data: T }): T {
  return response && typeof response === "object" && "data" in response ? (response as { data: T }).data : response as T;
}

function isModerator(metadata?: string): boolean {
  try { return ["host", "cohost", "operator"].includes(JSON.parse(metadata || "{}").role); }
  catch { return false; }
}

export function parseBreakoutWire(payload: Uint8Array): BreakoutWire | null {
  try {
    const value = JSON.parse(decoder.decode(payload)) as Record<string, unknown>;
    if (!value || (value.type !== "refresh" && value.type !== "close") || typeof value.id !== "string" || !/^[a-zA-Z0-9-]{8,100}$/.test(value.id) || typeof value.sentAt !== "number" || !Number.isFinite(value.sentAt) || Math.abs(Date.now() - value.sentAt) > 60_000) return null;
    return { type: value.type, id: value.id, sentAt: value.sentAt };
  } catch { return null; }
}

function safeAssignment(value: unknown): BreakoutAssignment | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Der Server hat eine ungültige Kleingruppenzuweisung geliefert.");
  const assignment = value as Record<string, unknown>;
  if (typeof assignment.breakoutId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/.test(assignment.breakoutId)
    || typeof assignment.breakoutName !== "string" || !assignment.breakoutName.trim() || assignment.breakoutName.length > 50 || /[\u0000-\u001f\u007f]/.test(assignment.breakoutName)
    || typeof assignment.active !== "boolean") throw new Error("Der Server hat eine ungültige Kleingruppenzuweisung geliefert.");
  return { breakoutId: assignment.breakoutId, breakoutName: assignment.breakoutName, active: assignment.active };
}

export function safeBreakoutStatus(value: unknown): { assignment: BreakoutAssignment | null; activeCount?: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Der Server hat einen ungültigen Kleingruppenstatus geliefert.");
  const status = value as Record<string, unknown>;
  if (status.activeCount !== undefined && (!Number.isSafeInteger(status.activeCount) || Number(status.activeCount) < 0 || Number(status.activeCount) > 500)) throw new Error("Der Server hat einen ungültigen Kleingruppenstatus geliefert.");
  return { assignment: safeAssignment(status.assignment), ...(status.activeCount === undefined ? {} : { activeCount: Number(status.activeCount) }) };
}

export function safeBreakoutCredentials(value: unknown): BreakoutCredentials {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Der Server hat einen ungültigen Kleingruppenzugang geliefert.");
  const credentials = value as Record<string, unknown>;
  const assignment = safeAssignment(credentials);
  let protocol = "";
  try { protocol = new URL(String(credentials.serverUrl || "")).protocol; } catch { /* handled below */ }
  if (!assignment?.active || typeof credentials.serverUrl !== "string" || credentials.serverUrl.length > 500 || !["ws:", "wss:"].includes(protocol)
    || typeof credentials.participantToken !== "string" || credentials.participantToken.length < 20 || credentials.participantToken.length > 8_192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(credentials.participantToken)) throw new Error("Der Server hat einen ungültigen Kleingruppenzugang geliefert.");
  return { ...assignment, serverUrl: credentials.serverUrl, participantToken: credentials.participantToken };
}

export function distributeParticipants(participants: BreakoutParticipant[], roomCount: number): Record<string, string> {
  const count = Math.max(2, Math.min(8, Math.floor(roomCount)));
  return Object.fromEntries(participants.filter((participant) => !participant.isLocal && !["host", "cohost", "operator"].includes(participant.role || "")).map((participant, index) => [participant.identity, `room-${index % count + 1}`]));
}

export function useBreakoutRooms({ room, eventId, guestSession, connected, canManage, onJoin, onReturn }: {
  room: Room;
  eventId: string;
  guestSession?: string;
  connected: boolean;
  canManage: boolean;
  onJoin: (credentials: BreakoutCredentials) => Promise<void>;
  onReturn: (assignmentAlreadyClosed?: boolean) => Promise<void>;
}) {
  const [current, setCurrent] = useState<BreakoutAssignment | null>(null);
  const currentRef = useRef<BreakoutAssignment | null>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const request = useCallback(async <T,>(action: string, values: Record<string, unknown> = {}) => unwrap(await base44.functions.invoke("breakout-room", { action, eventId, guestSession, ...values }) as T | { data: T }), [eventId, guestSession]);

  useEffect(() => { currentRef.current = current; }, [current]);

  const refreshAssignment = useCallback(() => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    const operation = (async () => {
      try {
        const result = safeBreakoutStatus(await request<unknown>("status"));
        if (typeof result.activeCount === "number") setActiveCount(result.activeCount);
        if (!result.assignment?.active) {
          if (currentRef.current) { await onReturn(true); currentRef.current = null; setCurrent(null); }
          setError("");
          return;
        }
        if (currentRef.current?.breakoutId === result.assignment.breakoutId) return;
        const credentials = safeBreakoutCredentials(await request<unknown>("token"));
        if (credentials.breakoutId !== result.assignment.breakoutId) throw new Error("Die Kleingruppenzuweisung hat sich während des Raumwechsels geändert.");
        await onJoin(credentials);
        currentRef.current = result.assignment;
        setCurrent(result.assignment);
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Breakout-Raum konnte nicht geladen werden.");
      }
    })().finally(() => { if (refreshPromiseRef.current === operation) refreshPromiseRef.current = null; });
    refreshPromiseRef.current = operation;
    return operation;
  }, [onJoin, onReturn, request]);

  useEffect(() => {
    if (!connected) return;
    const receive = (payload: Uint8Array, participant?: { metadata?: string }, _kind?: unknown, topic?: string) => {
      if (topic !== BREAKOUT_TOPIC || !isModerator(participant?.metadata) || !parseBreakoutWire(payload)) return;
      void refreshAssignment();
    };
    room.on(RoomEvent.DataReceived, receive);
    if (!current) void refreshAssignment();
    return () => { room.off(RoomEvent.DataReceived, receive); };
  }, [connected, current, refreshAssignment, room]);

  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => void refreshAssignment(), current ? 4_000 : 10_000);
    return () => window.clearInterval(timer);
  }, [connected, current, refreshAssignment]);

  const publish = useCallback(async (type: BreakoutWire["type"]) => {
    const message: BreakoutWire = { type, id: crypto.randomUUID(), sentAt: Date.now() };
    await room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), { reliable: true, topic: BREAKOUT_TOPIC });
  }, [room]);

  async function start(assignments: Record<string, string>, roomNames: Record<string, string>) {
    if (!canManage) return;
    setBusy(true); setError("");
    try {
      const result = await request<{ configured: number; activeCount?: number }>("configure", { assignments: Object.entries(assignments).map(([participantIdentity, breakoutId]) => ({ participantIdentity, breakoutId, breakoutName: roomNames[breakoutId] })) });
      setActiveCount(result.activeCount ?? result.configured);
      await publish("refresh");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Breakout-Räume konnten nicht gestartet werden."); }
    finally { setBusy(false); }
  }

  async function closeAll() {
    if (!canManage) return;
    setBusy(true); setError("");
    try { await request("close"); setActiveCount(0); await publish("close"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Breakout-Räume konnten nicht beendet werden."); }
    finally { setBusy(false); }
  }

  async function returnNow() {
    setBusy(true); setError("");
    try { await request("leave"); await onReturn(true); currentRef.current = null; setCurrent(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Rückkehr in den Hauptraum ist fehlgeschlagen."); }
    finally { setBusy(false); }
  }

  return { current, activeCount, busy, error, start, closeAll, returnNow };
}

export function BreakoutRoomsPanel({ participants, connected, canManage, current, activeCount, busy, error, onStart, onClose, onReturn }: {
  participants: BreakoutParticipant[];
  connected: boolean;
  canManage: boolean;
  current: BreakoutAssignment | null;
  activeCount: number | null;
  busy: boolean;
  error: string;
  onStart: (assignments: Record<string, string>, roomNames: Record<string, string>) => Promise<void>;
  onClose: () => Promise<void>;
  onReturn: () => Promise<void>;
}) {
  const eligible = useMemo(() => participants.filter((participant) => !participant.isLocal && !["host", "cohost", "operator"].includes(participant.role || "")), [participants]);
  const [roomCount, setRoomCount] = useState(2);
  const [roomNames, setRoomNames] = useState<Record<string, string>>({ "room-1": "Kleingruppe 1", "room-2": "Kleingruppe 2" });
  const [assignments, setAssignments] = useState<Record<string, string>>(() => distributeParticipants(eligible, roomCount));

  useEffect(() => {
    setRoomNames((previous) => Object.fromEntries(Array.from({ length: roomCount }, (_, index) => {
      const id = `room-${index + 1}`; return [id, previous[id] || `Kleingruppe ${index + 1}`];
    })));
    setAssignments(distributeParticipants(eligible, roomCount));
  }, [eligible, roomCount]);

  if (current) return <div className="breakout-current"><DoorOpen /><h3>{current.breakoutName}</h3><p>Sie befinden sich in einer Kleingruppe. Sobald die Moderation sie beendet, kehren Sie automatisch zurück.</p><button onClick={() => void onReturn()}><LogOut /> Jetzt zum Hauptraum</button>{error && <small>{error}</small>}</div>;
  if (!canManage) return <div className="poll-empty"><Users /><p>Aktuell sind keine Kleingruppen für Sie geöffnet.</p></div>;

  return <div className="breakout-panel"><div className="breakout-settings"><label>Anzahl Räume<input type="number" min={2} max={8} value={roomCount} onChange={(event) => setRoomCount(Math.max(2, Math.min(8, Number(event.target.value))))} /></label><button type="button" onClick={() => setRoomCount((count) => Math.min(8, count + 1))} disabled={roomCount >= 8}><Plus /> Raum</button></div>{activeCount !== null && activeCount > 0 && <div className="breakout-active-count">{activeCount} aktive Zuweisung(en)</div>}<div className="breakout-room-names">{Object.entries(roomNames).map(([id, name]) => <input key={id} value={name} maxLength={50} aria-label={`${id} benennen`} onChange={(event) => setRoomNames((currentNames) => ({ ...currentNames, [id]: event.target.value }))} />)}</div><div className="breakout-assignments">{eligible.length ? eligible.map((participant) => <label key={participant.identity}><span>{participant.name}</span><select value={assignments[participant.identity] || "room-1"} onChange={(event) => setAssignments((currentAssignments) => ({ ...currentAssignments, [participant.identity]: event.target.value }))}>{Object.entries(roomNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>) : <p className="side-empty">Weitere Teilnehmer erscheinen hier.</p>}</div><button className="breakout-start" disabled={!connected || busy || eligible.length === 0 || Object.values(roomNames).some((name) => !name.trim())} onClick={() => void onStart(assignments, roomNames)}><DoorOpen /> {busy ? "Wird gestartet …" : activeCount !== null && activeCount > 0 ? "Zuweisungen neu starten" : "Kleingruppen starten"}</button><button className="breakout-close" disabled={!connected || busy || activeCount === 0} onClick={() => void onClose()}><LogOut /> Alle zurückholen</button>{error && <small className="recorder-error">{error}</small>}</div>;
}
