import { useEffect, useState } from "react";
import {
  FileDown,
  Laptop,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import desktopPackage from "../../../../package.json";
import { base44 } from "../lib/base44";
import type { UserInfo } from "../domain";
import { useFeedback } from "./FeedbackProvider";

interface Organization {
  id: string;
  name: string;
  owner_email: string;
  default_max_participants?: number;
  default_camera_on?: boolean;
  default_microphone_on?: boolean;
  default_waiting_room_enabled?: boolean;
  default_stream_server?: string;
}
interface OrganizationMember {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "producer" | "operator" | "member";
  status: "invited" | "active" | "disabled";
}
interface ManagedDevice {
  id: string;
  device_id: string;
  user_email: string;
  label: string;
  app_version?: string;
  last_seen_at?: string;
  capabilities?: string[];
  status?: "online" | "offline" | "disabled";
}
interface OrganizationState {
  organization: Organization | null;
  actorRole: OrganizationMember["role"] | null;
  members: OrganizationMember[];
  devices: ManagedDevice[];
}
type Envelope<T> = T | { data: T };
const roleLabels = {
  admin: "Administrator",
  producer: "Produzent",
  operator: "Operator",
  member: "Mitglied",
};
function unwrap<T>(value: Envelope<T>): T {
  return typeof value === "object" && value !== null && "data" in value
    ? (value as { data: T }).data
    : (value as T);
}
export function deviceFreshness(
  lastSeen?: string,
  now = Date.now(),
): "online" | "recent" | "offline" {
  const age = lastSeen ? now - new Date(lastSeen).getTime() : Infinity;
  return age < 5 * 60_000
    ? "online"
    : age < 24 * 60 * 60_000
      ? "recent"
      : "offline";
}

function localDeviceId(): string {
  const key = "gemeinde-stream.device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function OrganizationAdmin({
  user,
  mode,
}: {
  user: UserInfo;
  mode: "team" | "settings";
}) {
  const { confirm, notify } = useFeedback();
  const [data, setData] = useState<OrganizationState>({
    organization: null,
    actorRole: null,
    members: [],
    devices: [],
  });
  const [name, setName] = useState("");
  const [maxParticipants, setMaxParticipants] = useState(50);
  const [cameraOn, setCameraOn] = useState(true);
  const [microphoneOn, setMicrophoneOn] = useState(true);
  const [waitingRoom, setWaitingRoom] = useState(true);
  const [streamServer, setStreamServer] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] =
    useState<OrganizationMember["role"]>("member");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [exportingDiagnostics, setExportingDiagnostics] = useState(false);
  const canAdmin = data.actorRole === "admin";
  function apply(next: OrganizationState) {
    setData(next);
    if (next.organization) {
      setName(next.organization.name);
      setMaxParticipants(next.organization.default_max_participants ?? 50);
      setCameraOn(next.organization.default_camera_on ?? true);
      setMicrophoneOn(next.organization.default_microphone_on ?? true);
      setWaitingRoom(next.organization.default_waiting_room_enabled ?? true);
      setStreamServer(next.organization.default_stream_server ?? "");
    }
  }
  async function invoke(action: string, values: Record<string, unknown> = {}) {
    const next = unwrap(
      (await base44.functions.invoke("manage-organization", {
        action,
        ...values,
      })) as Envelope<OrganizationState>,
    );
    apply(next);
    setError("");
    return next;
  }
  useEffect(() => {
    (async () => {
      try {
        const next = await invoke("get");
        if (next.organization)
          await invoke("register-device", {
            deviceId: localDeviceId(),
            label: `${window.desktop?.platform === "darwin" ? "Mac" : window.desktop?.platform === "win32" ? "Windows" : "Desktop"} · ${user.full_name || user.email}`,
            appVersion: window.desktop?.version ?? desktopPackage.version,
            capabilities: [
              "meeting",
              "broadcast",
              "adaptive-hd",
              "recording",
              "rtmp",
            ],
          });
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Gemeinde konnte nicht geladen werden.",
        );
      } finally {
        setBusy(false);
      }
    })();
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = !data.organization;
      const next = await invoke("save", {
        name,
        defaultMaxParticipants: maxParticipants,
        defaultCameraOn: cameraOn,
        defaultMicrophoneOn: microphoneOn,
        defaultWaitingRoomEnabled: waitingRoom,
        defaultStreamServer: streamServer,
      });
      if (created && next.organization)
        await invoke("register-device", {
          deviceId: localDeviceId(),
          label: `${window.desktop?.platform === "darwin" ? "Mac" : "Windows"} · ${user.full_name || user.email}`,
          appVersion: window.desktop?.version ?? desktopPackage.version,
          capabilities: [
            "meeting",
            "broadcast",
            "adaptive-hd",
            "recording",
            "rtmp",
          ],
        });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Einstellungen konnten nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await invoke("invite", {
        email: inviteEmail,
        displayName: inviteName,
        role: inviteRole,
      });
      setInviteEmail("");
      setInviteName("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Einladung konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function changeRole(
    member: OrganizationMember,
    role: OrganizationMember["role"],
  ) {
    try {
      await invoke("member-role", { memberId: member.id, role });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Rolle konnte nicht geändert werden.",
      );
    }
  }
  async function removeMember(member: OrganizationMember) {
    if (
      !(await confirm({
        title: "Teammitglied entfernen?",
        message: `${member.display_name} verliert den Zugriff auf die Gemeindeorganisation.`,
        confirmLabel: "Entfernen",
        destructive: true,
      }))
    )
      return;
    try {
      await invoke("member-remove", { memberId: member.id });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Mitglied konnte nicht entfernt werden.",
      );
    }
  }
  async function toggleDevice(device: ManagedDevice) {
    try {
      await invoke("device-status", {
        deviceId: device.id,
        status: device.status === "disabled" ? "offline" : "disabled",
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Gerätestatus konnte nicht geändert werden.",
      );
    }
  }
  async function exportDiagnostics() {
    setExportingDiagnostics(true);
    try {
      if (!window.desktop?.exportDiagnostics)
        throw new Error(
          "Die Diagnosefunktion wurde aktualisiert. Bitte starten Sie Gemeinde Stream einmal neu.",
        );
      const saved = await window.desktop.exportDiagnostics();
      if (saved)
        notify("Supportbericht wurde gespeichert.", "success");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Supportbericht konnte nicht gespeichert werden.",
      );
    } finally {
      setExportingDiagnostics(false);
    }
  }
  const diagnosticsCard = (
    <section className="diagnostics-card">
      <div>
        <FileDown />
        <span>
          <b>Support &amp; Diagnose</b>
          <small>
            Exportiert Laufzeitdaten und maskierte Fehlerprotokolle – ohne
            Streaming-Schlüssel oder Zugangsdaten.
          </small>
        </span>
      </div>
      <button
        type="button"
        className="secondary compact"
        onClick={exportDiagnostics}
        disabled={exportingDiagnostics}
      >
        <FileDown />
        {exportingDiagnostics
          ? "Wird erstellt …"
          : "Supportbericht exportieren"}
      </button>
    </section>
  );
  if (busy && !data.organization)
    return (
      <div className="management-empty">Gemeindeverwaltung wird geladen …</div>
    );
  if (!data.organization)
    return (
      <section className="management-page">
        <header>
          <span className="eyebrow">ERSTE SCHRITTE</span>
          <h1>Gemeinde einrichten</h1>
          <p>
            Legen Sie die gemeinsame Organisation für Team, Geräte und
            Produktionsstandards an.
          </p>
        </header>
        <form className="organization-create" onSubmit={save}>
          <label>
            Name der Gemeinde
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Evangelische Gemeinde Musterstadt"
              required
              maxLength={120}
            />
          </label>
          <button className="primary compact">
            <Plus /> Gemeinde anlegen
          </button>
        </form>
        {diagnosticsCard}
        {error && <div className="error-banner">{error}</div>}
      </section>
    );
  if (mode === "settings")
    return (
      <section className="management-page">
        <header>
          <span className="eyebrow">EINSTELLUNGEN</span>
          <h1>{data.organization.name}</h1>
          <p>Zentrale Standardwerte für neue Meetings und Produktionen.</p>
        </header>
        <form className="settings-grid" onSubmit={save}>
          <label>
            Gemeindename
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!canAdmin}
            />
          </label>
          <label>
            Standard-Teilnehmerlimit
            <input
              type="number"
              min={2}
              max={500}
              value={maxParticipants}
              onChange={(event) =>
                setMaxParticipants(Number(event.target.value))
              }
              disabled={!canAdmin}
            />
          </label>
          <label className="wide">
            Standard-Streamingserver
            <input
              value={streamServer}
              onChange={(event) => setStreamServer(event.target.value)}
              placeholder="rtmps://server.example/live"
              disabled={!canAdmin}
            />
          </label>
          <div className="settings-toggles wide">
            <label>
              <input
                type="checkbox"
                checked={cameraOn}
                onChange={(event) => setCameraOn(event.target.checked)}
                disabled={!canAdmin}
              />{" "}
              Kamera standardmäßig aktiv
            </label>
            <label>
              <input
                type="checkbox"
                checked={microphoneOn}
                onChange={(event) => setMicrophoneOn(event.target.checked)}
                disabled={!canAdmin}
              />{" "}
              Mikrofon standardmäßig aktiv
            </label>
            <label>
              <input
                type="checkbox"
                checked={waitingRoom}
                onChange={(event) => setWaitingRoom(event.target.checked)}
                disabled={!canAdmin}
              />{" "}
              Warteraum standardmäßig aktiv
            </label>
          </div>
          {canAdmin && (
            <button className="primary compact">
              <Save /> Einstellungen speichern
            </button>
          )}
        </form>
        {diagnosticsCard}
        {error && <div className="error-banner">{error}</div>}
      </section>
    );
  return (
    <section className="management-page">
      <header>
        <span className="eyebrow">TEAM & GERÄTE</span>
        <h1>{data.organization.name}</h1>
        <p>Dauerhafte Rollen und registrierte Produktionsrechner verwalten.</p>
      </header>
      {canAdmin && (
        <form className="team-invite" onSubmit={invite}>
          <label>
            Name
            <input
              value={inviteName}
              onChange={(event) => setInviteName(event.target.value)}
              required
            />
          </label>
          <label>
            E-Mail
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Rolle
            <select
              value={inviteRole}
              onChange={(event) =>
                setInviteRole(event.target.value as OrganizationMember["role"])
              }
            >
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="primary compact">
            <UserPlus /> Hinzufügen
          </button>
        </form>
      )}
      <div className="management-columns">
        <section>
          <div className="management-heading">
            <Users />
            <b>Team</b>
            <span>{data.members.length}</span>
          </div>
          {data.members.map((member) => (
            <article className="team-row" key={member.id}>
              <div className="avatar">
                {member.display_name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <b>{member.display_name}</b>
                <small>
                  {member.email} ·{" "}
                  {member.status === "active" ? "aktiv" : "eingeladen"}
                </small>
              </div>
              <select
                value={member.role}
                disabled={
                  !canAdmin || member.email === data.organization?.owner_email
                }
                onChange={(event) =>
                  void changeRole(
                    member,
                    event.target.value as OrganizationMember["role"],
                  )
                }
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {canAdmin && member.email !== data.organization?.owner_email && (
                <button onClick={() => void removeMember(member)}>
                  <Trash2 />
                </button>
              )}
            </article>
          ))}
        </section>
        <section>
          <div className="management-heading">
            <Laptop />
            <b>Produktionsgeräte</b>
            <span>{data.devices.length}</span>
          </div>
          {data.devices.map((device) => {
            const freshness = deviceFreshness(device.last_seen_at);
            return (
              <article
                className={`device-row ${device.status === "disabled" ? "disabled" : ""}`}
                key={device.id}
              >
                <div className={`device-state ${freshness}`} />
                <div>
                  <b>{device.label}</b>
                  <small>
                    {device.user_email} · Version{" "}
                    {device.app_version || "unbekannt"}
                  </small>
                  <span>{device.capabilities?.join(" · ")}</span>
                </div>
                {canAdmin && (
                  <button onClick={() => void toggleDevice(device)}>
                    {device.status === "disabled" ? (
                      <ShieldCheck />
                    ) : (
                      "Deaktivieren"
                    )}
                  </button>
                )}
              </article>
            );
          })}
        </section>
      </div>
      {error && <div className="error-banner">{error}</div>}
    </section>
  );
}
