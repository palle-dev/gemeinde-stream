import { useEffect, useRef, useState } from "react";
import { CircleStop, Disc3 } from "lucide-react";
import { Room, Track } from "livekit-client";
import type { VideoMediaTrack } from "./RoomMedia";
import type { BroadcastProgramState } from "./BroadcastCoordination";

export interface ProgramRecordingSource {
  id: string;
  name: string;
  track?: VideoMediaTrack;
}

export interface CoverCrop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

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

export function recordingFileName(title: string, now = new Date()): string {
  const safeTitle = title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, " ").slice(0, 80) || "Gemeinde-Stream";
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return `${safeTitle}-${timestamp}.webm`;
}

function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const remaining = (seconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${remaining}`;
}

export function ProgramRecorder({ room, title, programState, sources, audioMix, enabled }: { room: Room; title: string; programState: BroadcastProgramState | null; sources: ProgramRecordingSource[]; audioMix: Record<string, number>; enabled: boolean }) {
  const [status, setStatus] = useState<"idle" | "recording" | "saving" | "error">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const writeQueueRef = useRef(Promise.resolve());
  const programRef = useRef({ programState, sources, audioMix });

  useEffect(() => { programRef.current = { programState, sources, audioMix }; }, [audioMix, programState, sources]);

  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.addEventListener("stop", () => {
        void writeQueueRef.current.then(() => window.desktop.finishRecording()).finally(() => cleanupRef.current?.());
      }, { once: true });
      recorder.stop();
    } else {
      cleanupRef.current?.();
    }
  }, []);

  async function start() {
    if (!programState || (status !== "idle" && status !== "error")) return;
    setError("");
    const selected = await window.desktop.beginRecording(recordingFileName(title));
    if (!selected) return;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Die 1080p-Zeichenfläche konnte nicht erstellt werden.");

      const attachedVideos = new Map<string, { track: VideoMediaTrack; element: HTMLVideoElement }>();
      let frame = 0;
      const ensureVideo = (source: ProgramRecordingSource) => {
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
      const drawSlot = (source: ProgramRecordingSource | undefined, x: number, y: number, width: number, height: number) => {
        context.fillStyle = "#080b10";
        context.fillRect(x, y, width, height);
        if (!source) return;
        const video = ensureVideo(source);
        if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
          const crop = coverCrop(video.videoWidth, video.videoHeight, width, height);
          context.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, x, y, width, height);
          return;
        }
        context.fillStyle = "#d9fffb";
        context.font = "600 44px Segoe UI";
        context.textAlign = "center";
        context.fillText(source.name, x + width / 2, y + height / 2);
      };
      const draw = () => {
        const current = programRef.current;
        const state = current.programState;
        const active = (state?.sourceIds ?? []).map((id) => current.sources.find((source) => source.id === id));
        context.fillStyle = "#000";
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (state?.layout === "side_by_side") {
          drawSlot(active[0], 0, 0, 960, 1080);
          drawSlot(active[1], 960, 0, 960, 1080);
        } else if (state?.layout === "picture_in_picture") {
          drawSlot(active[0], 0, 0, 1920, 1080);
          drawSlot(active[1], 1286, 713, 576, 324);
          context.strokeStyle = "#fff";
          context.lineWidth = 3;
          context.strokeRect(1286, 713, 576, 324);
        } else {
          drawSlot(active[0], 0, 0, 1920, 1080);
        }
        frame = window.requestAnimationFrame(draw);
      };
      draw();

      const canvasStream = canvas.captureStream(30);
      const audioContext = new AudioContext();
      await audioContext.resume();
      const audioDestination = audioContext.createMediaStreamDestination();
      const audioNodes: MediaStreamAudioSourceNode[] = [];
      const gainNodes = new Map<string, GainNode>();
      const mediaParticipants = [room.localParticipant, ...room.remoteParticipants.values()];
      for (const participant of mediaParticipants) {
        const mediaTrack = participant.getTrackPublication(Track.Source.Microphone)?.audioTrack?.mediaStreamTrack;
        if (!mediaTrack || mediaTrack.readyState !== "live") continue;
        const node = audioContext.createMediaStreamSource(new MediaStream([mediaTrack]));
        const gain = audioContext.createGain();
        gain.gain.value = programRef.current.audioMix[participant.identity] ?? 1;
        node.connect(gain).connect(audioDestination);
        audioNodes.push(node);
        gainNodes.set(participant.identity, gain);
      }
      const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()]);
      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(combined, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 192_000 } : undefined);
      recorderRef.current = recorder;
      writeQueueRef.current = Promise.resolve();
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size === 0) return;
        writeQueueRef.current = writeQueueRef.current.then(async () => {
          await window.desktop.appendRecording(await event.data.arrayBuffer());
        });
      });
      recorder.addEventListener("error", () => {
        setError("Die Programmaufzeichnung wurde unerwartet beendet.");
        setStatus("error");
        void window.desktop.cancelRecording().finally(() => cleanupRef.current?.());
      });
      cleanupRef.current = () => {
        window.cancelAnimationFrame(frame);
        for (const attached of attachedVideos.values()) attached.track.detach(attached.element);
        audioNodes.forEach((node) => node.disconnect());
        gainNodes.forEach((node) => node.disconnect());
        combined.getTracks().forEach((track) => track.stop());
        void audioContext.close();
        recorderRef.current = null;
        cleanupRef.current = null;
      };
      const updateRecordingMix = window.setInterval(() => {
        gainNodes.forEach((gain, identity) => { gain.gain.value = programRef.current.audioMix[identity] ?? 1; });
      }, 100);
      const cleanup = cleanupRef.current;
      cleanupRef.current = () => {
        window.clearInterval(updateRecordingMix);
        cleanup();
      };
      recorder.start(1000);
      setElapsed(0);
      setStatus("recording");
    } catch (cause) {
      cleanupRef.current?.();
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
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
      await writeQueueRef.current;
      await window.desktop.finishRecording();
      cleanupRef.current?.();
      setStatus("idle");
    } catch (cause) {
      cleanupRef.current?.();
      await window.desktop.cancelRecording();
      setError(cause instanceof Error ? cause.message : "Aufzeichnung konnte nicht gespeichert werden.");
      setStatus("error");
    }
  }

  const recording = status === "recording";
  return <div className="program-recorder"><button className={recording ? "recording" : ""} disabled={!enabled || !programState || status === "saving"} onClick={() => recording ? void stop() : void start()}>{recording ? <CircleStop /> : <Disc3 />}<span><b>{recording ? "Aufnahme stoppen" : status === "saving" ? "Wird gespeichert …" : "Programm aufnehmen"}</b><small>{recording ? formatElapsed(elapsed) : "1080p · Video und Audio"}</small></span></button>{error && <small className="recorder-error">{error}</small>}</div>;
}
