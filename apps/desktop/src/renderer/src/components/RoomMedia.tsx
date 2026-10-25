import { useEffect, useMemo, useRef, useState } from "react";
import {
  Participant,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
  type LocalVideoTrack,
  type RemoteVideoTrack,
} from "livekit-client";
import { participantRole, type ParticipantRole } from "./MeetingModeration";

export type VideoMediaTrack = LocalVideoTrack | RemoteVideoTrack;

export interface ParticipantMedia {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  cameraTrack?: VideoMediaTrack;
  screenTrack?: VideoMediaTrack;
  microphoneMuted: boolean;
  microphoneTrackSid?: string;
  handRaised: boolean;
  role: ParticipantRole;
}

function toParticipantMedia(participant: Participant, isLocal: boolean): ParticipantMedia {
  const camera = participant.getTrackPublication(Track.Source.Camera);
  const screen = participant.getTrackPublication(Track.Source.ScreenShare);
  const microphone = participant.getTrackPublication(Track.Source.Microphone);

  return {
    identity: participant.identity,
    name: participant.name || participant.identity,
    isLocal,
    isSpeaking: participant.isSpeaking,
    cameraTrack: camera?.videoTrack,
    screenTrack: screen?.videoTrack,
    microphoneMuted: !microphone || microphone.isMuted,
    microphoneTrackSid: microphone?.trackSid,
    handRaised: participant.attributes.handRaised === "true",
    role: participantRole(participant.metadata),
  };
}

export function useRoomMedia(room: Room, connected: boolean): ParticipantMedia[] {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!connected) return;
    const refresh = () => setRevision((revision) => revision + 1);
    const events = [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ActiveSpeakersChanged,
      RoomEvent.ParticipantMetadataChanged,
      RoomEvent.ParticipantAttributesChanged,
    ] as const;

    events.forEach((event) => room.on(event, refresh));
    refresh();
    return () => events.forEach((event) => room.off(event, refresh));
  }, [connected, room]);

  return useMemo(() => {
    if (!connected) return [];
    return [
      toParticipantMedia(room.localParticipant, true),
      ...Array.from(room.remoteParticipants.values()).map((participant) => toParticipantMedia(participant, false)),
    ];
  }, [connected, revision, room]);
}

export function VideoTrackElement({ track, muted = false }: { track: VideoMediaTrack; muted?: boolean }) {
  const elementRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    track.attach(element);
    return () => { track.detach(element); };
  }, [track]);

  return <video ref={elementRef} autoPlay playsInline muted={muted} />;
}

function AudioTrackElement({ track }: { track: RemoteAudioTrack }) {
  const elementRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    track.attach(element);
    return () => { track.detach(element); };
  }, [track]);

  return <audio ref={elementRef} autoPlay />;
}

export function RoomAudio({ room, connected }: { room: Room; connected: boolean }) {
  const participants = useRoomMedia(room, connected);
  const tracks = participants.flatMap((participant) => {
    if (participant.isLocal) return [];
    const remote = room.remoteParticipants.get(participant.identity);
    const track = remote?.getTrackPublication(Track.Source.Microphone)?.audioTrack;
    return track instanceof RemoteAudioTrack ? [track] : [];
  });

  return <div className="audio-renderers" aria-hidden="true">{tracks.map((track) => <AudioTrackElement key={track.sid} track={track} />)}</div>;
}
