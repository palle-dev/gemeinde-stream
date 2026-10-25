import { useEffect, useRef, useState } from "react";
import { CircleStop, Plus, Radio, Trash2 } from "lucide-react";
import type { Room } from "livekit-client";
import type { BroadcastProgramState } from "./BroadcastCoordination";
import { createProgramMediaSession, preferredProgramMimeType, type ProgramMediaSession, type ProgramMediaSource } from "./ProgramMedia";

export type StreamPlatform = "youtube" | "facebook" | "custom";
export interface StreamProfile { id: string; label: string; platform: StreamPlatform; serverUrl: string; streamKey: string; enabled: boolean; }
interface StoredProfile { id: string; label: string; platform: StreamPlatform; serverUrl: string; enabled: boolean; }
const STORAGE_KEY = "gemeinde-stream.stream-profiles.v1";
const platformDefaults: Record<StreamPlatform, { label: string; serverUrl: string }> = { youtube: { label: "YouTube", serverUrl: "rtmps://a.rtmp.youtube.com/live2" }, facebook: { label: "Facebook", serverUrl: "rtmps://live-api-s.facebook.com:443/rtmp/" }, custom: { label: "Eigenes Ziel", serverUrl: "" } };

export function isStreamingUrl(value: string): boolean { try { const protocol = new URL(value.trim()).protocol; return protocol === "rtmp:" || protocol === "rtmps:"; } catch { return false; } }
export function profilesForStorage(profiles: StreamProfile[]): StoredProfile[] { return profiles.map(({ id, label, platform, serverUrl, enabled }) => ({ id, label, platform, serverUrl, enabled })); }
function loadProfiles(): StreamProfile[] { try { const values = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as StoredProfile[]; if (Array.isArray(values) && values.length) return values.slice(0, 5).map((value) => ({ ...value, streamKey: "" })); } catch { /* Use default. */ } return [{ id: crypto.randomUUID(), platform: "youtube", ...platformDefaults.youtube, streamKey: "", enabled: true }]; }

export function MultiProgramStreamer({ room, programState, sources, audioMix, enabled }: { room: Room; programState: BroadcastProgramState | null; sources: ProgramMediaSource[]; audioMix: Record<string, number>; enabled: boolean }) {
  const [profiles, setProfiles] = useState<StreamProfile[]>(loadProfiles); const [status, setStatus] = useState<"idle" | "starting" | "streaming" | "stopping" | "error">("idle"); const [errors, setErrors] = useState<Record<string, string>>({}); const [activeIds, setActiveIds] = useState<string[]>([]); const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null); const sessionRef = useRef<ProgramMediaSession | null>(null); const writesRef = useRef(Promise.resolve()); const activeRef = useRef(new Set<string>()); const programRef = useRef({ programState, sources, audioMix });
  useEffect(() => { programRef.current = { programState, sources, audioMix }; }, [audioMix, programState, sources]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(profilesForStorage(profiles))); }, [profiles]);
  useEffect(() => { if (status !== "streaming") return; const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000); return () => clearInterval(timer); }, [status]);
  useEffect(() => window.desktop.onStreamStatus((next) => { activeRef.current.delete(next.targetId); setActiveIds([...activeRef.current]); setErrors((current) => ({ ...current, [next.targetId]: next.message })); if (!activeRef.current.size) { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); sessionRef.current?.cleanup(); recorderRef.current = null; sessionRef.current = null; setStatus("error"); } }), []);
  useEffect(() => () => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); sessionRef.current?.cleanup(); void window.desktop.cancelStream(); }, []);
  const update = (id: string, values: Partial<StreamProfile>) => setProfiles((current) => current.map((profile) => profile.id === id ? { ...profile, ...values } : profile));
  const add = () => { if (profiles.length < 5) setProfiles((current) => [...current, { id: crypto.randomUUID(), platform: "custom", ...platformDefaults.custom, streamKey: "", enabled: true }]); };
  const remove = (id: string) => setProfiles((current) => current.filter((profile) => profile.id !== id));
  const setPlatform = (profile: StreamProfile, platform: StreamPlatform) => update(profile.id, { platform, ...platformDefaults[platform] });

  async function start(event: React.FormEvent) {
    event.preventDefault(); if (!programState || status === "starting" || status === "streaming") return;
    const targets = profiles.filter((profile) => profile.enabled); const invalid = targets.find((profile) => !profile.label.trim() || !isStreamingUrl(profile.serverUrl) || !profile.streamKey.trim());
    if (!targets.length) { setErrors({ general: "Aktivieren Sie mindestens ein Streaming-Ziel." }); return; }
    if (invalid) { setErrors({ [invalid.id]: `Server und Stream-Schlüssel für ${invalid.label || "dieses Ziel"} fehlen.` }); return; }
    setStatus("starting"); setErrors({});
    try {
      const session = await createProgramMediaSession(room, () => programRef.current); sessionRef.current = session;
      await window.desktop.beginStream(targets.map((profile) => ({ id: profile.id, label: profile.label, serverUrl: profile.serverUrl, streamKey: profile.streamKey })));
      activeRef.current = new Set(targets.map((profile) => profile.id)); setActiveIds([...activeRef.current]);
      const mimeType = preferredProgramMimeType(); const recorder = new MediaRecorder(session.stream, mimeType ? { mimeType, videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 192_000 } : undefined); recorderRef.current = recorder; writesRef.current = Promise.resolve();
      recorder.addEventListener("dataavailable", (event) => { if (!event.data.size) return; writesRef.current = writesRef.current.then(async () => window.desktop.appendStream(await event.data.arrayBuffer())).catch((cause) => { setErrors({ general: cause instanceof Error ? cause.message : "Alle Streaming-Ziele sind ausgefallen." }); setStatus("error"); session.cleanup(); void window.desktop.cancelStream(); }); });
      recorder.addEventListener("error", () => { setErrors({ general: "Die Programmkodierung wurde unerwartet beendet." }); setStatus("error"); session.cleanup(); void window.desktop.cancelStream(); });
      recorder.start(500); setElapsed(0); setStatus("streaming");
    } catch (cause) { sessionRef.current?.cleanup(); sessionRef.current = null; await window.desktop.cancelStream().catch(() => undefined); setErrors({ general: cause instanceof Error ? cause.message : "Mehrziel-Stream konnte nicht gestartet werden." }); setStatus("error"); }
  }
  async function stop() { const recorder = recorderRef.current; if (!recorder || recorder.state !== "recording") return; setStatus("stopping"); try { await new Promise<void>((resolve) => { recorder.addEventListener("stop", () => resolve(), { once: true }); recorder.stop(); }); await writesRef.current; await window.desktop.finishStream(); sessionRef.current?.cleanup(); recorderRef.current = null; sessionRef.current = null; activeRef.current.clear(); setActiveIds([]); setStatus("idle"); } catch (cause) { await window.desktop.cancelStream().catch(() => undefined); sessionRef.current?.cleanup(); setErrors({ general: cause instanceof Error ? cause.message : "Streams konnten nicht sauber beendet werden." }); setStatus("error"); } }

  const streaming = status === "streaming"; const locked = streaming || status === "starting" || status === "stopping"; const elapsedText = new Date(elapsed * 1000).toISOString().slice(11, 19);
  return <form className={`program-streamer multi ${streaming ? "streaming" : ""}`} onSubmit={start}><div className="streamer-heading"><span className="eyebrow">STREAMING-ZIELE</span>{streaming && <small>● {activeIds.length} LIVE · {elapsedText}</small>}</div><div className="stream-profile-list">{profiles.map((profile) => <article key={profile.id} className={activeIds.includes(profile.id) ? "live" : errors[profile.id] ? "failed" : ""}><div className="stream-profile-heading"><input type="checkbox" checked={profile.enabled} onChange={(event) => update(profile.id, { enabled: event.target.checked })} disabled={locked} /><select value={profile.platform} onChange={(event) => setPlatform(profile, event.target.value as StreamPlatform)} disabled={locked}><option value="youtube">YouTube</option><option value="facebook">Facebook</option><option value="custom">Eigenes Ziel</option></select>{profiles.length > 1 && <button type="button" onClick={() => remove(profile.id)} disabled={locked}><Trash2 /></button>}</div><input value={profile.label} onChange={(event) => update(profile.id, { label: event.target.value })} placeholder="Bezeichnung" disabled={locked} /><input value={profile.serverUrl} onChange={(event) => update(profile.id, { serverUrl: event.target.value })} placeholder="rtmps://server/live" disabled={locked} /><input type="password" value={profile.streamKey} onChange={(event) => update(profile.id, { streamKey: event.target.value })} placeholder="Stream-Schlüssel (nicht gespeichert)" autoComplete="off" disabled={locked} />{activeIds.includes(profile.id) && <small className="profile-live">● LIVE</small>}{errors[profile.id] && <small className="streamer-error">{errors[profile.id]}</small>}</article>)}</div>{!locked && profiles.length < 5 && <button type="button" className="add-stream-target" onClick={add}><Plus /> Weiteres Ziel</button>}{!streaming ? <button className="start-stream" disabled={!enabled || !programState || locked}><Radio /><span><b>{status === "starting" ? "Ziele werden verbunden …" : "Mehrziel-Stream starten"}</b><small>Bis zu 5 Ziele · 1080p60</small></span></button> : <button type="button" className="stop-stream" onClick={() => void stop()}><CircleStop /><span><b>Alle Streams stoppen</b><small>{activeIds.length} Ziele aktiv</small></span></button>}{errors.general && <small className="streamer-error">{errors.general}</small>}</form>;
}
