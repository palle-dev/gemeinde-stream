import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Mic, MicOff, Radio, Settings2, Volume2 } from "lucide-react";
import { Room } from "livekit-client";
import type { MediaPreferences } from "../lib/room";

interface PreJoinProps {
  title: string;
  mode: "meeting" | "broadcast";
  initialName: string;
  defaultCameraOn?: boolean;
  defaultMicrophoneOn?: boolean;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onJoin: (preferences: MediaPreferences) => Promise<void>;
}

const STORAGE_KEY = "gemeinde-stream.media-preferences";

function savedPreferences(): Partial<MediaPreferences> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function PreJoin({ title, mode, initialName, defaultCameraOn = true, defaultMicrophoneOn = true, busy, error, onCancel, onJoin }: PreJoinProps) {
  const saved = savedPreferences();
  const [displayName, setDisplayName] = useState(saved.displayName || initialName);
  const [cameraEnabled, setCameraEnabled] = useState(saved.cameraEnabled ?? defaultCameraOn);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(saved.microphoneEnabled ?? defaultMicrophoneOn);
  const [cameraId, setCameraId] = useState(saved.cameraId || "");
  const [microphoneId, setMicrophoneId] = useState(saved.microphoneId || "");
  const [speakerId, setSpeakerId] = useState(saved.speakerId || "");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [deviceError, setDeviceError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDevices() {
      try {
        const [nextCameras, nextMicrophones, nextSpeakers] = await Promise.all([
          Room.getLocalDevices("videoinput"),
          Room.getLocalDevices("audioinput"),
          Room.getLocalDevices("audiooutput", false),
        ]);
        if (cancelled) return;
        setCameras(nextCameras);
        setMicrophones(nextMicrophones);
        setSpeakers(nextSpeakers);
        setCameraId((current) => nextCameras.some((device) => device.deviceId === current) ? current : (nextCameras[0]?.deviceId || ""));
        setMicrophoneId((current) => nextMicrophones.some((device) => device.deviceId === current) ? current : (nextMicrophones[0]?.deviceId || ""));
        setSpeakerId((current) => nextSpeakers.some((device) => device.deviceId === current) ? current : (nextSpeakers[0]?.deviceId || ""));
      } catch (cause) {
        if (!cancelled) setDeviceError(cause instanceof Error ? cause.message : "Mediengeräte konnten nicht gelesen werden.");
      }
    }
    void loadDevices();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    previewStreamRef.current?.getTracks().forEach((track) => track.stop());
    previewStreamRef.current = null;
    if (!cameraEnabled) {
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }

    navigator.mediaDevices.getUserMedia({
      video: cameraId ? { deviceId: { exact: cameraId }, width: 1280, height: 720 } : true,
      audio: false,
    }).then((stream) => {
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      previewStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setDeviceError("");
    }).catch((cause) => setDeviceError(cause instanceof Error ? cause.message : "Kameravorschau nicht verfügbar."));

    return () => {
      cancelled = true;
      previewStreamRef.current?.getTracks().forEach((track) => track.stop());
      previewStreamRef.current = null;
    };
  }, [cameraEnabled, cameraId]);

  async function join() {
    const preferences: MediaPreferences = {
      displayName: displayName.trim(),
      cameraEnabled,
      microphoneEnabled,
      cameraId: cameraId || undefined,
      microphoneId: microphoneId || undefined,
      speakerId: speakerId || undefined,
    };
    if (!preferences.displayName) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    previewStreamRef.current?.getTracks().forEach((track) => track.stop());
    await onJoin(preferences);
  }

  return <main className="prejoin-shell"><section className="prejoin-preview"><div className="prejoin-video">{cameraEnabled ? <video ref={videoRef} autoPlay playsInline muted /> : <div className="camera-disabled"><CameraOff /><span>Kamera ausgeschaltet</span></div>}<div className="prejoin-name">{displayName || initialName}</div></div><div className="prejoin-toggles"><button className={microphoneEnabled ? "active" : ""} onClick={() => setMicrophoneEnabled((value) => !value)}>{microphoneEnabled ? <Mic /> : <MicOff />}<span>{microphoneEnabled ? "Mikrofon an" : "Mikrofon aus"}</span></button><button className={cameraEnabled ? "active" : ""} onClick={() => setCameraEnabled((value) => !value)}>{cameraEnabled ? <Camera /> : <CameraOff />}<span>{cameraEnabled ? "Kamera an" : "Kamera aus"}</span></button></div></section><section className="prejoin-settings"><div className="logo-lockup"><div className="brand-mark small"><Radio /></div><div><b>{title}</b><small>{mode === "meeting" ? "Meeting" : "Live-Produktion"}</small></div></div><div className="prejoin-heading"><Settings2 /><div><h1>Bereit zum Beitreten?</h1><p>Prüfen Sie Name, Kamera und Audiogeräte.</p></div></div><label>Anzeigename<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} required /></label><label><span><Mic size={15} /> Mikrofon</span><select value={microphoneId} onChange={(event) => setMicrophoneId(event.target.value)}>{microphones.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Mikrofon ${index + 1}`}</option>)}</select></label><label><span><Camera size={15} /> Kamera</span><select value={cameraId} onChange={(event) => setCameraId(event.target.value)}>{cameras.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Kamera ${index + 1}`}</option>)}</select></label><label><span><Volume2 size={15} /> Lautsprecher</span><select value={speakerId} onChange={(event) => setSpeakerId(event.target.value)}>{speakers.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Lautsprecher ${index + 1}`}</option>)}</select></label>{deviceError && <div className="warning-banner">{deviceError}</div>}{error && <div className="error-banner">{error}</div>}<div className="prejoin-actions"><button className="ghost" onClick={onCancel} disabled={busy}>Zurück</button><button className="primary" onClick={() => void join()} disabled={busy || !displayName.trim()}>{busy ? "Verbindung wird aufgebaut …" : "Jetzt beitreten"}</button></div></section></main>;
}
