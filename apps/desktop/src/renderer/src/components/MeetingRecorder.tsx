import { useEffect, useRef, useState } from "react";
import { CircleStop, Disc3 } from "lucide-react";
import { Room, Track } from "livekit-client";
import { PROGRAM_FRAME_RATE, PROGRAM_HEIGHT, PROGRAM_WIDTH } from "../lib/room";
import { coverCrop, preferredProgramMimeType, type ProgramMediaSession } from "./ProgramMedia";
import { recordingFileName } from "./ProgramRecorder";
import type { VideoMediaTrack } from "./RoomMedia";

export type MeetingRecordingLayout = "gallery" | "speaker";

export interface MeetingRecordingSource {
  id: string;
  identity: string;
  name: string;
  track?: VideoMediaTrack;
  isScreenShare: boolean;
  isSpeaking: boolean;
}

export interface MeetingGridSlot { x: number; y: number; width: number; height: number; }

export function meetingGridSlots(count: number, width = PROGRAM_WIDTH, height = PROGRAM_HEIGHT, gap = 16): MeetingGridSlot[] {
  if (count <= 0) return [];
  const columns = count === 1 ? 1 : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const slotWidth = (width - gap * (columns + 1)) / columns;
  const slotHeight = (height - gap * (rows + 1)) / rows;
  return Array.from({ length: count }, (_, index) => ({
    x: gap + (index % columns) * (slotWidth + gap),
    y: gap + Math.floor(index / columns) * (slotHeight + gap),
    width: slotWidth,
    height: slotHeight,
  }));
}

function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const remaining = (seconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${remaining}`;
}

export async function createMeetingMediaSession(
  room: Room,
  snapshot: () => { layout: MeetingRecordingLayout; sources: MeetingRecordingSource[] },
): Promise<ProgramMediaSession> {
  const canvas = document.createElement("canvas");
  canvas.width = PROGRAM_WIDTH;
  canvas.height = PROGRAM_HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Die 1080p-Zeichenfläche konnte nicht erstellt werden.");

  const videos = new Map<string, { track: VideoMediaTrack; element: HTMLVideoElement }>();
  const ensureVideo = (source: MeetingRecordingSource) => {
    if (!source.track) return undefined;
    const existing = videos.get(source.id);
    if (existing?.track === source.track) return existing.element;
    if (existing) existing.track.detach(existing.element);
    const element = document.createElement("video");
    element.muted = true;
    element.autoplay = true;
    element.playsInline = true;
    source.track.attach(element);
    videos.set(source.id, { track: source.track, element });
    return element;
  };
  const drawSource = (source: MeetingRecordingSource | undefined, slot: MeetingGridSlot) => {
    context.fillStyle = "#101720";
    context.fillRect(slot.x, slot.y, slot.width, slot.height);
    if (!source) return;
    const video = ensureVideo(source);
    if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      const crop = coverCrop(video.videoWidth, video.videoHeight, slot.width, slot.height);
      context.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, slot.x, slot.y, slot.width, slot.height);
    } else {
      context.fillStyle = "#35d5cc";
      context.font = "700 54px Segoe UI";
      context.textAlign = "center";
      context.fillText(source.name.slice(0, 2).toUpperCase(), slot.x + slot.width / 2, slot.y + slot.height / 2 + 18);
    }
    context.fillStyle = "rgba(5, 8, 11, .82)";
    context.fillRect(slot.x + 12, slot.y + slot.height - 52, Math.min(slot.width - 24, 520), 40);
    context.fillStyle = "#fff";
    context.font = "600 22px Segoe UI";
    context.textAlign = "left";
    context.fillText(source.isScreenShare ? `${source.name} · Bildschirm` : source.name, slot.x + 24, slot.y + slot.height - 25, Math.min(slot.width - 48, 480));
  };

  let frame = 0;
  const draw = () => {
    const current = snapshot();
    const sources = current.sources.slice(0, 25);
    context.fillStyle = "#070a0e";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (current.layout === "speaker" && sources.length > 0) {
      const stage = sources.find((source) => source.isScreenShare) || sources.find((source) => source.isSpeaking) || sources[0];
      const others = sources.filter((source) => source.id !== stage.id).slice(0, 6);
      const filmstripHeight = others.length > 0 ? 220 : 0;
      drawSource(stage, { x: 16, y: 16, width: canvas.width - 32, height: canvas.height - 32 - filmstripHeight });
      if (others.length > 0) {
        const itemWidth = (canvas.width - 16 * (others.length + 1)) / others.length;
        others.forEach((source, index) => drawSource(source, {
          x: 16 + index * (itemWidth + 16), y: canvas.height - filmstripHeight,
          width: itemWidth, height: filmstripHeight - 16,
        }));
      }
    } else {
      meetingGridSlots(sources.length).forEach((slot, index) => drawSource(sources[index], slot));
    }
    frame = window.requestAnimationFrame(draw);
  };
  draw();

  const canvasStream = canvas.captureStream(PROGRAM_FRAME_RATE);
  const audioContext = new AudioContext();
  await audioContext.resume();
  const destination = audioContext.createMediaStreamDestination();
  const audioNodes = new Map<string, { track: MediaStreamTrack; source: MediaStreamAudioSourceNode }>();
  const syncAudio = () => {
    const active = new Set<string>();
    for (const participant of [room.localParticipant, ...room.remoteParticipants.values()]) {
      const mediaTrack = participant.getTrackPublication(Track.Source.Microphone)?.audioTrack?.mediaStreamTrack;
      if (!mediaTrack || mediaTrack.readyState !== "live") continue;
      active.add(participant.identity);
      if (audioNodes.get(participant.identity)?.track === mediaTrack) continue;
      audioNodes.get(participant.identity)?.source.disconnect();
      const source = audioContext.createMediaStreamSource(new MediaStream([mediaTrack]));
      source.connect(destination);
      audioNodes.set(participant.identity, { track: mediaTrack, source });
    }
    for (const [identity, node] of audioNodes) {
      if (active.has(identity)) continue;
      node.source.disconnect();
      audioNodes.delete(identity);
    }
  };
  syncAudio();
  const syncInterval = window.setInterval(syncAudio, 250);
  const stream = new MediaStream([...canvasStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
  let cleaned = false;
  return { stream, cleanup: () => {
    if (cleaned) return;
    cleaned = true;
    window.cancelAnimationFrame(frame);
    window.clearInterval(syncInterval);
    videos.forEach(({ track, element }) => track.detach(element));
    audioNodes.forEach(({ source }) => source.disconnect());
    stream.getTracks().forEach((track) => track.stop());
    void audioContext.close();
  } };
}

export function MeetingRecorder({ room, title, layout, sources, enabled }: {
  room: Room;
  title: string;
  layout: MeetingRecordingLayout;
  sources: MeetingRecordingSource[];
  enabled: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "recording" | "saving" | "error">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sessionRef = useRef<ProgramMediaSession | null>(null);
  const writesRef = useRef(Promise.resolve());
  const snapshotRef = useRef({ layout, sources });
  useEffect(() => { snapshotRef.current = { layout, sources }; }, [layout, sources]);
  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [status]);
  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.addEventListener("stop", () => void writesRef.current.then(() => window.desktop.finishRecording()).finally(() => sessionRef.current?.cleanup()), { once: true });
      recorder.stop();
    } else sessionRef.current?.cleanup();
  }, []);

  async function start() {
    if (!enabled || sources.length === 0 || (status !== "idle" && status !== "error")) return;
    setError("");
    const selected = await window.desktop.beginRecording(recordingFileName(`${title}-Meeting`));
    if (!selected) return;
    try {
      const session = await createMeetingMediaSession(room, () => snapshotRef.current);
      sessionRef.current = session;
      const mimeType = preferredProgramMimeType();
      const recorder = new MediaRecorder(session.stream, mimeType ? { mimeType, videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 192_000 } : undefined);
      recorderRef.current = recorder;
      writesRef.current = Promise.resolve();
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size === 0) return;
        writesRef.current = writesRef.current.then(async () => window.desktop.appendRecording(await event.data.arrayBuffer()));
      });
      recorder.addEventListener("error", () => {
        setError("Die Meeting-Aufzeichnung wurde unerwartet beendet.");
        setStatus("error");
        void window.desktop.cancelRecording().finally(() => session.cleanup());
      });
      recorder.start(1000);
      setElapsed(0);
      setStatus("recording");
    } catch (cause) {
      sessionRef.current?.cleanup();
      await window.desktop.cancelRecording();
      setError(cause instanceof Error ? cause.message : "Aufzeichnung konnte nicht gestartet werden.");
      setStatus("error");
    }
  }

  async function stop() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    setStatus("saving");
    try {
      await new Promise<void>((resolve) => { recorder.addEventListener("stop", () => resolve(), { once: true }); recorder.stop(); });
      await writesRef.current;
      await window.desktop.finishRecording();
      sessionRef.current?.cleanup();
      recorderRef.current = null;
      sessionRef.current = null;
      setStatus("idle");
    } catch (cause) {
      sessionRef.current?.cleanup();
      await window.desktop.cancelRecording();
      setError(cause instanceof Error ? cause.message : "Aufzeichnung konnte nicht gespeichert werden.");
      setStatus("error");
    }
  }

  const recording = status === "recording";
  return <div className="meeting-recorder"><button className={recording ? "recording" : ""} disabled={!enabled || sources.length === 0 || status === "saving"} onClick={() => recording ? void stop() : void start()}>{recording ? <CircleStop /> : <Disc3 />}<span><b>{recording ? "Aufnahme stoppen" : status === "saving" ? "Wird gespeichert …" : "Meeting aufnehmen"}</b><small>{recording ? formatElapsed(elapsed) : `1080p60 · ${layout === "gallery" ? "Galerie" : "Sprecher"} · Video und Audio`}</small></span></button>{error && <small className="recorder-error">{error}</small>}</div>;
}
