import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, CirclePlay, Plus, Trash2 } from "lucide-react";
import { base44 } from "../lib/base44";

export type RundownKind = "welcome" | "music" | "speech" | "prayer" | "media" | "announcement" | "other";
export type RundownStatus = "pending" | "live" | "done";
export interface RundownItem { id: string; event_id: string; title: string; notes?: string; kind: RundownKind; position: number; duration_seconds: number; status: RundownStatus }
type Envelope<T> = T | { data: T };
const labels: Record<RundownKind, string> = { welcome: "Begrüßung", music: "Musik", speech: "Wortbeitrag", prayer: "Gebet", media: "Medien", announcement: "Abkündigung", other: "Sonstiges" };

function unwrap<T>(value: Envelope<T>): T { return typeof value === "object" && value !== null && "data" in value ? (value as { data: T }).data : value as T; }
export function formatRundownDuration(seconds: number): string { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }

export function RundownPanel({ eventId, canControl }: { eventId: string; canControl: boolean }) {
  const [items, setItems] = useState<RundownItem[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<RundownKind>("music");
  const [minutes, setMinutes] = useState(5);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    base44.functions.invoke("manage-rundown", { eventId, action: "list" })
      .then((value) => setItems(unwrap(value as Envelope<{ items: RundownItem[] }>).items))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Ablaufplan konnte nicht geladen werden."));
  }, [eventId]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      const result = unwrap(await base44.functions.invoke("manage-rundown", { eventId, action: "create", title, kind, durationSeconds: Math.max(0, minutes * 60) }) as Envelope<{ item: RundownItem }>);
      setItems((current) => [...current, result.item]); setTitle(""); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Programmpunkt konnte nicht angelegt werden."); }
  }
  async function setStatus(item: RundownItem, status: RundownStatus) {
    try {
      const result = unwrap(await base44.functions.invoke("manage-rundown", { eventId, action: "status", itemId: item.id, status }) as Envelope<{ item: RundownItem }>);
      setItems((current) => current.map((candidate) => candidate.id === item.id ? result.item : status === "live" && candidate.status === "live" ? { ...candidate, status: "done" } : candidate));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Status konnte nicht geändert werden."); }
  }
  async function move(item: RundownItem, direction: "up" | "down") {
    try {
      const result = unwrap(await base44.functions.invoke("manage-rundown", { eventId, action: "move", itemId: item.id, direction }) as Envelope<{ items: RundownItem[] }>);
      setItems(result.items);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Reihenfolge konnte nicht geändert werden."); }
  }
  async function remove(item: RundownItem) {
    try { await base44.functions.invoke("manage-rundown", { eventId, action: "delete", itemId: item.id }); setItems((current) => current.filter((candidate) => candidate.id !== item.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Programmpunkt konnte nicht gelöscht werden."); }
  }

  return <section className="rundown-panel"><button className="rundown-heading" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><span><b>Gottesdienst-Ablauf</b><small>{items.length} Programmpunkte</small></span><span aria-hidden="true">{expanded ? "−" : "+"}</span></button>{expanded && <><div className="rundown-list">{items.map((item, index) => <article key={item.id} className={`rundown-item ${item.status}`}><button className="rundown-state" aria-label={`${item.title}: ${item.status === "pending" ? "als aktuellen Programmpunkt markieren" : "als erledigt markieren"}`} title={item.status === "pending" ? "Als aktuell markieren" : "Als erledigt markieren"} disabled={!canControl} onClick={() => void setStatus(item, item.status === "pending" ? "live" : "done")}>{item.status === "live" ? <CirclePlay /> : item.status === "done" ? <Check /> : <span>{index + 1}</span>}</button><div><b>{item.title}</b><small>{labels[item.kind]} · {formatRundownDuration(item.duration_seconds)}</small></div>{canControl && <div className="rundown-actions"><button aria-label={`${item.title} nach oben verschieben`} title="Nach oben verschieben" disabled={index === 0} onClick={() => void move(item, "up")}><ArrowUp /></button><button aria-label={`${item.title} nach unten verschieben`} title="Nach unten verschieben" disabled={index === items.length - 1} onClick={() => void move(item, "down")}><ArrowDown /></button><button aria-label={`${item.title} löschen`} title="Programmpunkt löschen" onClick={() => void remove(item)}><Trash2 /></button></div>}</article>)}</div>{items.length === 0 && <p className="rundown-empty">Noch keine Programmpunkte.</p>}{canControl && <form className="rundown-add" onSubmit={add}><input aria-label="Titel des neuen Programmpunkts" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Neuer Programmpunkt" maxLength={120} required /><div><select aria-label="Art des neuen Programmpunkts" value={kind} onChange={(event) => setKind(event.target.value as RundownKind)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input aria-label="Dauer in Minuten" type="number" min={0} max={240} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} title="Dauer in Minuten" /><button aria-label="Programmpunkt hinzufügen" title="Hinzufügen"><Plus /></button></div></form>}{error && <div className="inline-error">{error}</div>}</>}</section>;
}
