import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, ShieldCheck, UserMinus } from "lucide-react";
import { base44 } from "../lib/base44";
import type { EventRecord, MembershipRecord } from "../domain";

type FunctionEnvelope<T> = T | { data: T };

function unwrap<T>(value: FunctionEnvelope<T>): T {
  return typeof value === "object" && value !== null && "data" in value
    ? (value as { data: T }).data
    : value as T;
}

export type AdmissionState = "waiting" | "admitted" | "rejected" | "unknown";

export function admissionState(members: MembershipRecord[], email: string): AdmissionState {
  const status = members.find((member) => member.user_email.toLowerCase() === email.toLowerCase())?.status;
  if (status === "waiting") return "waiting";
  if (status === "joined" || status === "invited") return "admitted";
  if (status === "blocked") return "rejected";
  return "unknown";
}

export function WaitingForAdmission({ eventId, title, email, onAdmitted, onCancel }: {
  eventId: string;
  title: string;
  email: string;
  onAdmitted: () => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<AdmissionState>("waiting");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const result = unwrap(await base44.functions.invoke("get-room", { eventId }) as FunctionEnvelope<{ event: EventRecord; members: MembershipRecord[] }>);
        if (!active) return;
        const next = admissionState(result.members, email);
        setState(next);
        setError("");
        if (next === "admitted") onAdmitted();
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Freigabe konnte nicht geprüft werden.");
      } finally {
        checking = false;
      }
    };
    void check();
    const timer = window.setInterval(check, 2500);
    return () => { active = false; window.clearInterval(timer); };
  }, [email, eventId, onAdmitted]);

  return <main className="waiting-shell"><section className="waiting-card"><div className={`waiting-icon ${state}`}><Clock3 /></div><span className="eyebrow">WARTERAUM</span><h1>{state === "rejected" ? "Beitritt abgelehnt" : "Der Host lässt Sie gleich herein"}</h1><p>{state === "rejected" ? `Der Zugang zu „${title}“ wurde von der Moderation abgelehnt.` : `Sie befinden sich im Warteraum für „${title}“. Dieses Fenster kann geöffnet bleiben.`}</p>{state === "waiting" && <div className="waiting-progress"><span /></div>}{error && <div className="warning-banner">{error}</div>}<button className="ghost" onClick={onCancel}>{state === "rejected" ? "Zurück zur Übersicht" : "Warteraum verlassen"}</button></section></main>;
}

export function WaitingRoomControls({ eventId, enabled }: { eventId: string; enabled: boolean }) {
  const [members, setMembers] = useState<MembershipRecord[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const result = unwrap(await base44.functions.invoke("manage-room-member", { eventId, action: "list" }) as FunctionEnvelope<{ members: MembershipRecord[] }>);
      setMembers(result.members.filter((member) => member.status === "waiting"));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Warteraum konnte nicht geladen werden.");
    }
  }, [enabled, eventId]);

  useEffect(() => {
    void reload();
    const timer = window.setInterval(reload, 3000);
    return () => window.clearInterval(timer);
  }, [reload]);

  async function decide(member: MembershipRecord, action: "admit" | "reject") {
    setBusyId(member.id);
    try {
      await base44.functions.invoke("manage-room-member", { eventId, action, memberId: member.id });
      setMembers((current) => current.filter((item) => item.id !== member.id));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Entscheidung konnte nicht gespeichert werden.");
    } finally {
      setBusyId("");
    }
  }

  if (!enabled || (members.length === 0 && !error)) return null;
  return <section className="waiting-controls"><div className="waiting-controls-title"><ShieldCheck /><b>Warteraum</b><span>{members.length}</span></div>{members.map((member) => <div className="waiting-person" key={member.id}><div className="avatar">{member.display_name.slice(0, 2).toUpperCase()}</div><div><b>{member.display_name}</b><small>{member.user_email}</small></div><button title="Zulassen" disabled={busyId === member.id} onClick={() => void decide(member, "admit")}><Check /></button><button className="reject" title="Ablehnen" disabled={busyId === member.id} onClick={() => void decide(member, "reject")}><UserMinus /></button></div>)}{error && <small className="recorder-error">{error}</small>}</section>;
}
