import { useEffect, useRef, useState } from "react";
import { createLocalAudioTrack, RemoteAudioTrack, Room, RoomEvent, Track, type LocalAudioTrack, type RemoteParticipant, type RemoteTrackPublication } from "livekit-client";
import { Headphones, Mic } from "lucide-react";
import { roleCanControlProgram } from "./BroadcastCoordination";

const TALKBACK_TOPIC = "gemeinde-stream.talkback.v1";
const TALKBACK_TRACK_NAME = "gemeinde-stream-talkback";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface TalkbackMessage { active: boolean; }
export function parseTalkbackMessage(payload: Uint8Array): TalkbackMessage | null {
  try {
    const value = JSON.parse(decoder.decode(payload)) as Partial<TalkbackMessage>;
    return typeof value.active === "boolean" ? { active: value.active } : null;
  } catch { return null; }
}

export function canSendTalkback(participant?: { metadata?: string }): boolean {
  return roleCanControlProgram(participant?.metadata);
}

export function BroadcastTalkback({ room, connected, enabled, targets }: { room: Room; connected: boolean; enabled: boolean; targets: Array<{ identity: string; name: string }> }) {
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [receivingFrom, setReceivingFrom] = useState<string | null>(null);
  const [error, setError] = useState("");
  const localTrack = useRef<LocalAudioTrack | null>(null);
  const activeSenders = useRef(new Set<string>());
  const audioElements = useRef(new Map<string, HTMLAudioElement>());

  useEffect(() => {
    if (!connected) return;
    const detachSender = (identity: string) => {
      for (const [key, element] of audioElements.current) {
        if (!key.startsWith(`${identity}:`)) continue;
        element.remove(); audioElements.current.delete(key);
      }
    };
    const attach = (track: unknown, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (!(track instanceof RemoteAudioTrack) || publication.trackName !== TALKBACK_TRACK_NAME || !canSendTalkback(participant) || !activeSenders.current.has(participant.identity)) return;
      const key = `${participant.identity}:${track.sid}`;
      if (audioElements.current.has(key)) return;
      const element = document.createElement("audio"); element.autoplay = true; element.dataset.talkback = participant.identity;
      track.attach(element); document.body.appendChild(element); audioElements.current.set(key, element);
      setReceivingFrom(participant.name || participant.identity);
    };
    const receive = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (topic !== TALKBACK_TOPIC || !participant || !canSendTalkback(participant)) return;
      const message = parseTalkbackMessage(payload); if (!message) return;
      if (message.active) activeSenders.current.add(participant.identity);
      else { activeSenders.current.delete(participant.identity); detachSender(participant.identity); setReceivingFrom(null); }
      for (const publication of participant.audioTrackPublications.values()) {
        if (publication.audioTrack instanceof RemoteAudioTrack) attach(publication.audioTrack, publication, participant);
      }
    };
    const unsubscribed = (track: unknown, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (publication.trackName !== TALKBACK_TRACK_NAME) return;
      detachSender(participant.identity); setReceivingFrom(null);
    };
    room.on(RoomEvent.DataReceived, receive);
    room.on(RoomEvent.TrackSubscribed, attach);
    room.on(RoomEvent.TrackUnsubscribed, unsubscribed);
    return () => {
      room.off(RoomEvent.DataReceived, receive); room.off(RoomEvent.TrackSubscribed, attach); room.off(RoomEvent.TrackUnsubscribed, unsubscribed);
      audioElements.current.forEach((element) => element.remove()); audioElements.current.clear(); activeSenders.current.clear();
    };
  }, [connected, room]);

  async function start(identity: string) {
    if (!connected || !enabled || localTrack.current) return;
    try {
      const track = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      await room.localParticipant.publishTrack(track, { name: TALKBACK_TRACK_NAME, source: Track.Source.Unknown });
      localTrack.current = track; setActiveTarget(identity); setError("");
      await room.localParticipant.publishData(encoder.encode(JSON.stringify({ active: true })), { reliable: true, topic: TALKBACK_TOPIC, destinationIdentities: [identity] });
    } catch (cause) {
      localTrack.current?.stop(); localTrack.current = null; setActiveTarget(null);
      setError(cause instanceof Error ? cause.message : "Talkback konnte nicht gestartet werden.");
    }
  }

  async function stop() {
    const identity = activeTarget; const track = localTrack.current;
    if (!identity || !track) return;
    localTrack.current = null; setActiveTarget(null);
    await room.localParticipant.publishData(encoder.encode(JSON.stringify({ active: false })), { reliable: true, topic: TALKBACK_TOPIC, destinationIdentities: [identity] }).catch(() => undefined);
    await room.localParticipant.unpublishTrack(track, true).catch(() => undefined); track.stop();
  }

  useEffect(() => () => { const track = localTrack.current; if (track) { void room.localParticipant.unpublishTrack(track, true); track.stop(); } }, [room]);

  return <section className="talkback-panel"><div><span><Headphones /><b>Talkback</b></span>{receivingFrom && <small>Regie spricht: {receivingFrom}</small>}</div>{targets.length > 0 ? targets.map((target) => <button key={target.identity} className={activeTarget === target.identity ? "active" : ""} disabled={!connected || !enabled || Boolean(activeTarget && activeTarget !== target.identity)} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); void start(target.identity); }} onPointerUp={() => void stop()} onPointerCancel={() => void stop()}><Mic /><span><b>{target.name}</b><small>{activeTarget === target.identity ? "SPRECHEN …" : "Gedrückt halten"}</small></span></button>) : <p>Keine entfernte Quelle verbunden.</p>}{error && <div className="inline-error">{error}</div>}</section>;
}
