import { useEffect, useState } from "react";
import { Check, Clipboard, Mail, Trash2, UserPlus, X } from "lucide-react";
import { base44 } from "../lib/base44";
import type { EventRecord, MembershipRecord } from "../domain";
import { roleLabel, type ParticipantRole } from "./MeetingModeration";
import type { AssignableRole } from "./RoomRoleManagement";

type FunctionEnvelope<T> = T | { data: T };
const roles: AssignableRole[] = ["cohost", "operator", "speaker", "participant", "viewer"];

function unwrap<T>(value: FunctionEnvelope<T>): T {
  return typeof value === "object" && value !== null && "data" in value ? (value as { data: T }).data : value as T;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Einladung konnte nicht verarbeitet werden.";
}

export function invitationText(event: EventRecord): string {
  const start = event.starts_at ? new Date(event.starts_at).toLocaleString("de-DE", { dateStyle: "full", timeStyle: "short" }) : "Termin nach Absprache";
  return [`Einladung: ${event.title}`, event.description || "", `Termin: ${start}`, `Raumcode: ${event.join_code}`, `Direkt beitreten: ${invitationLink(event)}`].filter(Boolean).join("\n");
}

export function invitationLink(event: EventRecord): string {
  return `gemeinde-stream://join/${encodeURIComponent(event.join_code)}`;
}

export function EventInvitations({ event, onClose }: { event: EventRecord; onClose: () => void }) {
  const [members, setMembers] = useState<MembershipRecord[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>(event.mode === "broadcast" ? "speaker" : "participant");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const result = unwrap(await base44.functions.invoke("manage-room-member", { eventId: event.id, action: "list" }) as FunctionEnvelope<{ members: MembershipRecord[] }>);
      setMembers(result.members);
      setError("");
    } catch (cause) { setError(messageOf(cause)); } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [event.id]);

  async function invite(formEvent: React.FormEvent) {
    formEvent.preventDefault(); setBusy(true); setError("");
    try {
      const result = unwrap(await base44.functions.invoke("manage-room-member", { eventId: event.id, action: "invite", email, role }) as FunctionEnvelope<{ member: MembershipRecord }>);
      setMembers((current) => [result.member, ...current.filter((member) => member.id !== result.member.id)]);
      setEmail("");
    } catch (cause) { setError(messageOf(cause)); } finally { setBusy(false); }
  }

  async function remove(member: MembershipRecord) {
    if (!window.confirm(`${member.user_email} aus der Veranstaltung entfernen?`)) return;
    try {
      await base44.functions.invoke("manage-room-member", { eventId: event.id, action: "remove", memberId: member.id });
      setMembers((current) => current.filter((item) => item.id !== member.id));
    } catch (cause) { setError(messageOf(cause)); }
  }

  async function copyInvitation() {
    await navigator.clipboard.writeText(invitationText(event));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return <div className="modal-backdrop invitation-backdrop"><section className="invitation-modal" role="dialog" aria-modal="true" aria-label="Teilnehmer einladen"><div className="invitation-heading"><div><UserPlus /><span><b>Teilnehmer einladen</b><small>{event.title}</small></span></div><button className="icon-button" onClick={onClose}><X /></button></div><button className="copy-invitation" onClick={() => void copyInvitation()}>{copied ? <Check /> : <Clipboard />}<span><b>{copied ? "Einladung kopiert" : "Einladungstext kopieren"}</b><small>Termin und Raumcode für E-Mail oder Messenger</small></span></button><form className="invitation-form" onSubmit={invite}><label>E-Mail-Adresse<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.de" required /></label><label>Rolle<select value={role} onChange={(event) => setRole(event.target.value as AssignableRole)}>{roles.map((value) => <option key={value} value={value}>{roleLabel(value as ParticipantRole)}</option>)}</select></label><button className="primary compact" disabled={busy}><Mail /> {busy ? "Wird eingeladen …" : "Einladen"}</button></form>{error && <div className="error-banner">{error}</div>}<div className="invitation-list"><div className="invitation-list-heading"><b>Eingeladene und beigetretene Personen</b><span>{loading ? "…" : members.length}</span></div>{members.length > 0 ? members.map((member) => <div className="invitation-member" key={member.id}><div><b>{member.display_name || member.user_email}</b><small>{member.user_email}</small></div><span>{roleLabel(member.role as ParticipantRole)} · {member.status === "joined" ? "beigetreten" : "eingeladen"}</span><button title="Entfernen" onClick={() => void remove(member)}><Trash2 /></button></div>) : !loading && <p>Noch niemand eingeladen.</p>}</div><div className="modal-actions"><button className="primary compact" onClick={onClose}>Fertig</button></div></section></div>;
}
