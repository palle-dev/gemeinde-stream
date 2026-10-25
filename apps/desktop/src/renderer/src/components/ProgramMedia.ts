import { Room, Track } from "livekit-client";
import { PROGRAM_FRAME_RATE, PROGRAM_HEIGHT, PROGRAM_WIDTH } from "../lib/room";
import type { BroadcastProgramState } from "./BroadcastCoordination";
import type { VideoMediaTrack } from "./RoomMedia";

export interface ProgramMediaSource { id: string; name: string; track?: VideoMediaTrack; }
export interface ProgramMediaSnapshot { programState: BroadcastProgramState | null; sources: ProgramMediaSource[]; audioMix: Record<string, number>; }
export interface ProgramMediaSession { stream: MediaStream; cleanup(): void; }
export interface CoverCrop { sx: number; sy: number; sw: number; sh: number; }

export function coverCrop(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): CoverCrop {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  if (sourceRatio > targetRatio) {
    const sw = sourceHeight * targetRatio;
    return { sx: (sourceWidth - sw) / 2, sy: 0, sw, sh: sourceHeight };
  }
  const sh = sourceWidth / targetRatio;
  return { sx: 0, sy: (sourceHeight - sh) / 2, sw: sourceWidth, sh };
}

export function preferredProgramMimeType(): string | undefined {
  return ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
}

export async function createProgramMediaSession(room: Room, snapshot: () => ProgramMediaSnapshot): Promise<ProgramMediaSession> {
  const canvas = document.createElement("canvas");
  canvas.width = PROGRAM_WIDTH;
  canvas.height = PROGRAM_HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Die 1080p-Zeichenfläche konnte nicht erstellt werden.");
  const attachedVideos = new Map<string, { track: VideoMediaTrack; element: HTMLVideoElement }>();
  const ensureVideo = (source: ProgramMediaSource) => {
    if (!source.track) return undefined;
    const existing = attachedVideos.get(source.id);
    if (existing?.track === source.track) return existing.element;
    if (existing) existing.track.detach(existing.element);
    const element = document.createElement("video");
    element.muted = true; element.autoplay = true; element.playsInline = true;
    source.track.attach(element);
    attachedVideos.set(source.id, { track: source.track, element });
    return element;
  };
  const drawSlot = (source: ProgramMediaSource | undefined, x: number, y: number, width: number, height: number) => {
    context.fillStyle = "#080b10"; context.fillRect(x, y, width, height);
    if (!source) return;
    const video = ensureVideo(source);
    if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      const crop = coverCrop(video.videoWidth, video.videoHeight, width, height);
      context.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, x, y, width, height);
      return;
    }
    context.fillStyle = "#d9fffb"; context.font = "600 44px Segoe UI"; context.textAlign = "center";
    context.fillText(source.name, x + width / 2, y + height / 2);
  };
  let frame = 0;
  const draw = () => {
    const current = snapshot();
    const state = current.programState;
    const active = (state?.sourceIds ?? []).map((id) => current.sources.find((source) => source.id === id));
    context.fillStyle = "#000"; context.fillRect(0, 0, canvas.width, canvas.height);
    if (state?.layout === "side_by_side") {
      drawSlot(active[0], 0, 0, 960, 1080); drawSlot(active[1], 960, 0, 960, 1080);
    } else if (state?.layout === "picture_in_picture") {
      drawSlot(active[0], 0, 0, 1920, 1080); drawSlot(active[1], 1286, 713, 576, 324);
      context.strokeStyle = "#fff"; context.lineWidth = 3; context.strokeRect(1286, 713, 576, 324);
    } else drawSlot(active[0], 0, 0, 1920, 1080);
    frame = window.requestAnimationFrame(draw);
  };
  draw();

  const canvasStream = canvas.captureStream(PROGRAM_FRAME_RATE);
  const audioContext = new AudioContext();
  await audioContext.resume();
  const audioDestination = audioContext.createMediaStreamDestination();
  const audioNodes = new Map<string, { track: MediaStreamTrack; source: MediaStreamAudioSourceNode; gain: GainNode }>();
  const syncAudioTracks = () => {
    const current = snapshot();
    const activeIdentities = new Set<string>();
    for (const participant of [room.localParticipant, ...room.remoteParticipants.values()]) {
      const mediaTrack = participant.getTrackPublication(Track.Source.Microphone)?.audioTrack?.mediaStreamTrack;
      if (!mediaTrack || mediaTrack.readyState !== "live") continue;
      activeIdentities.add(participant.identity);
      const existing = audioNodes.get(participant.identity);
      if (existing?.track === mediaTrack) { existing.gain.gain.value = current.audioMix[participant.identity] ?? 1; continue; }
      existing?.source.disconnect(); existing?.gain.disconnect();
      const source = audioContext.createMediaStreamSource(new MediaStream([mediaTrack]));
      const gain = audioContext.createGain(); gain.gain.value = current.audioMix[participant.identity] ?? 1;
      source.connect(gain).connect(audioDestination);
      audioNodes.set(participant.identity, { track: mediaTrack, source, gain });
    }
    for (const [identity, node] of audioNodes) {
      if (activeIdentities.has(identity)) continue;
      node.source.disconnect(); node.gain.disconnect(); audioNodes.delete(identity);
    }
  };
  syncAudioTracks();
  const syncInterval = window.setInterval(syncAudioTracks, 250);
  const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()]);
  let cleaned = false;
  return { stream, cleanup: () => {
    if (cleaned) return; cleaned = true;
    window.cancelAnimationFrame(frame); window.clearInterval(syncInterval);
    for (const attached of attachedVideos.values()) attached.track.detach(attached.element);
    audioNodes.forEach((node) => { node.source.disconnect(); node.gain.disconnect(); });
    stream.getTracks().forEach((track) => track.stop()); void audioContext.close();
  } };
}
