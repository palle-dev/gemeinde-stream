import { useEffect, useRef, useState } from "react";
import { createLocalAudioTrack, RemoteAudioTrack, Room, RoomEvent, Track, type LocalAudioTrack, type ParticipantTrackPermission, type RemoteParticipant, type RemoteTrackPublication } from "livekit-client";
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

export function talkbackSubscriptionPermissions(
  targetIdentity: string,
  participantIdentities: string[],
  normalTrackSids: string[],
): ParticipantTrackPermission[] {
  return [...new Set(participantIdentities)].map((participantIdentity) =>
    participantIdentity === targetIdentity
      ? { participantIdentity, allowAll: true }
      : { participantIdentity, allowedTrackSids: normalTrackSids },
  );
}

export function BroadcastTalkback({ room, connected, enabled, targets }: { room: Room; connected: boolean; enabled: boolean; targets: Array<{ identity: string; name: string }> }) {
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [receivingFrom, setReceivingFrom] = useState<string | null>(null);
  const [error, setError] = useState("");
  const localTrack = useRef<LocalAudioTrack | null>(null);
  const activeTargetRef = useRef<string | null>(null);
  const activeSenders = useRef(new Set<string>());
  const audioElements = useRef(new Map<string, HTMLAudioElement>());

  const applyTalkbackPermissions = (targetIdentity: string) => {
    const normalTrackSids = [...room.localParticipant.trackPublications.values()]
      .filter((publication) => publication.trackName !== TALKBACK_TRACK_NAME)
      .map((publication) => publication.trackSid)
      .filter((trackSid): trackSid is string => Boolean(trackSid));
    room.localParticipant.setTrackSubscriptionPermissions(
      false,
      talkbackSubscriptionPermissions(
        targetIdentity,
        [...room.remoteParticipants.keys()],
        normalTrackSids,
      ),
    );
  };

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

  useEffect(() => {
    if (!connected) return;
    const refreshPermissions = () => {
      if (activeTargetRef.current)
        applyTalkbackPermissions(activeTargetRef.current);
    };
    room.on(RoomEvent.ParticipantConnected, refreshPermissions);
    room.on(RoomEvent.ParticipantDisconnected, refreshPermissions);
    room.on(RoomEvent.LocalTrackPublished, refreshPermissions);
    room.on(RoomEvent.LocalTrackUnpublished, refreshPermissions);
    return () => {
      room.off(RoomEvent.ParticipantConnected, refreshPermissions);
      room.off(RoomEvent.ParticipantDisconnected, refreshPermissions);
      room.off(RoomEvent.LocalTrackPublished, refreshPermissions);
      room.off(RoomEvent.LocalTrackUnpublished, refreshPermissions);
    };
  }, [connected, room]);

  async function start(identity: string) {
    if (!connected || !enabled || localTrack.current || activeTargetRef.current) return;
    activeTargetRef.current = identity;
    let track: LocalAudioTrack | null = null;
    try {
      track = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      if (activeTargetRef.current !== identity) {
        track.stop();
        return;
      }
      localTrack.current = track;
      applyTalkbackPermissions(identity);
      await room.localParticipant.publishTrack(track, { name: TALKBACK_TRACK_NAME, source: Track.Source.Unknown });
      if (activeTargetRef.current !== identity) {
        await room.localParticipant.unpublishTrack(track, true).catch(() => undefined);
        track.stop();
        if (localTrack.current === track) localTrack.current = null;
        room.localParticipant.setTrackSubscriptionPermissions(true);
        return;
      }
      setActiveTarget(identity); setError("");
      await room.localParticipant.publishData(encoder.encode(JSON.stringify({ active: true })), { reliable: true, topic: TALKBACK_TOPIC, destinationIdentities: [identity] });
    } catch (cause) {
      if (activeTargetRef.current === identity) activeTargetRef.current = null;
      if (track) {
        await room.localParticipant.unpublishTrack(track, true).catch(() => undefined);
        track.stop();
      }
      if (localTrack.current === track) localTrack.current = null;
      room.localParticipant.setTrackSubscriptionPermissions(true);
      setActiveTarget(null);
      setError(cause instanceof Error ? cause.message : "Talkback konnte nicht gestartet werden.");
    }
  }

  async function stop() {
    const identity = activeTargetRef.current; const track = localTrack.current;
    activeTargetRef.current = null; localTrack.current = null; setActiveTarget(null);
    if (identity)
      await room.localParticipant.publishData(encoder.encode(JSON.stringify({ active: false })), { reliable: true, topic: TALKBACK_TOPIC, destinationIdentities: [identity] }).catch(() => undefined);
    if (track) {
      await room.localParticipant.unpublishTrack(track, true).catch(() => undefined);
      track.stop();
    }
    room.localParticipant.setTrackSubscriptionPermissions(true);
  }

  useEffect(() => () => { const track = localTrack.current; activeTargetRef.current = null; room.localParticipant.setTrackSubscriptionPermissions(true); if (track) { void room.localParticipant.unpublishTrack(track, true); track.stop(); } }, [room]);

  return <section className="talkback-panel"><div><span><Headphones /><b>Talkback</b></span>{receivingFrom && <small>Regie spricht: {receivingFrom}</small>}</div>{targets.length > 0 ? targets.map((target) => <button key={target.identity} className={activeTarget === target.identity ? "active" : ""} disabled={!connected || !enabled || Boolean(activeTarget && activeTarget !== target.identity)} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); void start(target.identity); }} onPointerUp={() => void stop()} onPointerCancel={() => void stop()}><Mic /><span><b>{target.name}</b><small>{activeTarget === target.identity ? "SPRECHEN …" : "Gedrückt halten"}</small></span></button>) : <p>Keine entfernte Quelle verbunden.</p>}{error && <div className="inline-error">{error}</div>}</section>;
}
