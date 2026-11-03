import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, Download, Plus, Square, Trash2 } from "lucide-react";
import { Room, RoomEvent } from "livekit-client";
import { base44 } from "../lib/base44";

const POLL_TOPIC = "gemeinde-stream.poll.v1";
const encoder = new TextEncoder(); const decoder = new TextDecoder();
export interface PollOption { id: string; label: string; }
export interface MeetingPoll { id: string; question: string; options: PollOption[]; open: boolean; showResultsWhileOpen: boolean; resultsVisible: boolean; votes: Record<string, string>; selectedOptionId?: string; updatedAt?: string; }
type PollWire = { type: "open"; poll: { id: string; question: string; options: PollOption[]; open: boolean } } | { type: "refresh"; pollId: string } | { type: "close"; pollId: string } | { type: "sync_request" } | { type: "sync"; poll: null };

function moderator(metadata?: string): boolean { try { return ["host", "cohost", "operator"].includes(JSON.parse(metadata || "{}").role); } catch { return false; } }
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function validId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 128; }

export function safeMeetingPoll(value: unknown): MeetingPoll | null {
  if (value === null) return null;
  if (!record(value) || !validId(value.id) || typeof value.question !== "string" || !value.question.trim() || value.question.length > 200 || /[\u0000-\u001f\u007f]/.test(value.question) || typeof value.open !== "boolean"
    || !Array.isArray(value.options) || value.options.length < 2 || value.options.length > 6 || !record(value.votes) || Object.keys(value.votes).length > 500) throw new Error("Der Server hat eine ungültige Umfrage geliefert.");
  if (value.options.some((option) => !record(option) || !validId(option.id) || typeof option.label !== "string" || !option.label.trim() || option.label.length > 100 || /[\u0000-\u001f\u007f]/.test(option.label))) throw new Error("Der Server hat eine ungültige Umfrage geliefert.");
  const options = value.options as unknown as PollOption[];
  const optionIds = new Set(options.map((option) => option.id));
  if (optionIds.size !== options.length || new Set(options.map((option) => option.label.trim().toLocaleLowerCase("de-DE"))).size !== options.length
    || Object.entries(value.votes).some(([key, optionId]) => !validId(key) || typeof optionId !== "string" || !optionIds.has(optionId))
    || (value.selectedOptionId !== undefined && (typeof value.selectedOptionId !== "string" || !optionIds.has(value.selectedOptionId)))) throw new Error("Der Server hat eine ungültige Umfrage geliefert.");
  if ((value.resultsVisible !== undefined && typeof value.resultsVisible !== "boolean") || (value.showResultsWhileOpen !== undefined && typeof value.showResultsWhileOpen !== "boolean") || (value.updatedAt !== undefined && (typeof value.updatedAt !== "string" || Number.isNaN(Date.parse(value.updatedAt))))) throw new Error("Der Server hat eine ungültige Umfrage geliefert.");
  return { id: value.id, question: value.question, options: options.map((option) => ({ id: option.id, label: option.label })), open: value.open, showResultsWhileOpen: value.showResultsWhileOpen !== false, resultsVisible: value.resultsVisible !== false, votes: { ...value.votes } as Record<string, string>, ...(typeof value.selectedOptionId === "string" ? { selectedOptionId: value.selectedOptionId } : {}), ...(typeof value.updatedAt === "string" ? { updatedAt: value.updatedAt } : {}) };
}

function safePollResponse(value: unknown): { poll: MeetingPoll | null } {
  if (!record(value) || !("poll" in value)) throw new Error("Der Server hat eine ungültige Umfrageantwort geliefert.");
  return { poll: safeMeetingPoll(value.poll) };
}
export function safePollHistoryResponse(value: unknown): MeetingPoll[] {
  if (!record(value) || !Array.isArray(value.history) || value.history.length > 100) throw new Error("Der Server hat eine ungültige Umfragehistorie geliefert.");
  return value.history.map((entry) => { const poll = safeMeetingPoll(entry); if (!poll || poll.open || !poll.resultsVisible) throw new Error("Der Server hat eine ungültige Umfragehistorie geliefert."); return poll; });
}
export function parsePollWire(payload: Uint8Array): PollWire | null {
  try {
    const value: unknown = JSON.parse(decoder.decode(payload));
    if (!record(value) || typeof value.type !== "string") return null;
    if (value.type === "sync_request") return { type: "sync_request" };
    if (value.type === "refresh" || value.type === "close") return validId(value.pollId) ? { type: value.type, pollId: value.pollId } : null;
    if (value.type === "sync") return value.poll === null ? { type: "sync", poll: null } : null;
    if (value.type !== "open") return null;
    const poll = value.poll;
    if (!record(poll) || !validId(poll.id) || typeof poll.question !== "string" || !poll.question.trim() || poll.question.length > 200 || typeof poll.open !== "boolean" || !Array.isArray(poll.options) || poll.options.length < 2 || poll.options.length > 6) return null;
    if (poll.options.some((option) => !record(option) || !validId(option.id) || typeof option.label !== "string" || !option.label.trim() || option.label.length > 100)) return null;
    const options = poll.options as unknown as PollOption[];
    const optionIds = new Set(options.map((option) => option.id));
    if (optionIds.size !== options.length || new Set(options.map((option) => option.label.trim().toLocaleLowerCase("de-DE"))).size !== options.length) return null;
    return { type: "open", poll: { id: poll.id, question: poll.question, open: poll.open, options } };
  } catch { return null; }
}

export function pollCounts(poll: MeetingPoll): Record<string, number> { const counts = Object.fromEntries(poll.options.map((option) => [option.id, 0])); Object.values(poll.votes).forEach((optionId) => { if (optionId in counts) counts[optionId] += 1; }); return counts; }
export function pollTotal(poll: MeetingPoll): number { return Object.values(pollCounts(poll)).reduce((total, count) => total + count, 0); }
function pollCsvCell(value: string | number): string { const raw = String(value); const safe = /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw; return `"${safe.replace(/"/g, '""')}"`; }
export function meetingPollCsv(poll: MeetingPoll): string {
  const counts = pollCounts(poll); const total = pollTotal(poll); const selectedLabel = poll.options.find((option) => option.id === poll.selectedOptionId)?.label || "";
  const header = ["Frage", "Status", "Antwort", "Stimmen", "Anteil (Prozent)", "Eigene Auswahl"];
  const rows = poll.options.map((option) => [poll.question, poll.open ? "Läuft" : "Beendet", option.label, counts[option.id] || 0, total ? Math.round((counts[option.id] || 0) / total * 100) : 0, selectedLabel]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(pollCsvCell).join(";")).join("\r\n")}`;
}
function unwrap<T>(response: unknown): T { return response && typeof response === "object" && "data" in response ? (response as { data: T }).data : response as T; }

export function useMeetingPoll(room: Room, connected: boolean, eventId: string, guestSession: string | undefined, canManage: boolean) {
  const [poll, setPoll] = useState<MeetingPoll | null>(null); const pollRef = useRef<MeetingPoll | null>(null);
  const refreshNotBeforeRef = useRef(0);
  const requestVersionRef = useRef(0);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<MeetingPoll[]>([]);
  const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  useEffect(() => { pollRef.current = poll; }, [poll]);
  const publish = useCallback(async (message: PollWire) => { await room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), { reliable: true, topic: POLL_TOPIC }); }, [room]);
  const request = useCallback(async (action: string, values: Record<string, unknown> = {}) => safePollResponse(unwrap<unknown>(await base44.functions.invoke("meeting-poll", { eventId, guestSession, action, ...values }))), [eventId, guestSession]);
  const refreshHistory = useCallback(async () => { try { setHistory(safePollHistoryResponse(unwrap<unknown>(await base44.functions.invoke("meeting-poll", { eventId, guestSession, action: "history" })))); } catch (cause) { setError(cause instanceof Error ? cause.message : "Umfragehistorie konnte nicht geladen werden."); } }, [eventId, guestSession]);
  const refresh = useCallback(() => {
    if (busyRef.current) return Promise.resolve();
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    const version = ++requestVersionRef.current;
    const operation = (async () => {
      try { const result = await request("get"); if (version === requestVersionRef.current) { setPoll(result.poll); setError(""); } }
      catch (cause) { if (version === requestVersionRef.current) setError(cause instanceof Error ? cause.message : "Umfrage konnte nicht geladen werden."); }
    })().finally(() => { if (refreshPromiseRef.current === operation) refreshPromiseRef.current = null; });
    refreshPromiseRef.current = operation;
    return operation;
  }, [request]);
  useEffect(() => {
    if (!connected) { setPoll(null); return; }
    const receive = (payload: Uint8Array, participant?: { identity: string; metadata?: string }, _kind?: unknown, topic?: string) => {
      if (topic !== POLL_TOPIC || !participant?.identity) return; const message = parsePollWire(payload); if (!message) return;
      if (message.type === "sync_request") { if (canManage) void publish(pollRef.current ? { type: "refresh", pollId: pollRef.current.id } : { type: "sync", poll: null }); return; }
      if ((message.type === "open" || message.type === "sync" || message.type === "close") && moderator(participant.metadata)) { void refresh(); return; }
      if (message.type === "refresh" && Date.now() >= refreshNotBeforeRef.current) {
        refreshNotBeforeRef.current = Date.now() + 1_500;
        void refresh();
      }
    };
    room.on(RoomEvent.DataReceived, receive); void refresh(); void refreshHistory(); const syncTimer = window.setTimeout(() => void publish({ type: "sync_request" }), 400); const pollTimer = window.setInterval(() => void refresh(), 10_000);
    return () => { window.clearTimeout(syncTimer); window.clearInterval(pollTimer); room.off(RoomEvent.DataReceived, receive); };
  }, [canManage, connected, publish, refresh, refreshHistory, room]);
  const exclusive = useCallback(async (operation: () => Promise<void>) => { if (busyRef.current) return; busyRef.current = true; ++requestVersionRef.current; setBusy(true); try { await operation(); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Umfrageaktion fehlgeschlagen."); throw cause; } finally { busyRef.current = false; setBusy(false); } }, []);
  async function openPoll(question: string, labels: string[], showResultsWhileOpen: boolean) { if (!canManage) return; await exclusive(async () => { const result = await request("open", { question, options: labels, showResultsWhileOpen }); if (!result.poll) throw new Error("Umfrage konnte nicht angelegt werden."); setPoll(result.poll); await refreshHistory(); await publish({ type: "open", poll: { id: result.poll.id, question: result.poll.question, options: result.poll.options, open: true } }); }); }
  async function vote(optionId: string) { const current = pollRef.current; if (!current?.open || !current.options.some((option) => option.id === optionId)) return; await exclusive(async () => { const result = await request("vote", { optionId }); setPoll(result.poll); await publish({ type: "refresh", pollId: current.id }); }); }
  async function closePoll() { const current = pollRef.current; if (!canManage || !current) return; await exclusive(async () => { const result = await request("close"); setPoll(result.poll); await publish({ type: "close", pollId: current.id }); }); }
  async function clearPoll() { if (!canManage) return; await exclusive(async () => { await request("clear"); setPoll(null); await refreshHistory(); await publish({ type: "sync", poll: null }); }); }
  return { poll, history, error, busy, openPoll, vote, closePoll, clearPoll };
}

export function MeetingPollPanel({ poll, history = [], meetingTitle = "Meeting", canManage, connected, busy = false, error: remoteError, onOpen, onVote, onClose, onClear }: { poll: MeetingPoll | null; history?: MeetingPoll[]; meetingTitle?: string; canManage: boolean; connected: boolean; busy?: boolean; error?: string; onOpen: (question: string, options: string[], showResultsWhileOpen: boolean) => Promise<void>; onVote: (optionId: string) => Promise<void>; onClose: () => Promise<void>; onClear: () => Promise<void> }) {
  const [question, setQuestion] = useState(""); const [options, setOptions] = useState(["", ""]); const [showResultsWhileOpen, setShowResultsWhileOpen] = useState(false); const [error, setError] = useState(""); const counts = poll ? pollCounts(poll) : {}; const total = poll ? pollTotal(poll) : 0; const selected = poll?.selectedOptionId;
  async function create(event: React.FormEvent) { event.preventDefault(); try { await onOpen(question, options, showResultsWhileOpen); setQuestion(""); setOptions(["", ""]); setShowResultsWhileOpen(false); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Umfrage konnte nicht gestartet werden."); } }
  async function act(operation: () => Promise<void>) { try { await operation(); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Umfrageaktion fehlgeschlagen."); } }
  async function exportResults(target: MeetingPoll) { if (!target.resultsVisible) return; const safeTitle = meetingTitle.replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, "-").trim() || "Meeting"; const suffix = target.updatedAt ? `-${target.updatedAt.slice(0, 10)}` : ""; await window.desktop.saveTextFile(`${safeTitle}-Umfrage${suffix}.csv`, meetingPollCsv(target), "csv"); }
  const historyPanel = history.length > 0 && <div className="poll-history"><div><b>Frühere Umfragen</b><span>{history.length}</span></div>{history.map((entry) => <article key={entry.id}><span><b>{entry.question}</b><small>{entry.updatedAt ? new Date(entry.updatedAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "Archiviert"} · {pollTotal(entry)} Stimme(n)</small></span><button title="Ergebnis exportieren" disabled={busy} onClick={() => void act(() => exportResults(entry))}><Download /></button></article>)}</div>;
  if (!poll && !canManage) return <div className="poll-stack"><div className="poll-empty"><BarChart3 /><p>Aktuell läuft keine Umfrage.</p>{remoteError && <small className="recorder-error">{remoteError}</small>}</div>{historyPanel}</div>;
  if (!poll) return <div className="poll-stack"><form className="poll-create" onSubmit={create}><label>Frage<input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={200} placeholder="Ihre Frage" required disabled={busy} /></label>{options.map((option, index) => <label key={index}>Antwort {index + 1}<span><input value={option} onChange={(event) => setOptions((current) => current.map((value, position) => position === index ? event.target.value : value))} maxLength={100} required disabled={busy} />{options.length > 2 && <button type="button" title={`Antwort ${index + 1} entfernen`} disabled={busy} onClick={() => setOptions((current) => current.filter((_value, position) => position !== index))}><Trash2 size={15} /></button>}</span></label>)}<label className="poll-results-visibility"><input type="checkbox" checked={showResultsWhileOpen} onChange={(event) => setShowResultsWhileOpen(event.target.checked)} disabled={busy} /> Zwischenstände während der Abstimmung anzeigen</label><div className="poll-create-actions">{options.length < 6 && <button type="button" disabled={busy} onClick={() => setOptions((current) => [...current, ""])}><Plus /> Antwort</button>}<button className="primary" disabled={!connected || busy}>{busy ? "Wird gestartet …" : "Umfrage starten"}</button></div>{(error || remoteError) && <small className="recorder-error">{error || remoteError}</small>}</form>{historyPanel}</div>;
  return <div className="poll-stack"><div className="poll-active"><div className="poll-heading"><BarChart3 /><div><b>{poll.question}</b><span>{poll.open ? "Abstimmung läuft" : "Umfrage beendet"}{poll.resultsVisible ? `${canManage && poll.open && !poll.showResultsWhileOpen ? " · Zwischenstand nur für Moderation" : ""} · ${total} Stimme(n)` : " · Ergebnisse nach dem Ende sichtbar"}</span></div></div><div className="poll-options">{poll.options.map((option) => { const count = counts[option.id] || 0; const percentage = total ? Math.round(count / total * 100) : 0; return <button key={option.id} className={selected === option.id ? "selected" : ""} disabled={!poll.open || !connected || busy} onClick={() => void act(() => onVote(option.id))}><div><span>{option.label}</span><strong>{poll.resultsVisible ? `${count} · ${percentage}%` : selected === option.id ? "Ihre Auswahl" : "Verdeckt"}</strong></div>{poll.resultsVisible && <i><span style={{ width: `${percentage}%` }} /></i>}</button>; })}</div>{poll.resultsVisible && <button className="poll-export" disabled={busy} onClick={() => void act(() => exportResults(poll))}><Download /> Ergebnis exportieren</button>}{canManage && poll.open && <button className="poll-close" disabled={busy} onClick={() => void act(onClose)}><Square /> {busy ? "Wird beendet …" : "Abstimmung beenden"}</button>}{canManage && !poll.open && <button className="poll-close" disabled={busy} onClick={() => void act(onClear)}><Plus /> {busy ? "Wird vorbereitet …" : "Neue Umfrage"}</button>}{(error || remoteError) && <small className="recorder-error">{error || remoteError}</small>}</div>{historyPanel}</div>;
}
