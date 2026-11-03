import { useCallback, useEffect, useRef, useState } from "react";
import { CheckSquare, Download, FileText, History, RefreshCw, RotateCcw, Save, X } from "lucide-react";
import { Room, RoomEvent } from "livekit-client";
import { base44 } from "../lib/base44";

export interface MeetingNote {
  content: string;
  revision: number;
  updatedBy: string;
  updatedAt: string;
}

type RemoteNoteAction = "replace" | "conflict" | "ignore";
const emptyNote: MeetingNote = { content: "", revision: 0, updatedBy: "", updatedAt: "" };
const NOTE_TOPIC = "gemeinde-stream.notes.v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface MeetingNoteSignal { type: "refresh"; id: string; revision: number; sentAt: number; }

export function safeMeetingNote(value: unknown): MeetingNote {
  if (!value || typeof value !== "object") throw new Error("Der Server hat ungültige Meetingnotizen geliefert.");
  const note = value as Record<string, unknown>;
  const empty = note.revision === 0 && note.content === "" && note.updatedBy === "" && note.updatedAt === "";
  if (typeof note.content !== "string" || note.content.length > 20_000 || !Number.isSafeInteger(note.revision) || Number(note.revision) < 0 || typeof note.updatedBy !== "string" || note.updatedBy.length > 80 || /[\u0000-\u001f\u007f]/.test(note.updatedBy) || typeof note.updatedAt !== "string" || (!empty && (Number(note.revision) < 1 || !note.updatedAt || Number.isNaN(Date.parse(note.updatedAt))))) throw new Error("Der Server hat ungültige Meetingnotizen geliefert.");
  return { content: note.content, revision: Number(note.revision), updatedBy: note.updatedBy, updatedAt: note.updatedAt };
}

export function safeMeetingNoteHistory(value: unknown): MeetingNote[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error("Der Server hat eine ungültige Notizhistorie geliefert.");
  const history = value.map(safeMeetingNote);
  if (history.some((version, index) => index > 0 && version.revision >= history[index - 1].revision)) throw new Error("Der Server hat eine ungültige Notizhistorie geliefert.");
  return history;
}

export function safeMeetingNoteDraft(value: unknown): MeetingNote | null {
  if (!value || typeof value !== "object") return null;
  const note = value as Record<string, unknown>;
  if (typeof note.content !== "string" || note.content.length > 20_000 || !Number.isSafeInteger(note.revision) || Number(note.revision) < 0 || typeof note.updatedBy !== "string" || note.updatedBy.length > 80 || /[\u0000-\u001f\u007f]/.test(note.updatedBy) || typeof note.updatedAt !== "string" || (note.updatedAt !== "" && Number.isNaN(Date.parse(note.updatedAt)))) return null;
  return { content: note.content, revision: Number(note.revision), updatedBy: note.updatedBy, updatedAt: note.updatedAt };
}

export function parseMeetingNoteSignal(payload: Uint8Array, now = Date.now()): MeetingNoteSignal | null {
  try {
    const value = JSON.parse(decoder.decode(payload)) as Record<string, unknown>;
    if (!value || value.type !== "refresh" || typeof value.id !== "string" || !/^[a-zA-Z0-9-]{8,100}$/.test(value.id) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 || typeof value.sentAt !== "number" || !Number.isFinite(value.sentAt) || Math.abs(now - value.sentAt) > 60_000) return null;
    return { type: "refresh", id: value.id, revision: Number(value.revision), sentAt: value.sentAt };
  } catch { return null; }
}

export function meetingNotesRetryDelayMs(attempt: number): number {
  return [2_000, 5_000, 10_000, 30_000][Math.max(0, Math.min(3, Math.floor(attempt) - 1))];
}

export function remoteMeetingNoteAction(local: MeetingNote, remote: MeetingNote, dirty: boolean, replaceRequested: boolean): RemoteNoteAction {
  if (dirty) {
    if (remote.content === local.content) return "replace";
    return remote.revision !== local.revision ? "conflict" : "ignore";
  }
  return replaceRequested || remote.revision !== local.revision || remote.content !== local.content ? "replace" : "ignore";
}

function readDraft(eventId: string): MeetingNote | null {
  try {
    return safeMeetingNoteDraft(JSON.parse(sessionStorage.getItem(`gemeinde-stream.meeting-note-draft.${eventId}`) || "null"));
  } catch { return null; }
}

function writeDraft(eventId: string, note: MeetingNote | null): void {
  try {
    const key = `gemeinde-stream.meeting-note-draft.${eventId}`;
    if (note) sessionStorage.setItem(key, JSON.stringify(note)); else sessionStorage.removeItem(key);
  } catch { /* Der Arbeitsspeicher-Entwurf bleibt weiterhin erhalten. */ }
}

function unwrap<T>(response: T | { data: T }): T {
  return response && typeof response === "object" && "data" in response ? (response as { data: T }).data : response as T;
}

export function meetingNotesDocument(title: string, note: MeetingNote): string {
  const heading = `# ${title.trim() || "Meetingnotizen"}`;
  const metadata = note.updatedAt ? `\n\n_Letzte Änderung: ${new Date(note.updatedAt).toLocaleString("de-DE")} durch ${note.updatedBy || "unbekannt"}_` : "";
  return `${heading}\n\n${note.content.trim()}${metadata}\n`;
}

export function MeetingNotes({ eventId, title, guestSession, connected, room }: { eventId: string; title: string; guestSession?: string; connected: boolean; room: Room }) {
  const initialDraft = useRef(readDraft(eventId)).current;
  const [note, setNote] = useState<MeetingNote>(initialDraft || emptyNote);
  const [canEdit, setCanEdit] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(Boolean(initialDraft));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<MeetingNote | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [history, setHistory] = useState<MeetingNote[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const noteRef = useRef(note);
  const dirtyRef = useRef(Boolean(initialDraft));
  const savingRef = useRef(false);
  const lastSignalRefreshRef = useRef(0);
  useEffect(() => { noteRef.current = note; }, [note]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const request = useCallback(async <T,>(action: string, values: Record<string, unknown> = {}) => unwrap(await base44.functions.invoke("meeting-notes", { action, eventId, guestSession, ...values }) as T | { data: T }), [eventId, guestSession]);

  const load = useCallback(async (replace = true) => {
    try {
      const result = await request<{ note: MeetingNote; canEdit: boolean }>("get");
      const remoteNote = safeMeetingNote(result.note);
      const action = remoteMeetingNoteAction(noteRef.current, remoteNote, dirtyRef.current, replace);
      if (action === "replace") {
        noteRef.current = remoteNote; setNote(remoteNote); dirtyRef.current = false; setDirty(false); setConflict(null); writeDraft(eventId, null);
      } else if (action === "conflict") setConflict(remoteNote);
      setCanEdit(result.canEdit === true); setLoaded(true); setError("");
      return remoteNote;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Notizen konnten nicht geladen werden."); return null; }
  }, [eventId, request]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!connected || dirty) return;
    const timer = window.setInterval(() => void load(false), 10_000);
    return () => window.clearInterval(timer);
  }, [connected, dirty, load]);
  useEffect(() => {
    if (!connected) return;
    const receive = (payload: Uint8Array, _participant?: unknown, _kind?: unknown, topic?: string) => {
      if (topic !== NOTE_TOPIC) return;
      const signal = parseMeetingNoteSignal(payload);
      if (!signal || (!dirtyRef.current && signal.revision <= noteRef.current.revision)) return;
      const now = Date.now(); if (now - lastSignalRefreshRef.current < 1_500) return;
      lastSignalRefreshRef.current = now; void load(false);
    };
    room.on(RoomEvent.DataReceived, receive);
    return () => { room.off(RoomEvent.DataReceived, receive); };
  }, [connected, load, room]);
  useEffect(() => {
    if (!dirty) return;
    const protectDraft = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [dirty]);

  const save = useCallback(async (content: string, expectedRevision: number) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setError("");
    try {
      const result = await request<{ note: MeetingNote; canEdit: boolean }>("save", { content, expectedRevision });
      const savedNote = safeMeetingNote(result.note);
      const remainsDirty = noteRef.current.content !== content;
      const next = { ...savedNote, content: noteRef.current.content };
      noteRef.current = next; setNote(next); dirtyRef.current = remainsDirty; setDirty(remainsDirty); setRetryAttempt(0);
      writeDraft(eventId, remainsDirty ? next : null);
      setConflict(null);
      const signal: MeetingNoteSignal = { type: "refresh", id: crypto.randomUUID(), revision: savedNote.revision, sentAt: Date.now() };
      void room.localParticipant.publishData(encoder.encode(JSON.stringify(signal)), { reliable: true, topic: NOTE_TOPIC }).catch(() => undefined);
    } catch (cause) {
      let retry = true;
      try {
        const remote = await request<{ note: MeetingNote; canEdit: boolean }>("get");
        const remoteNote = safeMeetingNote(remote.note);
        setCanEdit(remote.canEdit === true);
        if (remoteNote.content === content) {
          const remainsDirty = noteRef.current.content !== content;
          const next = { ...remoteNote, content: noteRef.current.content };
          noteRef.current = next; setNote(next); dirtyRef.current = remainsDirty; setDirty(remainsDirty); setConflict(null); setRetryAttempt(0); setError(""); writeDraft(eventId, remainsDirty ? next : null); return;
        } else if (remoteNote.revision !== expectedRevision) { setConflict(remoteNote); setRetryAttempt(0); retry = false; }
        else if (!remote.canEdit) retry = false;
      } catch { /* Preserve the local draft when the remote version cannot be loaded. */ }
      dirtyRef.current = true; setDirty(true); writeDraft(eventId, noteRef.current);
      if (retry) setRetryAttempt((attempt) => Math.min(4, attempt + 1));
      setError(cause instanceof Error ? cause.message : "Notizen konnten nicht gespeichert werden.");
    } finally { savingRef.current = false; setSaving(false); }
  }, [eventId, request, room]);

  useEffect(() => {
    if (!connected || !loaded || !canEdit || !dirty || conflict || saving) return;
    const snapshot = note.content; const revision = note.revision;
    const timer = window.setTimeout(() => void save(snapshot, revision), retryAttempt > 0 ? meetingNotesRetryDelayMs(retryAttempt) : 900);
    return () => window.clearTimeout(timer);
  }, [canEdit, conflict, connected, dirty, loaded, note.content, note.revision, retryAttempt, save, saving]);

  function update(content: string) { const next = { ...noteRef.current, content: content.slice(0, 20_000) }; noteRef.current = next; setNote(next); dirtyRef.current = true; setDirty(true); setRetryAttempt(0); setError(""); writeDraft(eventId, next); }
  function addTask() { update(`${note.content}${note.content && !note.content.endsWith("\n") ? "\n" : ""}- [ ] Neue Aufgabe`); }
  async function exportNotes() {
    const safeTitle = title.replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, "-").trim() || "Meeting";
    await window.desktop.saveTextFile(`${safeTitle}-Notizen.md`, meetingNotesDocument(title, note), "md");
  }
  async function openHistory() {
    setHistoryOpen(true); setHistoryLoading(true); setError("");
    try {
      const result = await request<{ history: unknown; canEdit: boolean }>("history");
      setHistory(safeMeetingNoteHistory(result.history)); setCanEdit(result.canEdit === true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Versionshistorie konnte nicht geladen werden."); }
    finally { setHistoryLoading(false); }
  }
  function restoreVersion(version: MeetingNote) { update(version.content); setHistoryOpen(false); }
  function acceptRemote() { if (!conflict) return; noteRef.current = conflict; setNote(conflict); setConflict(null); setError(""); dirtyRef.current = false; setDirty(false); setRetryAttempt(0); writeDraft(eventId, null); }
  async function overwriteRemote() { if (!conflict) return; const revision = conflict.revision; setConflict(null); setError(""); setRetryAttempt(0); await save(noteRef.current.content, revision); }

  return <div className="meeting-notes"><div className="notes-heading"><span><FileText /><b>Gemeinsame Notizen</b></span><small>{saving ? "Wird gespeichert …" : dirty ? retryAttempt > 0 ? "Nicht gespeichert · Neuversuch geplant" : "Nicht gespeichert" : note.updatedAt ? `Gespeichert · ${new Date(note.updatedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : "Bereit"}</small></div><div className="notes-actions"><button onClick={addTask} disabled={!canEdit}><CheckSquare /> Aufgabe</button>{dirty && !conflict && <button onClick={() => void save(note.content, note.revision)} disabled={saving || !connected || !canEdit}><Save /> Jetzt speichern</button>}<button onClick={() => void load()} disabled={dirty} title={dirty ? "Lokalen Entwurf zuerst speichern oder Konflikt auflösen" : "Serverfassung neu laden"}><RefreshCw /> Neu laden</button><button onClick={() => void openHistory()} disabled={historyLoading}><History /> Versionen</button><button onClick={() => void exportNotes()} disabled={!note.content.trim()}><Download /> Export</button></div>{historyOpen && <div className="notes-history"><div><b>Versionshistorie</b><button title="Schließen" onClick={() => setHistoryOpen(false)}><X /></button></div>{historyLoading ? <small>Versionen werden geladen …</small> : history.length > 0 ? history.map((version, index) => <article key={version.revision}><span><b>{index === 0 ? "Aktueller Stand" : new Date(version.updatedAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</b><small>{version.updatedBy} · Version {version.revision}</small><em>{version.content.trim().split("\n")[0]?.slice(0, 100) || "Leere Notiz"}</em></span><button title="Diese Version wiederherstellen" disabled={!canEdit || version.content === note.content} onClick={() => restoreVersion(version)}><RotateCcw /></button></article>) : <small>Noch keine gespeicherten Versionen.</small>}</div>}<textarea value={note.content} onChange={(event) => update(event.target.value)} disabled={!loaded || !canEdit} maxLength={20000} placeholder={canEdit ? "Beschlüsse, Gebetsanliegen und Aufgaben festhalten …\n\n- [ ] Nächster Schritt" : "Notizen werden geladen …"} />{note.updatedBy && <small className="notes-author">Zuletzt bearbeitet von {note.updatedBy}</small>}{conflict && <div className="notes-conflict"><b>Eine neuere Fassung liegt auf dem Server.</b><span>Ihre Eingabe bleibt erhalten. Wählen Sie bewusst eine Fassung.</span><div><button onClick={acceptRemote}>Serverfassung laden</button><button onClick={() => void overwriteRemote()}>Eigene Fassung übernehmen</button></div></div>}{error && <small className="recorder-error">{error}{retryAttempt > 0 && !conflict ? ` Automatischer Neuversuch in ${meetingNotesRetryDelayMs(retryAttempt) / 1_000} Sekunden.` : ""}</small>}</div>;
}
