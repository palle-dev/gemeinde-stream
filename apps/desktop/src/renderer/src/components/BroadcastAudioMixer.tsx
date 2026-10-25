import { useEffect, useRef, useState } from "react";
import { MicOff, Volume2, VolumeX } from "lucide-react";
import { Room, Track } from "livekit-client";
import type { ParticipantMedia } from "./RoomMedia";

export function normalizedVolume(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function audioMeterPercent(level: number): number {
  return Math.round(Math.sqrt(normalizedVolume(level)) * 100);
}

export function BroadcastAudioMixer({ room, participants, enabled, onMixChanged }: { room: Room; participants: ParticipantMedia[]; enabled: boolean; onMixChanged?: (volumes: Record<string, number>) => void }) {
  const remoteParticipants = participants.filter((participant) => !participant.isLocal);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const previousVolumes = useRef<Record<string, number>>({});

  useEffect(() => {
    for (const participant of remoteParticipants) {
      const volume = volumes[participant.identity] ?? 1;
      room.remoteParticipants.get(participant.identity)?.setVolume(volume, Track.Source.Microphone);
    }
  }, [remoteParticipants, room, volumes]);

  useEffect(() => { onMixChanged?.(volumes); }, [onMixChanged, volumes]);

  function setVolume(identity: string, volume: number) {
    const next = normalizedVolume(volume);
    if (next > 0) previousVolumes.current[identity] = next;
    setVolumes((current) => ({ ...current, [identity]: next }));
  }

  function toggleMute(identity: string) {
    const current = volumes[identity] ?? 1;
    setVolume(identity, current > 0 ? 0 : previousVolumes.current[identity] ?? 1);
  }

  return <div className="audio-mixer"><div className="audio-mixer-heading"><b>Audiomixer</b><span>{remoteParticipants.length} Kanäle</span></div>{remoteParticipants.length > 0 ? remoteParticipants.map((participant) => {
    const volume = volumes[participant.identity] ?? 1;
    const disabled = !enabled || participant.microphoneMuted;
    return <div className={`audio-mixer-channel ${volume === 0 || participant.microphoneMuted ? "muted" : ""}`} key={participant.identity}><div className="audio-channel-title"><b>{participant.name}</b><span>{participant.microphoneMuted ? "Quelle stumm" : `${Math.round(volume * 100)} %`}</span></div><div className="audio-level" aria-label={`Pegel ${participant.name}`}><i style={{ width: `${participant.microphoneMuted ? 0 : audioMeterPercent(participant.audioLevel)}%` }} /></div><div className="audio-channel-controls"><button title={volume === 0 ? "Kanal einschalten" : "Kanal lokal stummschalten"} disabled={!enabled || participant.microphoneMuted} onClick={() => toggleMute(participant.identity)}>{participant.microphoneMuted ? <MicOff /> : volume === 0 ? <VolumeX /> : <Volume2 />}</button><input aria-label={`Lautstärke ${participant.name}`} type="range" min="0" max="100" value={Math.round(volume * 100)} disabled={disabled} onChange={(event) => setVolume(participant.identity, Number(event.target.value) / 100)} /></div></div>;
  }) : <div className="audio-mixer-empty">Noch keine Remote-Audioquellen</div>}</div>;
}
