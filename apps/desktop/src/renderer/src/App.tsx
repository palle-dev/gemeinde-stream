import { useCallback, useEffect, useMemo, useState } from "react";
import { RoomEvent, Track } from "livekit-client";
import desktopPackage from "../../../package.json";
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  CameraOff,
  Check,
  Clipboard,
  Hand,
  Lock,
  LockOpen,
  LogOut,
  MailCheck,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  Pencil,
  Plus,
  Radio,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  UserPlus,
  UserMinus,
  Video,
  VolumeX,
  Wifi,
  WifiOff,
} from "lucide-react";
import { base44 } from "./lib/base44";
import { MediaRoom, mediaConnectionMessage, mediaServerScope, type ConnectionState, type MediaPreferences } from "./lib/room";
import {
  RoomAudio,
  VideoTrackElement,
  useRoomMedia,
  type ParticipantMedia,
  type VideoMediaTrack,
} from "./components/RoomMedia";
import { useMeetingChat, useRaisedHands } from "./components/MeetingCollaboration";
import { MEETING_REACTIONS, useMeetingReactions, type MeetingReaction, type MeetingReactionEmoji } from "./components/MeetingReactions";
import { MeetingRecorder, type MeetingRecordingLayout } from "./components/MeetingRecorder";
import { WaitingForAdmission, WaitingRoomControls } from "./components/WaitingRoom";
import { PreJoin } from "./components/PreJoin";
import {
  canModerateRole,
  roleLabel,
  useMeetingModeration,
  type ParticipantRole,
} from "./components/MeetingModeration";
import { useRoomLifecycle } from "./components/RoomLifecycle";
import { useRoomRoleManagement, type AssignableRole } from "./components/RoomRoleManagement";
import { ProgramOutputWindow } from "./components/ProgramOutputWindow";
import { DeviceSettings } from "./components/DeviceSettings";
import { selectMeetingStage } from "./components/MeetingLayout";
import { defaultStartTime, toDateTimeInput, toIsoDateTime } from "./components/EventScheduling";
import { EventInvitations } from "./components/EventInvitations";
import { resolveSceneSourceIds, useBroadcastScenes, type AvailableSceneSource, type BroadcastScene } from "./components/BroadcastScenes";
import { BroadcastAudioMixer } from "./components/BroadcastAudioMixer";
import { ProgramRecorder } from "./components/ProgramRecorder";
import { ProgramStreamer } from "./components/ProgramStreamer";
import { SourceQualityLine, SourceQualityMonitor, useSourceQuality } from "./components/SourceQualityMonitor";
import { RundownPanel } from "./components/RundownPanel";
import { MediaLibrary, useMediaLibrary, type LocalMediaAsset } from "./components/MediaLibrary";
import { broadcastTallyState } from "./components/BroadcastTally";
import {
  normalizeBroadcastOverlay,
  useBroadcastCoordination,
  type BroadcastLayout,
  type BroadcastOverlay,
  type BroadcastTransition,
} from "./components/BroadcastCoordination";
import {
  createJoinCode,
  createLiveKitRoomName,
  type EventRecord,
  type MembershipRecord,
  type RoomMode,
  type UserInfo,
} from "./domain";

type FunctionEnvelope<T> = T | { data: T };

function unwrap<T>(value: FunctionEnvelope<T>): T {
  return typeof value === "object" && value !== null && "data" in value
    ? (value as { data: T }).data
    : (value as T);
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) return String(error.message);
  return "Ein unbekannter Fehler ist aufgetreten.";
}

export default function App() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeEvent, setActiveEvent] = useState<EventRecord | null>(null);
  const [pendingJoinCode, setPendingJoinCode] = useState(() => new URLSearchParams(window.location.search).get("join")?.toUpperCase() || "");

  useEffect(() => {
    base44.auth.isAuthenticated()
      .then((authenticated) => authenticated ? base44.auth.me() : null)
      .then((result) => setUser(result ? result as UserInfo : null))
      .catch(() => setUser(null))
      .finally(() => setCheckingAuth(false));
  }, []);

  useEffect(() => window.desktop?.onOpenJoinLink(setPendingJoinCode), []);

  if (checkingAuth) {
    return <div className="splash"><div className="brand-mark"><Radio /></div><span>Gemeinde Stream wird vorbereitet …</span></div>;
  }

  if (!user) return <Login onAuthenticated={(nextUser) => setUser(nextUser)} />;
  if (activeEvent) return <Studio event={activeEvent} user={user} onLeave={() => setActiveEvent(null)} />;

  return (
    <Dashboard
      user={user}
      onOpen={setActiveEvent}
      initialJoinCode={pendingJoinCode}
      onJoinCodeConsumed={() => setPendingJoinCode("")}
      onLogout={() => {
        setUser(null);
        base44.auth.logout();
      }}
    />
  );
}

function Login({ onAuthenticated }: { onAuthenticated: (user: UserInfo) => void }) {
  const [view, setView] = useState<"login" | "register" | "verify">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (view === "register") {
        await base44.auth.register({ email, password });
        setView("verify");
        return;
      }

      if (view === "verify") {
        await base44.auth.verifyOtp({ email, otpCode: otp });
        const response = await base44.auth.loginViaEmailPassword(email, password);
        const updated = await base44.auth.updateMe({ full_name: fullName });
        onAuthenticated((updated || response.user) as UserInfo);
        return;
      }

      const response = await base44.auth.loginViaEmailPassword(email, password);
      onAuthenticated(response.user as UserInfo);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-copy">
        <div className="eyebrow"><span className="status-dot" /> LIVE & VERBUNDEN</div>
        <h1>Zusammenkommen.<br /><em>Überall.</em></h1>
        <p>Meetings, Gottesdienste und hybride Veranstaltungen in einer gemeinsamen Produktionsumgebung.</p>
        <div className="feature-row">
          <span><Video size={18} /> 1080p60 Video</span>
          <span><Users size={18} /> Meeting & Regie</span>
          <span><ShieldCheck size={18} /> Geschützte Räume</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="logo-lockup"><div className="brand-mark"><Radio /></div><div><b>Gemeinde Stream</b><small>Studio für Windows</small></div></div>
        <form onSubmit={submit}>
          <h2>{view === "login" ? "Willkommen zurück" : view === "register" ? "Konto erstellen" : "E-Mail bestätigen"}</h2>
          <p>{view === "login" ? "Melden Sie sich mit Ihrem Gemeindekonto an." : view === "register" ? "Erstellen Sie einen persönlichen Zugang für Meetings und Regie." : `Wir haben einen Bestätigungscode an ${email} gesendet.`}</p>
          {view === "register" && <label>Anzeigename<input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Vor- und Nachname" required /></label>}
          {view !== "verify" && <label>E-Mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gemeinde.de" required /></label>}
          {view !== "verify" && <label>Passwort<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mindestens 8 Zeichen" minLength={8} required /></label>}
          {view === "verify" && <label>Bestätigungscode<input className="otp-input" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\s/g, ""))} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" required autoFocus /></label>}
          {error && <div className="error-banner">{error}</div>}
          <button className="primary" disabled={busy}>{busy ? "Bitte warten …" : view === "login" ? "Anmelden" : view === "register" ? "Registrieren" : "Code bestätigen"}</button>
          {view === "verify" && <button type="button" className="auth-link" onClick={() => void base44.auth.resendOtp(email)}><MailCheck /> Code erneut senden</button>}
          <button type="button" className="auth-link" onClick={() => { setError(""); setView(view === "login" ? "register" : "login"); }}>
            {view === "login" ? <><UserPlus /> Noch kein Konto? Registrieren</> : "Zurück zur Anmeldung"}
          </button>
        </form>
        <small className="version">Version {window.desktop?.version ?? desktopPackage.version}</small>
      </section>
    </main>
  );
}

function Dashboard({ user, onOpen, onLogout, initialJoinCode, onJoinCodeConsumed }: { user: UserInfo; onOpen: (event: EventRecord) => void; onLogout: () => void; initialJoinCode?: string; onJoinCodeConsumed: () => void }) {
  const [owned, setOwned] = useState<EventRecord[]>([]);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);
  const [invitingEvent, setInvitingEvent] = useState<EventRecord | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [notice, setNotice] = useState("");

  async function reload() {
    setLoading(true);
    try {
      const [events, memberRows] = await Promise.all([
        base44.entities.Event.filter({ host_email: user.email }, "-created_date", 100, 0),
        base44.entities.RoomMember.filter({ user_email: user.email }, "-created_date", 100, 0),
      ]);
      setOwned(events as EventRecord[]);
      setMemberships(memberRows as MembershipRecord[]);
    } catch (error) {
      setNotice(messageOf(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  async function joinByCode(code: string) {
    setNotice("");
    try {
      const result = unwrap(await base44.functions.invoke("join-room", {
        joinCode: code.trim().toUpperCase(),
        displayName: user.full_name || user.email,
      }) as FunctionEnvelope<{ eventId: string }>);
      const room = unwrap(await base44.functions.invoke("get-room", { eventId: result.eventId }) as FunctionEnvelope<{ event: EventRecord }>);
      onJoinCodeConsumed();
      onOpen(room.event);
    } catch (error) {
      setNotice(messageOf(error));
    }
  }

  async function joinRoom(event: React.FormEvent) {
    event.preventDefault();
    await joinByCode(joinCode);
  }

  useEffect(() => {
    if (!initialJoinCode) return;
    setJoinCode(initialJoinCode);
    void joinByCode(initialJoinCode);
  }, [initialJoinCode]);

  async function openMembership(member: MembershipRecord) {
    try {
      const room = unwrap(await base44.functions.invoke("get-room", { eventId: member.event_id }) as FunctionEnvelope<{ event: EventRecord }>);
      if (room.event.status === "ended") {
        setNotice("Diese Veranstaltung wurde bereits beendet.");
        return;
      }
      onOpen(room.event);
    } catch (error) {
      setNotice(messageOf(error));
    }
  }

  async function deleteOwnedEvent(event: EventRecord) {
    if (!window.confirm(`Veranstaltung „${event.title}“ wirklich löschen? Zugehörige Einladungen und Szenen werden ebenfalls entfernt.`)) return;
    try {
      await base44.functions.invoke("manage-event", { eventId: event.id, action: "delete" });
      setOwned((current) => current.filter((item) => item.id !== event.id));
      setNotice("");
    } catch (error) {
      setNotice(messageOf(error));
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo-lockup"><div className="brand-mark small"><Radio /></div><div><b>Gemeinde Stream</b><small>Studio</small></div></div>
        <nav>
          <button className="nav-active"><CalendarDays /> Veranstaltungen</button>
          <button><Video /> Studio</button>
          <button><Users /> Team</button>
          <button><Settings /> Einstellungen</button>
        </nav>
        <div className="user-card"><div className="avatar">{(user.full_name || user.email).slice(0, 2).toUpperCase()}</div><div><b>{user.full_name || "Administrator"}</b><small>{user.email}</small></div><button onClick={onLogout} title="Abmelden"><LogOut /></button></div>
      </aside>
      <main className="dashboard">
        <header><div><span className="eyebrow">ÜBERSICHT</span><h1>Ihre Veranstaltungen</h1><p>Meetings durchführen oder eine komplette Live-Produktion steuern.</p></div><button className="primary compact" onClick={() => setShowCreate(true)}><Plus /> Neue Veranstaltung</button></header>
        {notice && <div className="error-banner">{notice}</div>}
        <section className="quick-actions">
          <form className="join-card" onSubmit={joinRoom}><div className="icon-box"><Users /></div><div><b>Einem Raum beitreten</b><span>Meeting- oder Produktionscode eingeben</span></div><input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="RAUMCODE" maxLength={12} required /><button className="secondary">Beitreten</button></form>
          <div className="health-card"><div className="health-top"><span><Wifi /> Systemstatus</span><b>Backend verbunden</b></div><div className="health-meter ready"><span /></div><small>Base44 ist erreichbar. Medienserver und Geräte werden beim Beitritt geprüft.</small></div>
        </section>
        <section className="section-heading"><h2>Geplant und zuletzt verwendet</h2><span>{owned.length + memberships.filter((member) => !owned.some((event) => event.id === member.event_id)).length} Räume</span></section>
        <div className="room-grid">
          {loading && <div className="empty-card">Räume werden geladen …</div>}
          {!loading && owned.length === 0 && memberships.length === 0 && <div className="empty-card"><div className="icon-box"><CalendarDays /></div><h3>Noch keine Veranstaltung</h3><p>Erstellen Sie ein Meeting oder eine Live-Produktion.</p><button className="secondary" onClick={() => setShowCreate(true)}>Jetzt erstellen</button></div>}
          {owned.map((event) => <RoomCard key={event.id} event={event} role="Host" onOpen={() => onOpen(event)} onInvite={() => setInvitingEvent(event)} onEdit={() => setEditingEvent(event)} onDelete={() => void deleteOwnedEvent(event)} />)}
          {memberships.filter((member) => !owned.some((event) => event.id === member.event_id)).map((member) => (
            <RoomCard key={member.id} event={{ id: member.event_id, title: member.event_title, mode: member.event_mode, status: "scheduled", host_email: "", join_code: "", livekit_room_name: "" }} role={member.role} onOpen={() => void openMembership(member)} />
          ))}
        </div>
      </main>
      {showCreate && <CreateRoom user={user} onClose={() => setShowCreate(false)} onCreated={(event) => { setShowCreate(false); setOwned((current) => [event, ...current]); }} />}
      {editingEvent && <EditRoom event={editingEvent} onClose={() => setEditingEvent(null)} onUpdated={(updated) => { setEditingEvent(null); setOwned((current) => current.map((event) => event.id === updated.id ? updated : event)); }} />}
      {invitingEvent && <EventInvitations event={invitingEvent} onClose={() => setInvitingEvent(null)} />}
    </div>
  );
}

function RoomCard({ event, role, onOpen, onInvite, onEdit, onDelete }: { event: EventRecord; role: string; onOpen: () => void; onInvite?: () => void; onEdit?: () => void; onDelete?: () => void }) {
  const ended = event.status === "ended";
  return <article className={`room-card ${ended ? "ended" : ""}`}><div className="card-badges"><div className={`mode-badge ${event.mode}`}><span />{event.mode === "meeting" ? "Meeting" : "Live-Produktion"}</div><div className={`status-badge ${event.status}`}>{event.status === "live" ? "LIVE" : ended ? "BEENDET" : "GEPLANT"}</div></div><h3>{event.title}</h3><p>{event.description || (event.mode === "meeting" ? "Interaktiver Raum für Gespräche und Bildschirmfreigabe" : "Regie, Quellen und Programmausgabe")}</p><div className="room-meta"><span><Users size={16} /> {role}{event.max_participants ? ` · max. ${event.max_participants}` : ""}</span>{event.starts_at && <span><CalendarDays size={16} /> {new Date(event.starts_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}</span>}</div><div className="room-card-actions"><button className="secondary full" onClick={onOpen} disabled={ended}>{ended ? "Veranstaltung beendet" : "Studio öffnen"}</button>{onInvite && <button className="room-icon-action invite" title="Teilnehmer einladen" onClick={onInvite} disabled={ended}><UserPlus /></button>}{onEdit && <button className="room-icon-action" title="Bearbeiten" onClick={onEdit} disabled={event.status === "live"}><Pencil /></button>}{onDelete && <button className="room-icon-action delete" title="Löschen" onClick={onDelete} disabled={event.status === "live"}><Trash2 /></button>}</div></article>;
}

function EventDetailsFields({ title, setTitle, description, setDescription, startsAt, setStartsAt, maxParticipants, setMaxParticipants, defaultCameraOn, setDefaultCameraOn, defaultMicrophoneOn, setDefaultMicrophoneOn, waitingRoomEnabled, setWaitingRoomEnabled, showWaitingRoom }: { title: string; setTitle: (value: string) => void; description: string; setDescription: (value: string) => void; startsAt: string; setStartsAt: (value: string) => void; maxParticipants: number; setMaxParticipants: (value: number) => void; defaultCameraOn: boolean; setDefaultCameraOn: (value: boolean) => void; defaultMicrophoneOn: boolean; setDefaultMicrophoneOn: (value: boolean) => void; waitingRoomEnabled: boolean; setWaitingRoomEnabled: (value: boolean) => void; showWaitingRoom: boolean }) {
  return <div className="event-fields"><label>Titel<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="z. B. Sonntagsgottesdienst" maxLength={120} required autoFocus /></label><label>Beschreibung<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Thema, Ablauf oder Hinweise für Teilnehmende" maxLength={1000} rows={3} /></label><div className="event-field-row"><label>Startzeit<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label><label>Teilnehmerlimit<input type="number" value={maxParticipants} onChange={(event) => setMaxParticipants(Number(event.target.value))} min={2} max={500} required /></label></div><div className="event-defaults"><label><input type="checkbox" checked={defaultCameraOn} onChange={(event) => setDefaultCameraOn(event.target.checked)} /> Kamera beim Beitritt einschalten</label><label><input type="checkbox" checked={defaultMicrophoneOn} onChange={(event) => setDefaultMicrophoneOn(event.target.checked)} /> Mikrofon beim Beitritt einschalten</label>{showWaitingRoom && <label><input type="checkbox" checked={waitingRoomEnabled} onChange={(event) => setWaitingRoomEnabled(event.target.checked)} /> Nicht eingeladene Personen im Warteraum prüfen</label>}</div></div>;
}

function CreateRoom({ user, onClose, onCreated }: { user: UserInfo; onClose: () => void; onCreated: (event: EventRecord) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<RoomMode>("meeting");
  const [startsAt, setStartsAt] = useState(() => defaultStartTime());
  const [maxParticipants, setMaxParticipants] = useState(50);
  const [defaultCameraOn, setDefaultCameraOn] = useState(true);
  const [defaultMicrophoneOn, setDefaultMicrophoneOn] = useState(true);
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const created = await base44.entities.Event.create({
        title: title.trim(), description: description.trim() || (mode === "meeting" ? "Interaktives Online-Meeting" : "Live-Produktion"), mode, status: "scheduled",
        starts_at: toIsoDateTime(startsAt), host_email: user.email, join_code: createJoinCode(), livekit_room_name: createLiveKitRoomName(),
        max_participants: maxParticipants, default_camera_on: defaultCameraOn, default_microphone_on: defaultMicrophoneOn,
        waiting_room_enabled: mode === "meeting" && waitingRoomEnabled,
        meeting_locked: false,
        recording_enabled: false, streaming_enabled: mode === "broadcast",
      }) as EventRecord;
      onCreated(created);
    } catch (cause) { setError(messageOf(cause)); } finally { setBusy(false); }
  }

  return <div className="modal-backdrop"><form className="modal event-modal" onSubmit={submit}><span className="eyebrow">NEUE VERANSTALTUNG</span><h2>Was möchten Sie planen?</h2><div className="mode-picker"><button type="button" className={mode === "meeting" ? "selected" : ""} onClick={() => setMode("meeting")}><Users /><b>Meeting</b><span>Alle sprechen, Video und Bildschirm teilen</span></button><button type="button" className={mode === "broadcast" ? "selected" : ""} onClick={() => setMode("broadcast")}><Radio /><b>Live-Produktion</b><span>Master-Regie, Quellen und Programmausgabe</span></button></div><EventDetailsFields title={title} setTitle={setTitle} description={description} setDescription={setDescription} startsAt={startsAt} setStartsAt={setStartsAt} maxParticipants={maxParticipants} setMaxParticipants={setMaxParticipants} defaultCameraOn={defaultCameraOn} setDefaultCameraOn={setDefaultCameraOn} defaultMicrophoneOn={defaultMicrophoneOn} setDefaultMicrophoneOn={setDefaultMicrophoneOn} waitingRoomEnabled={waitingRoomEnabled} setWaitingRoomEnabled={setWaitingRoomEnabled} showWaitingRoom={mode === "meeting"} />{error && <div className="error-banner">{error}</div>}<div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Abbrechen</button><button className="primary" disabled={busy}>{busy ? "Wird erstellt …" : "Veranstaltung planen"}</button></div></form></div>;
}

function EditRoom({ event, onClose, onUpdated }: { event: EventRecord; onClose: () => void; onUpdated: (event: EventRecord) => void }) {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description || "");
  const [startsAt, setStartsAt] = useState(toDateTimeInput(event.starts_at) || defaultStartTime());
  const [maxParticipants, setMaxParticipants] = useState(event.max_participants || 50);
  const [defaultCameraOn, setDefaultCameraOn] = useState(event.default_camera_on ?? true);
  const [defaultMicrophoneOn, setDefaultMicrophoneOn] = useState(event.default_microphone_on ?? true);
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(event.waiting_room_enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault(); setBusy(true); setError("");
    try {
      const result = unwrap(await base44.functions.invoke("manage-event", { eventId: event.id, action: "update", title, description, startsAt: toIsoDateTime(startsAt), maxParticipants, defaultCameraOn, defaultMicrophoneOn, waitingRoomEnabled: event.mode === "meeting" && waitingRoomEnabled }) as FunctionEnvelope<{ event: EventRecord }>);
      onUpdated(result.event);
    } catch (cause) { setError(messageOf(cause)); } finally { setBusy(false); }
  }

  return <div className="modal-backdrop"><form className="modal event-modal" onSubmit={submit}><span className="eyebrow">VERANSTALTUNG BEARBEITEN</span><h2>{event.mode === "meeting" ? "Meeting planen" : "Live-Produktion planen"}</h2><EventDetailsFields title={title} setTitle={setTitle} description={description} setDescription={setDescription} startsAt={startsAt} setStartsAt={setStartsAt} maxParticipants={maxParticipants} setMaxParticipants={setMaxParticipants} defaultCameraOn={defaultCameraOn} setDefaultCameraOn={setDefaultCameraOn} defaultMicrophoneOn={defaultMicrophoneOn} setDefaultMicrophoneOn={setDefaultMicrophoneOn} waitingRoomEnabled={waitingRoomEnabled} setWaitingRoomEnabled={setWaitingRoomEnabled} showWaitingRoom={event.mode === "meeting"} />{error && <div className="error-banner">{error}</div>}<div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Abbrechen</button><button className="primary" disabled={busy}>{busy ? "Wird gespeichert …" : "Änderungen speichern"}</button></div></form></div>;
}
function Studio({ event, user, onLeave }: { event: EventRecord; user: UserInfo; onLeave: () => void }) {
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [mediaMessage, setMediaMessage] = useState("Medienserver noch nicht verbunden");
  const [mic, setMic] = useState(false);
  const [camera, setCamera] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canControlProgram, setCanControlProgram] = useState(false);
  const [participantRole, setParticipantRole] = useState<ParticipantRole>("participant");
  const [joined, setJoined] = useState(false);
  const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false);
  const [waitingPreferences, setWaitingPreferences] = useState<MediaPreferences | null>(null);
  const [meetingLocked, setMeetingLocked] = useState(event.meeting_locked ?? false);
  const media = useMemo(() => new MediaRoom(setConnection), []);

  useEffect(() => {
    return () => { void media.disconnect(); };
  }, [media]);

  useEffect(() => {
    const syncLocalMedia = () => {
      const microphone = media.room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const camera = media.room.localParticipant.getTrackPublication(Track.Source.Camera);
      setMic(Boolean(microphone && !microphone.isMuted));
      setCamera(Boolean(camera && !camera.isMuted));
    };
    media.room.on(RoomEvent.LocalTrackPublished, syncLocalMedia);
    media.room.on(RoomEvent.LocalTrackUnpublished, syncLocalMedia);
    media.room.on(RoomEvent.TrackMuted, syncLocalMedia);
    media.room.on(RoomEvent.TrackUnmuted, syncLocalMedia);
    return () => {
      media.room.off(RoomEvent.LocalTrackPublished, syncLocalMedia);
      media.room.off(RoomEvent.LocalTrackUnpublished, syncLocalMedia);
      media.room.off(RoomEvent.TrackMuted, syncLocalMedia);
      media.room.off(RoomEvent.TrackUnmuted, syncLocalMedia);
    };
  }, [media]);

  async function connect(preferences: MediaPreferences) {
    setMediaMessage("Zugang wird angefordert …");
    let serverUrl = "";
    try {
      const credentials = unwrap(await base44.functions.invoke("create-livekit-token", { eventId: event.id, displayName: preferences.displayName }) as FunctionEnvelope<{ waitingForApproval?: boolean; serverUrl?: string; participantToken?: string; role: ParticipantRole; canControlProgram?: boolean; canModerate?: boolean }>);
      if (credentials.waitingForApproval) {
        setWaitingPreferences(preferences);
        setConnection("idle");
        setMediaMessage("Wartet auf Freigabe durch die Moderation");
        return;
      }
      if (!credentials.serverUrl || !credentials.participantToken) throw new Error("Der Medienzugang ist unvollständig.");
      serverUrl = credentials.serverUrl;
      await media.connect(serverUrl, credentials.participantToken);
      setCanControlProgram(Boolean(credentials.canControlProgram));
      setParticipantRole(credentials.role);
      await media.applyDevices(preferences);
      const canPublish = credentials.role !== "viewer";
      if (preferences.microphoneEnabled && canPublish) await media.setMicrophone(true);
      if (preferences.cameraEnabled && canPublish) await media.setCamera(true);
      setMic(preferences.microphoneEnabled && canPublish);
      setCamera(preferences.cameraEnabled && canPublish);
      setJoined(true);
      if (credentials.role === "host" && event.status === "scheduled") {
        try {
          await base44.entities.Event.update(event.id, { status: "live" });
        } catch {
          setMediaMessage("Verbunden, Status konnte jedoch nicht aktualisiert werden");
          return;
        }
      }
      setMediaMessage(mediaServerScope(serverUrl) === "local"
        ? "Mit lokalem Medienserver verbunden – nur auf diesem PC erreichbar"
        : "Sicher mit dem Medienserver verbunden");
    } catch (error) {
      await media.disconnect();
      setConnection("error");
      setMediaMessage(serverUrl ? mediaConnectionMessage(error, serverUrl) : messageOf(error));
    }
  }

  async function updateMedium(action: () => Promise<void>, apply: () => void) {
    try {
      await action();
      apply();
    } catch (error) {
      setMediaMessage(messageOf(error));
    }
  }

  async function toggleMic() {
    const next = !mic;
    await updateMedium(() => media.setMicrophone(next), () => setMic(next));
  }

  async function toggleCamera() {
    const next = !camera;
    await updateMedium(() => media.setCamera(next), () => setCamera(next));
  }

  async function toggleSharing() {
    const next = !sharing;
    await updateMedium(() => media.setScreenShare(next), () => setSharing(next));
  }

  async function leave() {
    await media.disconnect();
    onLeave();
  }

  async function copyCode() {
    await navigator.clipboard.writeText(event.join_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const connected = connection === "connected";
  const handleModerationMute = useCallback(() => {
    setMic(false);
    setMediaMessage("Ihr Mikrofon wurde von der Moderation stummgeschaltet");
  }, []);
  const handleModerationRemove = useCallback(() => {
    window.alert("Sie wurden von der Moderation aus dem Raum entfernt.");
    onLeave();
  }, [onLeave]);
  const handleRoomEnded = useCallback(() => {
    window.alert("Der Host hat die Veranstaltung beendet.");
    onLeave();
  }, [onLeave]);
  const { broadcastEnd } = useRoomLifecycle(media.room, connected, participantRole, handleRoomEnded);
  const handleRoleChanged = useCallback((role: AssignableRole) => {
    setParticipantRole(role);
    setConnection("idle");
    setJoined(false);
    setMic(false);
    setCamera(false);
    setSharing(false);
    setMediaMessage(`Ihre Rolle ist jetzt „${roleLabel(role)}“. Bitte treten Sie erneut bei.`);
    window.alert(`Ihre Rolle wurde zu „${roleLabel(role)}“ geändert. Die Verbindung wird mit neuen Rechten aufgebaut.`);
  }, []);
  const { notifyRoleChange } = useRoomRoleManagement(media.room, connected, participantRole, handleRoleChanged);

  async function assignRole(targetIdentity: string, role: AssignableRole) {
    await base44.functions.invoke("manage-room-member", { eventId: event.id, participantIdentity: targetIdentity, role });
    await notifyRoleChange(targetIdentity, role);
  }

  async function toggleMeetingLock() {
    const next = !meetingLocked;
    try {
      setMediaMessage(next ? "Meeting wird gesperrt …" : "Meeting wird geöffnet …");
      await base44.functions.invoke("manage-event", { eventId: event.id, action: next ? "lock" : "unlock" });
      setMeetingLocked(next);
      setMediaMessage(next ? "Meeting gesperrt – keine neuen Personen" : "Meeting geöffnet");
    } catch (error) {
      setMediaMessage(messageOf(error));
    }
  }

  async function endForAll() {
    if (!window.confirm("Veranstaltung wirklich für alle beenden? Ein erneuter Beitritt ist danach nicht möglich.")) return;
    try {
      setMediaMessage("Veranstaltung wird beendet …");
      await base44.entities.Event.update(event.id, { status: "ended" });
      await broadcastEnd();
      await media.disconnect();
      onLeave();
    } catch (error) {
      setMediaMessage(messageOf(error));
    }
  }
  const continueAfterAdmission = useCallback(() => {
    if (!waitingPreferences) return;
    const preferences = waitingPreferences;
    setWaitingPreferences(null);
    void connect(preferences);
  }, [waitingPreferences]);
  if (waitingPreferences) return <WaitingForAdmission eventId={event.id} title={event.title} email={user.email} onAdmitted={continueAfterAdmission} onCancel={onLeave} />;
  if (!joined) return <PreJoin title={event.title} mode={event.mode} initialName={user.full_name || user.email} defaultCameraOn={event.default_camera_on} defaultMicrophoneOn={event.default_microphone_on} busy={connection === "connecting"} error={connection === "error" ? mediaMessage : ""} onCancel={onLeave} onJoin={connect} />;

  const mediaDisabled = !connected || participantRole === "viewer";
  return <div className="studio-shell"><RoomAudio room={media.room} connected={connected} /><DeviceSettings room={media.room} open={deviceSettingsOpen} onClose={() => setDeviceSettingsOpen(false)} /><header className="studio-header"><div className="studio-title"><button className="icon-button" onClick={() => void leave()}><ArrowLeft /></button><div><span>{event.mode === "meeting" ? "MEETING" : "LIVE-PRODUKTION"}</span><h1>{event.title}</h1></div></div><div className={`connection ${connection}`} >{connected ? <Wifi /> : <WifiOff />}<span>{mediaMessage}</span></div><div className="code-pill"><small>Raumcode</small><b>{event.join_code}</b><button onClick={() => void copyCode()}>{copied ? <Check /> : <Clipboard />}</button></div></header>{event.mode === "meeting" ? <MeetingCanvas eventId={event.id} title={event.title} room={media.room} connected={connected} fallbackName={user.full_name || user.email} localRole={participantRole} onModerationMute={handleModerationMute} onModerationRemove={handleModerationRemove} onAssignRole={assignRole} /> : <BroadcastCanvas eventId={event.id} eventTitle={event.title} room={media.room} connected={connected} fallbackName={user.full_name || user.email} grantedControl={canControlProgram} localRole={participantRole} onAssignRole={assignRole} />}<footer className="control-bar"><div className="control-group"><button disabled={mediaDisabled} className={mic ? "active" : ""} onClick={() => void toggleMic()}>{mic ? <Mic /> : <MicOff />}<span>{mic ? "Mikrofon an" : "Mikrofon aus"}</span></button><button disabled={mediaDisabled} className={camera ? "active" : ""} onClick={() => void toggleCamera()}>{camera ? <Camera /> : <CameraOff />}<span>{camera ? "Kamera an" : "Kamera aus"}</span></button><button disabled={mediaDisabled} className={sharing ? "active" : ""} onClick={() => void toggleSharing()}><MonitorUp /><span>Teilen</span></button><button disabled={!connected} className={deviceSettingsOpen ? "active" : ""} onClick={() => setDeviceSettingsOpen(true)}><Settings /><span>Geräte</span></button></div><button className="connect-button" disabled>{connected ? roleLabel(participantRole) : "Verbindung getrennt"}</button><div className="leave-actions">{event.mode === "meeting" && participantRole === "host" && <button className={`lock-button ${meetingLocked ? "active" : ""}`} onClick={() => void toggleMeetingLock()}>{meetingLocked ? <LockOpen /> : <Lock />}{meetingLocked ? "Öffnen" : "Sperren"}</button>}{participantRole === "host" && <button className="end-button" onClick={() => void endForAll()}>Für alle beenden</button>}<button className="leave-button" onClick={() => void leave()}>Raum verlassen</button></div></footer></div>;
}

function MeetingCanvas({ eventId, title, room, connected, fallbackName, localRole, onModerationMute, onModerationRemove, onAssignRole }: { eventId: string; title: string; room: MediaRoom["room"]; connected: boolean; fallbackName: string; localRole: ParticipantRole; onModerationMute: () => void; onModerationRemove: () => void; onAssignRole: (identity: string, role: AssignableRole) => Promise<void> }) {
  const mediaParticipants = useRoomMedia(room, connected);
  const { messages, send } = useMeetingChat(room, connected, fallbackName);
  const { raisedIdentities, setRaised } = useRaisedHands(room, connected);
  const { reactions, sendReaction } = useMeetingReactions(room, connected);
  const participants = mediaParticipants.map((participant) => ({ ...participant, handRaised: raisedIdentities.has(participant.identity) }));
  const { moderate } = useMeetingModeration(room, connected, localRole, onModerationMute, onModerationRemove);
  const [sideTab, setSideTab] = useState<"participants" | "chat">("participants");
  const [view, setView] = useState<MeetingRecordingLayout>("gallery");
  const [chatText, setChatText] = useState("");
  const [collaborationError, setCollaborationError] = useState("");
  const localHandRaised = participants.find((participant) => participant.isLocal)?.handRaised ?? false;
  const latestReactions = useMemo(() => {
    const latest = new Map<string, MeetingReaction>();
    reactions.forEach((reaction) => latest.set(reaction.senderIdentity, reaction));
    return latest;
  }, [reactions]);
  const tiles = participants.flatMap((participant) => [
    { key: `${participant.identity}-camera`, participant, name: participant.name, track: participant.cameraTrack, isScreenShare: false, isSpeaking: participant.isSpeaking },
    ...(participant.screenTrack ? [{ key: `${participant.identity}-screen`, participant, name: `${participant.name} · Bildschirm`, track: participant.screenTrack, isScreenShare: true, isSpeaking: false }] : []),
  ]);

  async function submitChat(event: React.FormEvent) {
    event.preventDefault();
    if (!chatText.trim()) return;
    try {
      await send(chatText);
      setChatText("");
      setCollaborationError("");
    } catch (error) {
      setCollaborationError(messageOf(error));
    }
  }

  async function toggleHand() {
    try {
      await setRaised(!localHandRaised);
      setCollaborationError("");
    } catch (error) {
      setCollaborationError(messageOf(error));
    }
  }

  async function react(emoji: MeetingReactionEmoji) {
    try {
      await sendReaction(emoji);
      setCollaborationError("");
    } catch (error) {
      setCollaborationError(messageOf(error));
    }
  }

  async function moderateParticipant(participant: ParticipantMedia, action: "mute" | "camera_off" | "remove") {
    if (action === "remove" && !window.confirm(`${participant.name} wirklich aus dem Raum entfernen?`)) return;
    try {
      if (action === "remove") {
        await base44.functions.invoke("manage-room-member", { eventId, action: "block", participantIdentity: participant.identity });
      }
      await moderate(participant.identity, participant.role, action);
      setCollaborationError("");
    } catch (error) {
      setCollaborationError(messageOf(error));
    }
  }

  async function changeRole(participant: ParticipantMedia, role: AssignableRole) {
    try {
      await onAssignRole(participant.identity, role);
      setCollaborationError("");
    } catch (error) {
      setCollaborationError(messageOf(error));
    }
  }

  const canRecord = connected && ["host", "cohost", "operator"].includes(localRole);
  const recordingSources = tiles.map((tile) => ({ id: tile.key, identity: tile.participant.identity, name: tile.participant.name, track: tile.track, isScreenShare: tile.isScreenShare, isSpeaking: tile.isSpeaking }));
  return <main className="meeting-canvas"><MeetingVideoArea tiles={tiles} connected={connected} fallbackName={fallbackName} view={view} onViewChange={setView} reactions={latestReactions} /><aside className="meeting-side"><WaitingRoomControls eventId={eventId} enabled={connected && ["host", "cohost", "operator"].includes(localRole)} /><div className="side-tabs"><button className={sideTab === "participants" ? "active" : ""} onClick={() => setSideTab("participants")}>Teilnehmer</button><button className={sideTab === "chat" ? "active" : ""} onClick={() => setSideTab("chat")}><MessageSquare size={15} /> Chat</button></div>{sideTab === "participants" ? <div className="participants-panel">{participants.length > 0 ? participants.map((participant) => <div className="participant-row" key={participant.identity}><div className={`avatar ${participant.isSpeaking ? "speaking" : ""}`}>{participant.name.slice(0, 2).toUpperCase()}</div><div><b>{participant.name}</b>{localRole === "host" && !participant.isLocal && participant.role !== "host" ? <select className="role-select" value={participant.role} onChange={(event) => void changeRole(participant, event.target.value as AssignableRole)}><option value="cohost">Co-Host</option><option value="operator">Operator</option><option value="speaker">Sprecher</option><option value="participant">Teilnehmer</option><option value="viewer">Zuschauer</option></select> : <span>{participant.isLocal ? `Sie · ${roleLabel(participant.role)}` : roleLabel(participant.role)}</span>}</div><div className="participant-status">{participant.handRaised && <Hand className="hand-raised" size={17} />}{participant.microphoneMuted ? <MicOff size={16} /> : <Mic size={16} />}{!participant.isLocal && canModerateRole(localRole, participant.role) && <div className="moderation-actions"><button disabled={participant.microphoneMuted} title="Stummschalten" onClick={() => void moderateParticipant(participant, "mute")}><VolumeX size={15} /></button><button disabled={!participant.cameraTrack} title="Kamera ausschalten" onClick={() => void moderateParticipant(participant, "camera_off")}><CameraOff size={15} /></button><button className="remove" title="Dauerhaft aus Raum entfernen" onClick={() => void moderateParticipant(participant, "remove")}><UserMinus size={15} /></button></div>}</div></div>) : <p className="side-empty">Noch nicht verbunden</p>}<button className={`raise-hand ${localHandRaised ? "active" : ""}`} disabled={!connected} onClick={() => void toggleHand()}><Hand /> {localHandRaised ? "Hand senken" : "Hand heben"}</button><div className="meeting-reactions" aria-label="Live-Reaktionen">{MEETING_REACTIONS.map((emoji) => <button key={emoji} disabled={!connected} title={`Mit ${emoji} reagieren`} onClick={() => void react(emoji)}>{emoji}</button>)}</div></div> : <div className="chat-panel"><div className="chat-messages">{messages.length > 0 ? messages.map((message) => <div className={`chat-message ${message.isLocal ? "local" : ""}`} key={message.id}><div><b>{message.senderName}</b><time>{new Date(message.sentAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</time></div><p>{message.text}</p></div>) : <p className="side-empty">Noch keine Nachrichten</p>}</div><form className="chat-form" onSubmit={submitChat}><input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Nachricht schreiben …" maxLength={2000} disabled={!connected} /><button disabled={!connected || !chatText.trim()}><MessageSquare size={16} /> Senden</button></form></div>}{collaborationError && <div className="inline-error">{collaborationError}</div>}<MeetingRecorder room={room} title={title} layout={view} sources={recordingSources} enabled={canRecord} /></aside></main>;
}

interface MeetingVideoTile {
  key: string;
  participant: ParticipantMedia;
  name: string;
  track?: VideoMediaTrack;
  isScreenShare: boolean;
  isSpeaking: boolean;
}

function MeetingVideoArea({ tiles, connected, fallbackName, view, onViewChange, reactions }: { tiles: MeetingVideoTile[]; connected: boolean; fallbackName: string; view: MeetingRecordingLayout; onViewChange: (view: MeetingRecordingLayout) => void; reactions: Map<string, MeetingReaction> }) {
  const [stageKey, setStageKey] = useState<string>();
  const stage = selectMeetingStage(tiles, stageKey);
  const filmstrip = tiles.filter((tile) => tile.key !== stage?.key);

  useEffect(() => {
    if (stage?.key !== stageKey) setStageKey(stage?.key);
  }, [stage?.key, stageKey]);

  return <section className={`meeting-video-area ${view}`}><div className="meeting-view-switch"><button className={view === "gallery" ? "active" : ""} onClick={() => onViewChange("gallery")}><Users /> Galerie</button><button className={view === "speaker" ? "active" : ""} onClick={() => onViewChange("speaker")}><MonitorUp /> Sprecher</button></div>{view === "gallery" ? <div className="meeting-grid">{tiles.length > 0 ? tiles.map((tile, index) => <ParticipantTile key={tile.key} name={tile.name} participant={tile.participant} track={tile.track} reaction={tile.isScreenShare ? undefined : reactions.get(tile.participant.identity)} primary={index === 0} />) : <ParticipantTile name={fallbackName} primary />}<div className="invite-tile"><Users /><h3>{connected ? "Weitere Teilnehmer einladen" : "Medien verbinden"}</h3><p>{connected ? "Teilen Sie den Raumcode aus der Kopfleiste." : "Verbinden Sie zuerst den Medienserver über die Schaltfläche unten."}</p></div></div> : <div className="speaker-view"><div className="speaker-stage">{stage ? <ParticipantTile name={stage.name} participant={stage.participant} track={stage.track} reaction={stage.isScreenShare ? undefined : reactions.get(stage.participant.identity)} primary /> : <ParticipantTile name={fallbackName} primary />}</div><div className="meeting-filmstrip">{filmstrip.length > 0 ? filmstrip.map((tile) => <ParticipantTile key={tile.key} name={tile.name} participant={tile.participant} track={tile.track} reaction={tile.isScreenShare ? undefined : reactions.get(tile.participant.identity)} />) : <div className="filmstrip-empty">Weitere Teilnehmer erscheinen hier</div>}</div></div>}</section>;
}

function BroadcastCanvas({ eventId, eventTitle, room, connected, fallbackName, grantedControl, localRole, onAssignRole }: { eventId: string; eventTitle: string; room: MediaRoom["room"]; connected: boolean; fallbackName: string; grantedControl: boolean; localRole: ParticipantRole; onAssignRole: (identity: string, role: AssignableRole) => Promise<void> }) {
  const participants = useRoomMedia(room, connected);
  const mediaLibrary = useMediaLibrary();
  const participantSources = participants.flatMap((participant) => [
    { id: `${participant.identity}-camera`, name: participant.name, participantIdentity: participant.identity, trackSource: "camera" as const, participant, track: participant.cameraTrack },
    ...(participant.screenTrack ? [{ id: `${participant.identity}-screen`, name: `${participant.name} · Bildschirm`, participantIdentity: participant.identity, trackSource: "screen" as const, participant, track: participant.screenTrack }] : []),
  ]);
  const mediaSources = mediaLibrary.assets.map((media) => ({ id: `media-${media.id}`, name: media.name, participantIdentity: `media:${media.id}`, trackSource: "media" as const, media }));
  const sources = [...participantSources, ...mediaSources];
  const sourceQualities = useSourceQuality(participantSources, connected);
  const [previewIds, setPreviewIds] = useState<string[]>([]);
  const [layout, setLayout] = useState<BroadcastLayout>("single");
  const [transition, setTransition] = useState<BroadcastTransition>("cut");
  const [overlayTitle, setOverlayTitle] = useState("");
  const [overlaySubtitle, setOverlaySubtitle] = useState("");
  const [switchError, setSwitchError] = useState("");
  const [programOutputOpen, setProgramOutputOpen] = useState(false);
  const [audioMix, setAudioMix] = useState<Record<string, number>>({});
  const { canControl, programState, take } = useBroadcastCoordination(room, connected, grantedControl);
  const tallyState = broadcastTallyState(programState?.sourceIds ?? [], participants.find((participant) => participant.isLocal)?.identity);
  useEffect(() => {
    setOverlayTitle(programState?.overlay?.title ?? "");
    setOverlaySubtitle(programState?.overlay?.subtitle ?? "");
  }, [programState?.revision]);
  const { scenes, loading: scenesLoading, error: scenesError, save: saveScene, remove: removeScene } = useBroadcastScenes(eventId, canControl);
  const sourceCount = layout === "single" ? 1 : 2;
  const selectedPreviewSources = previewIds.map((id) => sources.find((source) => source.id === id)).filter((source): source is NonNullable<typeof source> => Boolean(source));
  const previewSources = [...selectedPreviewSources, ...sources.filter((source) => !selectedPreviewSources.some((selected) => selected.id === source.id))].slice(0, sourceCount);
  const programSources = (programState?.sourceIds || []).map((id) => sources.find((source) => source.id === id)).filter((source): source is NonNullable<typeof source> => Boolean(source));

  async function takePreview() {
    if (previewSources.length === 0) return;
    try {
      await take(previewSources.map((source) => source.id), layout, transition, normalizeBroadcastOverlay(overlayTitle, overlaySubtitle));
      setSwitchError("");
    } catch (error) {
      setSwitchError(messageOf(error));
    }
  }

  function selectSource(sourceId: string) {
    setPreviewIds((current) => {
      const online = current.filter((id) => sources.some((source) => source.id === id));
      if (layout === "single") return [sourceId];
      if (online.includes(sourceId)) return [sourceId, ...online.filter((id) => id !== sourceId)].slice(0, 2);
      return [...online, sourceId].slice(-2);
    });
  }

  function selectLayout(nextLayout: BroadcastLayout) {
    setLayout(nextLayout);
    setPreviewIds((current) => current.slice(0, nextLayout === "single" ? 1 : 2));
  }

  async function storeScene() {
    const name = window.prompt("Name der neuen Szene", `Szene ${scenes.length + 1}`)?.trim();
    if (!name || previewSources.length === 0) return;
    try {
      await saveScene(name, layout, previewSources as AvailableSceneSource[]);
      setSwitchError("");
    } catch (error) {
      setSwitchError(messageOf(error));
    }
  }

  function loadScene(scene: BroadcastScene) {
    const ids = resolveSceneSourceIds(scene, sources);
    const requiredSources = scene.layout === "single" ? 1 : 2;
    if (ids.length < requiredSources) {
      setSwitchError(`Die Szene „${scene.name}“ kann nicht geladen werden, weil mindestens eine Quelle offline ist.`);
      return;
    }
    setLayout(scene.layout);
    setPreviewIds(ids);
    setSwitchError("");
  }

  async function deleteScene(scene: BroadcastScene) {
    if (!window.confirm(`Szene „${scene.name}“ wirklich löschen?`)) return;
    try {
      await removeScene(scene.id);
      setSwitchError("");
    } catch (error) {
      setSwitchError(messageOf(error));
    }
  }

  async function changeRole(participant: ParticipantMedia, role: AssignableRole) {
    try {
      await onAssignRole(participant.identity, role);
      setSwitchError("");
    } catch (error) {
      setSwitchError(messageOf(error));
    }
  }

  const remoteParticipants = participants.filter((participant) => !participant.isLocal && participant.role !== "host");
  const closeProgramOutput = useCallback(() => setProgramOutputOpen(false), []);
  const reportProgramOutputError = useCallback((message: string) => setSwitchError(message), []);
  const updateAudioMix = useCallback((volumes: Record<string, number>) => setAudioMix(volumes), []);

return <main className="broadcast-canvas"><div className={`broadcast-tally ${tallyState}`}><span />{tallyState === "on-air" ? "ON AIR · Ihre Quelle ist im Programm" : "STANDBY · Ihre Quelle ist nicht im Programm"}</div><ProgramOutputWindow open={programOutputOpen} onClosed={closeProgramOutput} onError={reportProgramOutputError}><ProgramLayout layout={programState?.layout || "single"} sources={programSources} overlay={programState?.overlay} /></ProgramOutputWindow><aside className="source-rail"><div className="rail-heading"><b>Live-Quellen · {participantSources.length}</b><span className={`master-badge ${canControl ? "active" : ""}`}>{canControl ? "MASTER" : "QUELLE"}</span></div><RundownPanel eventId={eventId} canControl={canControl} /><MediaLibrary assets={mediaLibrary.assets} selectedIds={previewIds} canControl={canControl} error={mediaLibrary.error} onAdd={mediaLibrary.add} onRemove={mediaLibrary.remove} onSelect={selectSource} />{localRole === "host" && remoteParticipants.length > 0 && <div className="broadcast-team"><span className="eyebrow">TEAMROLLEN</span>{remoteParticipants.map((participant) => <label key={participant.identity}><b>{participant.name}</b><select className="role-select" value={participant.role} onChange={(event) => void changeRole(participant, event.target.value as AssignableRole)}><option value="cohost">Co-Host</option><option value="operator">Operator</option><option value="speaker">Sprecher</option><option value="participant">Teilnehmer</option><option value="viewer">Zuschauer</option></select></label>)}</div>}{participantSources.length > 0 ? participantSources.map((source) => <button key={source.id} className={`source ${previewSources.some((preview) => preview.id === source.id) ? "active" : ""}`} onClick={() => selectSource(source.id)}><div className="mini-preview"><ParticipantTile name={source.name} participant={source.participant} track={source.track} /></div><span><b>{source.name}</b><small>{source.participant.isLocal ? "Lokale Quelle" : "Remote-Quelle"}</small><SourceQualityLine quality={sourceQualities[source.id]} /></span></button>) : <div className="source-empty"><Video /><span>{connected ? "Warte auf Videoquellen" : "Noch nicht verbunden"}</span></div>}</aside><section className="switcher"><div className="monitors"><div><span className="monitor-label preview">VORSCHAU</span><div className="monitor"><ProgramLayout layout={layout} sources={previewSources.length > 0 ? previewSources : [{ id: "fallback", name: fallbackName, participant: participants[0] }]} overlay={normalizeBroadcastOverlay(overlayTitle, overlaySubtitle)} /></div></div><div><span className="monitor-label program">PROGRAMM · SYNCHRON</span><div key={programState?.revision || "empty"} className={`monitor program-frame ${programState?.transition === "fade" ? "fade-in" : ""}`}><ProgramLayout layout={programState?.layout || "single"} sources={programSources} overlay={programState?.overlay} /></div></div></div><div className="transition-row"><span>{canControl ? "Übergang" : "Programmbild wird vom Master gesteuert"}</span><button className={transition === "cut" ? "selected" : ""} disabled={!canControl} onClick={() => setTransition("cut")}>Schnitt</button><button className={transition === "fade" ? "selected" : ""} disabled={!canControl} onClick={() => setTransition("fade")}>Überblende</button><button className="take" disabled={previewSources.length === 0 || !canControl} onClick={() => void takePreview()}>TAKE</button></div><div className="graphics-editor"><div className="graphics-heading"><span className="eyebrow">EINBLENDUNG</span><small className={programState?.overlay ? "live" : ""}>{programState?.overlay ? "IM PROGRAMM" : "AUS"}</small></div><div className="graphics-fields"><input value={overlayTitle} onChange={(event) => setOverlayTitle(event.target.value)} placeholder="Name oder Titel" maxLength={80} disabled={!canControl} /><input value={overlaySubtitle} onChange={(event) => setOverlaySubtitle(event.target.value)} placeholder="Funktion, Thema oder Hinweis" maxLength={120} disabled={!canControl} /><button type="button" disabled={!canControl || (!overlayTitle && !overlaySubtitle)} onClick={() => { setOverlayTitle(""); setOverlaySubtitle(""); }}>Ausblenden vorbereiten</button></div><small>Die Vorschau zeigt den Entwurf. TAKE schaltet Bild und Einblendung gemeinsam.</small></div><div className="scene-strip"><button className={`scene ${layout === "single" ? "selected" : ""}`} disabled={!canControl} onClick={() => selectLayout("single")}><span>1</span><b>Einzelbild</b></button><button className={`scene ${layout === "side_by_side" ? "selected" : ""}`} disabled={!canControl} onClick={() => selectLayout("side_by_side")}><span>2</span><b>Nebeneinander</b></button><button className={`scene ${layout === "picture_in_picture" ? "selected" : ""}`} disabled={!canControl} onClick={() => selectLayout("picture_in_picture")}><span>3</span><b>Bild-in-Bild</b></button><button className="scene add" disabled={!canControl || previewSources.length === 0} onClick={() => void storeScene()}><Plus /><b>Speichern</b></button></div>{canControl && <div className="saved-scenes"><div className="saved-scenes-heading"><b>Gespeicherte Szenen</b><span>{scenesLoading ? "Lädt …" : `${scenes.length}`}</span></div>{scenes.length > 0 ? scenes.map((scene) => <div className="saved-scene" key={scene.id}><button onClick={() => loadScene(scene)}><span>{scene.layout === "single" ? "1" : "2"}</span><b>{scene.name}</b></button><button className="delete-scene" title="Szene löschen" onClick={() => void deleteScene(scene)}>×</button></div>) : !scenesLoading && <small>Noch keine Szenen gespeichert</small>}</div>}{(switchError || scenesError) && <div className="inline-error">{switchError || scenesError}</div>}</section><aside className="meter-panel"><SourceQualityMonitor sources={participantSources} qualities={sourceQualities} /><span className="eyebrow audio-heading">AUDIO</span><BroadcastAudioMixer room={room} participants={participants} enabled={canControl} onMixChanged={updateAudioMix} /><ProgramRecorder room={room} title={eventTitle} programState={programState} sources={sources} audioMix={audioMix} enabled={canControl} /><ProgramStreamer room={room} programState={programState} sources={sources} audioMix={audioMix} enabled={canControl} /><button className={`output-window-button ${programOutputOpen ? "active" : ""}`} onClick={() => setProgramOutputOpen((current) => !current)}><MonitorUp /><span><b>{programOutputOpen ? "Ausgabefenster schließen" : "Ausgabefenster öffnen"}</b><small>Sauberes 1080p60-Programmbild</small></span></button><div className="stream-target"><Radio /><div><b>Programmausgabe</b><span>{programState ? "Mit allen Clients synchronisiert" : "Wartet auf TAKE vom Master"}</span></div></div></aside></main>;
}

function LocalMediaTile({ asset }: { asset: LocalMediaAsset }) {
  return <div className="participant-tile media-program-tile"><div className="video-placeholder">{asset.type === "image" ? <img src={asset.url} alt={asset.name} /> : asset.type === "video" ? <video src={asset.url} autoPlay loop playsInline muted /> : <div className="audio-program-placeholder"><Radio /><b>{asset.name}</b><span>Audioquelle</span></div>}</div><div className="tile-label"><span>{asset.name}</span><Video size={15} /></div></div>;
}

function ProgramLayout({ layout, sources, overlay }: { layout: BroadcastLayout; sources: Array<{ id: string; name: string; participant?: ParticipantMedia; track?: VideoMediaTrack; media?: LocalMediaAsset }>; overlay?: BroadcastOverlay | null }) {
  return <div className={`program-layout ${layout}`}>{sources.length > 0 ? sources.map((source) => source.media ? <LocalMediaTile key={source.id} asset={source.media} /> : <ParticipantTile key={source.id} name={source.name} participant={source.participant} track={source.track} />) : <ParticipantTile name="Noch kein Programmbild" />}{overlay?.title && <div className="program-overlay"><b>{overlay.title}</b>{overlay.subtitle && <span>{overlay.subtitle}</span>}</div>}</div>;
}

function ParticipantTile({ name, participant, track, primary = false, reaction }: { name: string; participant?: ParticipantMedia; track?: VideoMediaTrack; primary?: boolean; reaction?: MeetingReaction }) {
  return <div className={`participant-tile ${primary ? "primary-tile" : ""} ${participant?.isSpeaking ? "speaking" : ""}`}><div className="video-placeholder">{track ? <VideoTrackElement track={track} muted={participant?.isLocal} /> : <div className="avatar large">{name.slice(0, 2).toUpperCase()}</div>}</div>{participant?.handRaised && <div className="tile-hand"><Hand size={16} /> Hand gehoben</div>}{reaction && <div key={reaction.id} className="tile-reaction" title={`${reaction.senderName} reagiert`}><span>{reaction.emoji}</span></div>}<div className="tile-label"><span>{name}{participant?.isLocal ? " (Sie)" : ""}</span>{track ? <Camera size={15} /> : <CameraOff size={15} />}</div></div>;
}
