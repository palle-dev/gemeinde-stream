import { useEffect, useState } from "react";
import { Camera, Mic, RefreshCw, Settings2, Volume2, X } from "lucide-react";
import { Room } from "livekit-client";

const STORAGE_KEY = "gemeinde-stream.media-preferences";
const kinds = ["audioinput", "videoinput", "audiooutput"] as const;
type DeviceKind = typeof kinds[number];

const kindDetails: Record<DeviceKind, { label: string; icon: typeof Mic; preference: string }> = {
  audioinput: { label: "Mikrofon", icon: Mic, preference: "microphoneId" },
  videoinput: { label: "Kamera", icon: Camera, preference: "cameraId" },
  audiooutput: { label: "Lautsprecher", icon: Volume2, preference: "speakerId" },
};

export function fallbackDeviceLabel(kind: DeviceKind, index: number): string {
  return `${kindDetails[kind].label} ${index + 1}`;
}

function rememberDevice(kind: DeviceKind, deviceId: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, unknown>;
    saved[kindDetails[kind].preference] = deviceId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Device switching must still work when local storage is unavailable.
  }
}

export function DeviceSettings({ room, open, onClose }: { room: Room; open: boolean; onClose: () => void }) {
  const [devices, setDevices] = useState<Record<DeviceKind, MediaDeviceInfo[]>>({ audioinput: [], videoinput: [], audiooutput: [] });
  const [selected, setSelected] = useState<Record<DeviceKind, string>>({ audioinput: "", videoinput: "", audiooutput: "" });
  const [switching, setSwitching] = useState<DeviceKind | null>(null);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const entries = await Promise.all(kinds.map(async (kind) => [kind, await Room.getLocalDevices(kind, kind !== "audiooutput")] as const));
      const next = Object.fromEntries(entries) as Record<DeviceKind, MediaDeviceInfo[]>;
      setDevices(next);
      setSelected(Object.fromEntries(kinds.map((kind) => {
        const active = room.getActiveDevice(kind);
        return [kind, next[kind].some((device) => device.deviceId === active) ? active : (next[kind][0]?.deviceId || "")];
      })) as Record<DeviceKind, string>);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Mediengeräte konnten nicht gelesen werden.");
    }
  }

  useEffect(() => {
    if (!open) return;
    void refresh();
    const changed = () => void refresh();
    navigator.mediaDevices.addEventListener("devicechange", changed);
    return () => navigator.mediaDevices.removeEventListener("devicechange", changed);
  }, [open, room]);

  async function choose(kind: DeviceKind, deviceId: string) {
    const previous = selected[kind];
    setSelected((current) => ({ ...current, [kind]: deviceId }));
    setSwitching(kind);
    setError("");
    try {
      const changed = await room.switchActiveDevice(kind, deviceId, true);
      if (!changed && room.getActiveDevice(kind) !== deviceId) throw new Error(`${kindDetails[kind].label} konnte nicht umgeschaltet werden.`);
      rememberDevice(kind, deviceId);
    } catch (cause) {
      setSelected((current) => ({ ...current, [kind]: previous }));
      setError(cause instanceof Error ? cause.message : `${kindDetails[kind].label} konnte nicht umgeschaltet werden.`);
    } finally {
      setSwitching(null);
    }
  }

  if (!open) return null;
  return <div className="modal-backdrop device-modal-backdrop"><section className="device-modal" role="dialog" aria-modal="true" aria-label="Audio- und Videogeräte"><div className="device-modal-heading"><div><Settings2 /><span><b>Audio- und Videogeräte</b><small>Geräte während der Sitzung wechseln</small></span></div><button className="icon-button" onClick={onClose} aria-label="Schließen"><X /></button></div><div className="device-selectors">{kinds.map((kind) => { const Icon = kindDetails[kind].icon; return <label key={kind}><span><Icon />{kindDetails[kind].label}{switching === kind && <small>Wird gewechselt …</small>}</span><select value={selected[kind]} onChange={(event) => void choose(kind, event.target.value)} disabled={switching !== null || devices[kind].length === 0}>{devices[kind].length > 0 ? devices[kind].map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || fallbackDeviceLabel(kind, index)}</option>) : <option>Kein Gerät gefunden</option>}</select></label>; })}</div>{error && <div className="warning-banner">{error}</div>}<div className="device-modal-actions"><button className="secondary" onClick={() => void refresh()} disabled={switching !== null}><RefreshCw /> Geräte aktualisieren</button><button className="primary compact" onClick={onClose}>Fertig</button></div></section></div>;
}
