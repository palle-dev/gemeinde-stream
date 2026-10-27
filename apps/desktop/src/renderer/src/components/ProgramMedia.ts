import { Room, Track } from "livekit-client";
import {
  currentProductionProfile,
  type ProductionProfile,
} from "../lib/productionProfile";
import type { BroadcastProgramState } from "./BroadcastCoordination";
import type { VideoMediaTrack } from "./RoomMedia";
import type { LocalMediaAsset } from "./MediaLibrary";

export interface ProgramMediaSource {
  id: string;
  name: string;
  track?: VideoMediaTrack;
  media?: LocalMediaAsset;
}
export interface ProgramMediaSnapshot {
  programState: BroadcastProgramState | null;
  sources: ProgramMediaSource[];
  audioMix: Record<string, number>;
}
export interface ProgramMediaSession {
  stream: MediaStream;
  cleanup(): void;
}
export interface CoverCrop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export function coverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): CoverCrop {
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    targetWidth <= 0 ||
    targetHeight <= 0
  )
    return { sx: 0, sy: 0, sw: 0, sh: 0 };
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
  return [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ].find((type) => MediaRecorder.isTypeSupported(type));
}

export async function createProgramMediaSession(
  room: Room,
  snapshot: () => ProgramMediaSnapshot,
  profile: ProductionProfile = currentProductionProfile(),
): Promise<ProgramMediaSession> {
  const canvas = document.createElement("canvas");
  canvas.width = profile.width;
  canvas.height = profile.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context)
    throw new Error("Die 1080p-Zeichenfläche konnte nicht erstellt werden.");
  const attachedVideos = new Map<
    string,
    { track: VideoMediaTrack; element: HTMLVideoElement }
  >();
  const localMedia = new Map<
    string,
    HTMLImageElement | HTMLVideoElement | HTMLAudioElement
  >();
  const ensureVideo = (source: ProgramMediaSource) => {
    if (!source.track) return undefined;
    const existing = attachedVideos.get(source.id);
    if (existing?.track === source.track) return existing.element;
    if (existing) existing.track.detach(existing.element);
    const element = document.createElement("video");
    element.muted = true;
    element.autoplay = true;
    element.playsInline = true;
    source.track.attach(element);
    attachedVideos.set(source.id, { track: source.track, element });
    return element;
  };
  const ensureLocalMedia = (source: ProgramMediaSource) => {
    if (!source.media) return undefined;
    const existing = localMedia.get(source.id);
    if (existing) return existing;
    if (source.media.type === "image") {
      const element = new Image();
      element.src = source.media.url;
      localMedia.set(source.id, element);
      return element;
    }
    const element = document.createElement(
      source.media.type === "video" ? "video" : "audio",
    );
    element.src = source.media.url;
    element.loop = true;
    element.autoplay = true;
    element.preload = "auto";
    if (element instanceof HTMLVideoElement) element.playsInline = true;
    void element.play().catch(() => undefined);
    localMedia.set(source.id, element);
    return element;
  };
  const drawSlot = (
    source: ProgramMediaSource | undefined,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    context.fillStyle = "#080b10";
    context.fillRect(x, y, width, height);
    if (!source) return;
    const local = ensureLocalMedia(source);
    if (
      local instanceof HTMLImageElement &&
      local.complete &&
      local.naturalWidth > 0
    ) {
      const crop = coverCrop(
        local.naturalWidth,
        local.naturalHeight,
        width,
        height,
      );
      context.drawImage(
        local,
        crop.sx,
        crop.sy,
        crop.sw,
        crop.sh,
        x,
        y,
        width,
        height,
      );
      return;
    }
    if (
      local instanceof HTMLVideoElement &&
      local.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      local.videoWidth > 0
    ) {
      const crop = coverCrop(
        local.videoWidth,
        local.videoHeight,
        width,
        height,
      );
      context.drawImage(
        local,
        crop.sx,
        crop.sy,
        crop.sw,
        crop.sh,
        x,
        y,
        width,
        height,
      );
      return;
    }
    const video = ensureVideo(source);
    if (
      video &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0
    ) {
      const crop = coverCrop(
        video.videoWidth,
        video.videoHeight,
        width,
        height,
      );
      context.drawImage(
        video,
        crop.sx,
        crop.sy,
        crop.sw,
        crop.sh,
        x,
        y,
        width,
        height,
      );
      return;
    }
    context.fillStyle = "#d9fffb";
    context.font = "600 44px Segoe UI";
    context.textAlign = "center";
    context.fillText(source.name, x + width / 2, y + height / 2);
  };
  const drawOverlay = (overlay: BroadcastProgramState["overlay"]) => {
    if (!overlay?.title) return;
    const x = 72;
    const bottom = 74;
    const paddingX = 34;
    const titleSize = 48;
    const subtitleSize = 27;
    context.save();
    context.font = `700 ${titleSize}px Segoe UI`;
    const titleWidth = context.measureText(overlay.title).width;
    context.font = `500 ${subtitleSize}px Segoe UI`;
    const subtitleWidth = overlay.subtitle
      ? context.measureText(overlay.subtitle).width
      : 0;
    const boxWidth = Math.min(
      1500,
      Math.max(430, Math.max(titleWidth, subtitleWidth) + paddingX * 2),
    );
    const boxHeight = overlay.subtitle ? 142 : 100;
    const y = 1080 - bottom - boxHeight;
    context.fillStyle = "rgba(8, 13, 18, .92)";
    context.fillRect(x, y, boxWidth, boxHeight);
    context.fillStyle = "#b8ff3d";
    context.fillRect(x, y, 10, boxHeight);
    context.fillStyle = "#ffffff";
    context.font = `700 ${titleSize}px Segoe UI`;
    context.textAlign = "left";
    context.fillText(
      overlay.title,
      x + paddingX,
      y + 60,
      boxWidth - paddingX * 2,
    );
    if (overlay.subtitle) {
      context.fillStyle = "#b8c4cf";
      context.font = `500 ${subtitleSize}px Segoe UI`;
      context.fillText(
        overlay.subtitle,
        x + paddingX,
        y + 105,
        boxWidth - paddingX * 2,
      );
    }
    context.restore();
  };
  let frame = 0;
  const draw = () => {
    const current = snapshot();
    const state = current.programState;
    const active = (state?.sourceIds ?? []).map((id) =>
      current.sources.find((source) => source.id === id),
    );
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.scale(profile.width / 1920, profile.height / 1080);
    if (state?.layout === "side_by_side") {
      drawSlot(active[0], 0, 0, 960, 1080);
      drawSlot(active[1], 960, 0, 960, 1080);
    } else if (state?.layout === "picture_in_picture") {
      drawSlot(active[0], 0, 0, 1920, 1080);
      drawSlot(active[1], 1286, 713, 576, 324);
      context.strokeStyle = "#fff";
      context.lineWidth = 3;
      context.strokeRect(1286, 713, 576, 324);
    } else drawSlot(active[0], 0, 0, 1920, 1080);
    drawOverlay(state?.overlay);
    context.restore();
    frame = window.requestAnimationFrame(draw);
  };
  draw();

  const canvasStream = canvas.captureStream(profile.frameRate);
  const audioContext = new AudioContext();
  await audioContext.resume();
  const audioDestination = audioContext.createMediaStreamDestination();
  const audioNodes = new Map<
    string,
    {
      track: MediaStreamTrack;
      source: MediaStreamAudioSourceNode;
      gain: GainNode;
    }
  >();
  const mediaAudioNodes = new Map<
    string,
    {
      element: HTMLMediaElement;
      source: MediaElementAudioSourceNode;
      gain: GainNode;
    }
  >();
  const syncAudioTracks = () => {
    const current = snapshot();
    const activeIdentities = new Set<string>();
    for (const participant of [
      room.localParticipant,
      ...room.remoteParticipants.values(),
    ]) {
      const mediaTrack = participant.getTrackPublication(
        Track.Source.Microphone,
      )?.audioTrack?.mediaStreamTrack;
      if (!mediaTrack || mediaTrack.readyState !== "live") continue;
      activeIdentities.add(participant.identity);
      const existing = audioNodes.get(participant.identity);
      if (existing?.track === mediaTrack) {
        existing.gain.gain.value = current.audioMix[participant.identity] ?? 1;
        continue;
      }
      existing?.source.disconnect();
      existing?.gain.disconnect();
      const source = audioContext.createMediaStreamSource(
        new MediaStream([mediaTrack]),
      );
      const gain = audioContext.createGain();
      gain.gain.value = current.audioMix[participant.identity] ?? 1;
      source.connect(gain).connect(audioDestination);
      audioNodes.set(participant.identity, { track: mediaTrack, source, gain });
    }
    for (const [identity, node] of audioNodes) {
      if (activeIdentities.has(identity)) continue;
      node.source.disconnect();
      node.gain.disconnect();
      audioNodes.delete(identity);
    }
    const activeMediaIds = new Set(current.programState?.sourceIds ?? []);
    for (const source of current.sources) {
      if (!source.media || source.media.type === "image") continue;
      const element = ensureLocalMedia(source);
      if (!(element instanceof HTMLMediaElement)) continue;
      let node = mediaAudioNodes.get(source.id);
      if (!node) {
        const mediaSource = audioContext.createMediaElementSource(element);
        const gain = audioContext.createGain();
        mediaSource.connect(gain).connect(audioDestination);
        node = { element, source: mediaSource, gain };
        mediaAudioNodes.set(source.id, node);
      }
      node.gain.gain.value = activeMediaIds.has(source.id) ? 1 : 0;
      if (activeMediaIds.has(source.id))
        void element.play().catch(() => undefined);
      else element.pause();
    }
  };
  syncAudioTracks();
  const syncInterval = window.setInterval(syncAudioTracks, 250);
  const stream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDestination.stream.getAudioTracks(),
  ]);
  let cleaned = false;
  return {
    stream,
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      window.cancelAnimationFrame(frame);
      window.clearInterval(syncInterval);
      for (const attached of attachedVideos.values())
        attached.track.detach(attached.element);
      audioNodes.forEach((node) => {
        node.source.disconnect();
        node.gain.disconnect();
      });
      mediaAudioNodes.forEach((node) => {
        node.element.pause();
        node.source.disconnect();
        node.gain.disconnect();
      });
      stream.getTracks().forEach((track) => track.stop());
      void audioContext.close();
    },
  };
}
