import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Download, RefreshCw, X } from "lucide-react";
import { base44 } from "../lib/base44";

export interface AttendanceSession {
  id: string;
  participantIdentity: string;
  email?: string;
  displayName: string;
  role: string;
  guest: boolean;
  joinedAt: string;
  lastSeenAt: string;
  leftAt?: string;
  durationSeconds?: number;
}

export interface AttendanceRow {
  participantIdentity: string;
  displayName: string;
  email: string;
  role: string;
  guest: boolean;
  firstJoinedAt: string;
  lastLeftAt?: string;
  durationSeconds: number;
  visits: number;
  currentlyPresent: boolean;
}

function unwrap<T>(response: T | { data: T }): T {
  return response && typeof response === "object" && "data" in response ? (response as { data: T }).data : response as T;
}

const attendanceRoles = new Set(["host", "cohost", "operator", "speaker", "participant", "viewer"]);
export interface AttendanceReport { sessions: AttendanceSession[]; truncated: boolean; invalidRecords: number }
export function safeAttendanceReport(value: unknown): AttendanceReport {
  if (!value || typeof value !== "object") throw new Error("Der Server hat kein gültiges Anwesenheitsprotokoll geliefert.");
  const report = value as Record<string, unknown>;
  if (!Array.isArray(report.sessions) || report.sessions.length > 100_000) throw new Error("Der Server hat kein gültiges Anwesenheitsprotokoll geliefert.");
  const seen = new Set<string>(); let invalidRecords = Number.isInteger(report.invalidRecords) && Number(report.invalidRecords) >= 0 && Number(report.invalidRecords) <= 100_000 ? Number(report.invalidRecords) : 0;
  const sessions = report.sessions.flatMap((entry) => {
    if (!entry || typeof entry !== "object") { invalidRecords += 1; return []; }
    const session = entry as Record<string, unknown>; const joinedAt = typeof session.joinedAt === "string" ? Date.parse(session.joinedAt) : Number.NaN; const lastSeenAt = typeof session.lastSeenAt === "string" ? Date.parse(session.lastSeenAt) : Number.NaN; const leftAt = typeof session.leftAt === "string" ? Date.parse(session.leftAt) : undefined;
    const durationSeconds = session.durationSeconds === undefined ? 0 : session.durationSeconds;
    if (typeof session.id !== "string" || !session.id || session.id.length > 200 || seen.has(session.id) || typeof session.participantIdentity !== "string" || !session.participantIdentity || session.participantIdentity.length > 200 || typeof session.displayName !== "string" || !session.displayName.trim() || session.displayName.length > 80 || /[\u0000-\u001f\u007f]/.test(session.displayName) || (session.email !== undefined && session.email !== null && (typeof session.email !== "string" || session.email.length > 254)) || !attendanceRoles.has(String(session.role)) || typeof session.guest !== "boolean" || !Number.isFinite(joinedAt) || !Number.isFinite(lastSeenAt) || lastSeenAt < joinedAt || (leftAt !== undefined && (!Number.isFinite(leftAt) || leftAt < joinedAt)) || typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 2_678_400) { invalidRecords += 1; return []; }
    seen.add(session.id); return [{ id: session.id, participantIdentity: session.participantIdentity, email: typeof session.email === "string" ? session.email : "", displayName: session.displayName, role: String(session.role), guest: session.guest, joinedAt: String(session.joinedAt), lastSeenAt: String(session.lastSeenAt), leftAt: typeof session.leftAt === "string" ? session.leftAt : undefined, durationSeconds }];
  });
  return { sessions, truncated: report.truncated === true, invalidRecords };
}

export function aggregateAttendance(sessions: AttendanceSession[], now = Date.now()): AttendanceRow[] {
  const rows = new Map<string, AttendanceRow>();
  sessions.forEach((session) => {
    const fallbackDuration = Math.max(0, Math.round(((session.leftAt ? Date.parse(session.leftAt) : Math.min(now, Date.parse(session.lastSeenAt) + 45_000)) - Date.parse(session.joinedAt)) / 1000));
    const durationSeconds = Math.max(Number(session.durationSeconds) || 0, fallbackDuration);
    const existing = rows.get(session.participantIdentity);
    if (!existing) {
      rows.set(session.participantIdentity, { participantIdentity: session.participantIdentity, displayName: session.displayName, email: session.email || "", role: session.role, guest: session.guest, firstJoinedAt: session.joinedAt, lastLeftAt: session.leftAt, durationSeconds, visits: 1, currentlyPresent: !session.leftAt && now - Date.parse(session.lastSeenAt) < 90_000 });
      return;
    }
    existing.durationSeconds += durationSeconds;
    existing.visits += 1;
    existing.currentlyPresent ||= !session.leftAt && now - Date.parse(session.lastSeenAt) < 90_000;
    if (Date.parse(session.joinedAt) < Date.parse(existing.firstJoinedAt)) existing.firstJoinedAt = session.joinedAt;
    if (session.leftAt && (!existing.lastLeftAt || Date.parse(session.leftAt) > Date.parse(existing.lastLeftAt))) existing.lastLeftAt = session.leftAt;
    existing.displayName = session.displayName || existing.displayName;
    existing.role = session.role || existing.role;
  });
  return [...rows.values()].sort((left, right) => Date.parse(left.firstJoinedAt) - Date.parse(right.firstJoinedAt));
}

function csvCell(value: unknown): string {
  let text = String(value ?? "").replace(/\u0000/g, "");
  if (typeof value === "string" && /^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function attendanceCsv(rows: AttendanceRow[]): string {
  const header = ["Name", "E-Mail", "Rolle", "Gast", "Erster Beitritt", "Letztes Verlassen", "Dauer (Minuten)", "Beitritte", "Aktuell anwesend"];
  const lines = rows.map((row) => [row.displayName, row.email, row.role, row.guest ? "Ja" : "Nein", row.firstJoinedAt, row.lastLeftAt || "", Math.ceil(row.durationSeconds / 60), row.visits, row.currentlyPresent ? "Ja" : "Nein"].map(csvCell).join(";"));
  return `\uFEFF${header.join(";")}\r\n${lines.join("\r\n")}`;
}

export function useMeetingAttendance(eventId: string, guestSession: string | undefined, connected: boolean, displayName: string) {
  const [error, setError] = useState("");
  useEffect(() => {
    if (!connected) { setError(""); return; }
    let disposed = false; let joined = false; let leaveSent = false; let heartbeatBusy = false; let heartbeat: number | undefined;
    const values = { eventId, guestSession, displayName };
    const leave = () => { if (!joined || leaveSent) return; leaveSent = true; void base44.functions.invoke("meeting-attendance", { action: "leave", ...values }).catch(() => undefined); };
    const register = async () => {
      const value = unwrap(await base44.functions.invoke("meeting-attendance", { action: "join", ...values }) as unknown);
      if (!value || typeof value !== "object" || typeof (value as Record<string, unknown>).sessionId !== "string" || !(value as Record<string, unknown>).sessionId) throw new Error("Ungültige Anwesenheitssitzung");
      joined = true; leaveSent = false;
    };
    const pulse = async () => {
      if (heartbeatBusy || disposed) return; heartbeatBusy = true;
      try {
        const value = unwrap(await base44.functions.invoke("meeting-attendance", { action: "heartbeat", ...values }) as unknown);
        if (!value || typeof value !== "object" || typeof (value as Record<string, unknown>).active !== "boolean") throw new Error("Ungültige Heartbeat-Antwort");
        if (!(value as Record<string, unknown>).active) await register();
        if (!disposed) setError("");
      } catch { if (!disposed) setError("Das Anwesenheitsprotokoll kann die Verbindung derzeit nicht bestätigen."); }
      finally { heartbeatBusy = false; if (disposed) leave(); }
    };
    const join = register().then(() => {
      if (disposed) { leave(); return; }
      setError("");
      heartbeat = window.setInterval(() => { void pulse(); }, 30_000);
    }).catch(() => { if (!disposed) setError("Die Anwesenheit konnte nicht protokolliert werden."); });
    return () => {
      disposed = true;
      if (heartbeat !== undefined) window.clearInterval(heartbeat);
      void join.then(leave);
    };
  }, [connected, displayName, eventId, guestSession]);
  return error;
}

function durationLabel(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  return hours ? `${hours} Std. ${minutes} Min.` : `${minutes} Min.`;
}

export function MeetingAttendanceReport({ eventId, title, canManage }: { eventId: string; title: string; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const requestSequence = useRef(0);
  const rows = useMemo(() => aggregateAttendance(sessions), [sessions]);

  async function load() {
    const sequence = ++requestSequence.current; setLoading(true); setError(""); setWarning("");
    try { const value = unwrap(await base44.functions.invoke("meeting-attendance", { action: "report", eventId }) as unknown); if (sequence !== requestSequence.current) return; const result = safeAttendanceReport(value); setSessions(result.sessions); setWarning([result.truncated ? "Der Bericht wurde aus Sicherheitsgründen nach 100.000 Verbindungen begrenzt." : "", result.invalidRecords ? `${result.invalidRecords} beschädigte Einträge wurden ausgelassen.` : ""].filter(Boolean).join(" ")); }
    catch (cause) { if (sequence === requestSequence.current) setError(cause instanceof Error ? cause.message : "Anwesenheitsprotokoll konnte nicht geladen werden."); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }

  async function show() { setOpen(true); await load(); }
  async function exportCsv() {
    const safeTitle = title.replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, "-").trim() || "Meeting";
    try { await window.desktop.saveTextFile(`${safeTitle}-Anwesenheit.csv`, attendanceCsv(rows), "csv"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Das Anwesenheitsprotokoll konnte nicht gespeichert werden."); }
  }

  if (!canManage) return null;
  return <><button className="attendance-open" title="Anwesenheitsprotokoll" onClick={() => void show()}><ClipboardList size={14} /> Protokoll</button>{open && <div className="modal-backdrop attendance-backdrop"><section className="attendance-modal" role="dialog" aria-modal="true" aria-label="Anwesenheitsprotokoll"><header><div><ClipboardList /><span><b>Anwesenheitsprotokoll</b><small>{rows.length} Personen · {sessions.length} Verbindungen</small></span></div><button className="icon-button" onClick={() => { requestSequence.current += 1; setOpen(false); }}><X /></button></header><div className="attendance-actions"><button onClick={() => void load()} disabled={loading}><RefreshCw /> {loading ? "Lädt …" : "Aktualisieren"}</button><button onClick={() => void exportCsv()} disabled={!rows.length}><Download /> CSV exportieren</button></div>{error && <div className="error-banner">{error}</div>}{warning && <div className="attendance-warning">{warning}</div>}<div className="attendance-table"><div className="attendance-table-head"><span>Person</span><span>Beitritt</span><span>Dauer</span><span>Status</span></div>{rows.map((row) => <div className="attendance-row" key={row.participantIdentity}><span><b>{row.displayName}</b><small>{row.guest ? "Gast" : row.email || row.role} · {row.visits} Beitritt(e)</small></span><time>{new Date(row.firstJoinedAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</time><span>{durationLabel(row.durationSeconds)}</span><span className={row.currentlyPresent ? "present" : "left"}>{row.currentlyPresent ? "Anwesend" : "Verlassen"}</span></div>)}{!loading && !rows.length && <p className="side-empty">Noch keine Anwesenheitsdaten.</p>}</div></section></div>}</>;
}
