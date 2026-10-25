import { useEffect, useRef, useState } from "react";
import { CircleStop, Disc3 } from "lucide-react";
import type { Room } from "livekit-client";
import type { BroadcastProgramState } from "./BroadcastCoordination";
import { createProgramMediaSession, preferredProgramMimeType, type ProgramMediaSession, type ProgramMediaSource } from "./ProgramMedia";

export { coverCrop } from "./ProgramMedia";
export type ProgramRecordingSource = ProgramMediaSource;

export function recordingFileName(title: string, now = new Date()): string {
  const safeTitle = title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, " ").slice(0, 80) || "Gemeinde-Stream";
  return `${safeTitle}-${now.toISOString().replace(/[:.]/g, "-")}.webm`;
}

function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const remaining = (seconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${remaining}`;
}

export function ProgramRecorder({ room, title, programState, sources, audioMix, enabled }: { room: Room; title: string; programState: BroadcastProgramState | null; sources: ProgramMediaSource[]; audioMix: Record<string, number>; enabled: boolean }) {
  const [status, setStatus] = useState<"idle" | "recording" | "saving" | "error">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sessionRef = useRef<ProgramMediaSession | null>(null);
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
      recorder.addEventListener("stop", () => void writeQueueRef.current.then(() => window.desktop.finishRecording()).finally(() => sessionRef.current?.cleanup()), { once: true });
      recorder.stop();
    } else sessionRef.current?.cleanup();
  }, []);

  async function start() {
    if (!programState || (status !== "idle" && status !== "error")) return;
    setError("");
    const selected = await window.desktop.beginRecording(recordingFileName(title));
    if (!selected) return;
    try {
      const session = await createProgramMediaSession(room, () => programRef.current);
      sessionRef.current = session;
      const mimeType = preferredProgramMimeType();
      const recorder = new MediaRecorder(session.stream, mimeType ? { mimeType, videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 192_000 } : undefined);
      recorderRef.current = recorder;
      writeQueueRef.current = Promise.resolve();
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size === 0) return;
        writeQueueRef.current = writeQueueRef.current.then(async () => window.desktop.appendRecording(await event.data.arrayBuffer()));
      });
      recorder.addEventListener("error", () => {
        setError("Die Programmaufzeichnung wurde unerwartet beendet."); setStatus("error");
        void window.desktop.cancelRecording().finally(() => session.cleanup());
      });
      recorder.start(1000); setElapsed(0); setStatus("recording");
    } catch (cause) {
      sessionRef.current?.cleanup(); await window.desktop.cancelRecording();
      setError(cause instanceof Error ? cause.message : "Aufzeichnung konnte nicht gestartet werden."); setStatus("error");
    }
  }

  async function stop() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    setStatus("saving");
    try {
      await new Promise<void>((resolve) => { recorder.addEventListener("stop", () => resolve(), { once: true }); recorder.stop(); });
      await writeQueueRef.current; await window.desktop.finishRecording(); sessionRef.current?.cleanup();
      recorderRef.current = null; sessionRef.current = null; setStatus("idle");
    } catch (cause) {
      sessionRef.current?.cleanup(); await window.desktop.cancelRecording();
      setError(cause instanceof Error ? cause.message : "Aufzeichnung konnte nicht gespeichert werden."); setStatus("error");
    }
  }

  const recording = status === "recording";
  return <div className="program-recorder"><button className={recording ? "recording" : ""} disabled={!enabled || !programState || status === "saving"} onClick={() => recording ? void stop() : void start()}>{recording ? <CircleStop /> : <Disc3 />}<span><b>{recording ? "Aufnahme stoppen" : status === "saving" ? "Wird gespeichert …" : "Programm aufnehmen"}</b><small>{recording ? formatElapsed(elapsed) : "1080p60 · Video und Audio"}</small></span></button>{error && <small className="recorder-error">{error}</small>}</div>;
}
