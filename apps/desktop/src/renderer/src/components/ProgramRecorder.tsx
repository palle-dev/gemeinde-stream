import { useEffect, useRef, useState } from "react";
import { CircleStop, Disc3 } from "lucide-react";
import { ConnectionState, type Room } from "livekit-client";
import type { BroadcastProgramState } from "./BroadcastCoordination";
import {
  createProgramMediaSession,
  preferredProgramMimeType,
  type ProgramMediaSession,
  type ProgramMediaSource,
} from "./ProgramMedia";
import { useProductionPreflight } from "./ProductionPreflight";
import { useProductionProfile } from "../lib/productionProfile";

export { coverCrop } from "./ProgramMedia";
export type ProgramRecordingSource = ProgramMediaSource;

export function recordingFileName(title: string, now = new Date()): string {
  const safeTitle =
    title
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 80) || "Gemeinde-Stream";
  return `${safeTitle}-${now.toISOString().replace(/[:.]/g, "-")}.webm`;
}

function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const remaining = (seconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${remaining}`;
}

export function ProgramRecorder({
  room,
  title,
  programState,
  sources,
  audioMix,
  enabled,
}: {
  room: Room;
  title: string;
  programState: BroadcastProgramState | null;
  sources: ProgramMediaSource[];
  audioMix: Record<string, number>;
  enabled: boolean;
}) {
  const [status, setStatus] = useState<
    "idle" | "starting" | "recording" | "saving" | "error"
  >("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const failedRef = useRef(false);
  const startingRef = useRef(false);
  const sessionRef = useRef<ProgramMediaSession | null>(null);
  const writeQueueRef = useRef(Promise.resolve());
  const programRef = useRef({ programState, sources, audioMix });
  const { profile } = useProductionProfile();
  const preflight = useProductionPreflight({
    hasProgram: Boolean(programState),
    hasSources: sources.length > 0,
    roomConnected: room.state === ConnectionState.Connected,
    requireFfmpeg: false,
    requireNetwork: false,
  });
  useEffect(() => {
    programRef.current = { programState, sources, audioMix };
  }, [audioMix, programState, sources]);
  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(
      () => setElapsed((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [status]);
  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") {
        recorder.addEventListener(
          "stop",
          () =>
            void writeQueueRef.current
              .then(() => window.desktop.finishRecording())
              .catch(() => window.desktop.cancelRecording())
              .catch(() => undefined)
              .finally(() => sessionRef.current?.cleanup()),
          { once: true },
        );
        recorder.stop();
      } else sessionRef.current?.cleanup();
    },
    [],
  );

  function failRecording(cause: unknown) {
    if (failedRef.current) return;
    failedRef.current = true;
    const detail =
      cause instanceof Error
        ? cause.message
        : "Die Aufzeichnung wurde unterbrochen.";
    setError(
      `${detail} Bereits geschriebene Aufnahmedaten bleiben am gewählten Speicherort erhalten; die Datei kann unvollständig sein.`,
    );
    setStatus("saving");
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    sessionRef.current?.cleanup();
    recorderRef.current = null;
    sessionRef.current = null;
    void window.desktop
      .cancelRecording()
      .catch(() => undefined)
      .finally(() => setStatus("error"));
  }

  async function start() {
    if (!programState || (status !== "idle" && status !== "error")) return;
    if (!preflight.ready) {
      setError("Der Technik-Preflight enthält noch kritische Punkte.");
      return;
    }
    if (startingRef.current) return;
    startingRef.current = true;
    failedRef.current = false;
    setStatus("starting");
    setError("");
    try {
      const selected = await window.desktop.beginRecording(
        recordingFileName(title),
      );
      if (!selected) {
        setStatus("idle");
        return;
      }
      const session = await createProgramMediaSession(
        room,
        () => programRef.current,
        profile,
      );
      sessionRef.current = session;
      const mimeType = preferredProgramMimeType();
      const recorder = new MediaRecorder(
        session.stream,
        mimeType
          ? {
              mimeType,
              videoBitsPerSecond: profile.recordingVideoBitrate,
              audioBitsPerSecond: 192_000,
            }
          : undefined,
      );
      recorderRef.current = recorder;
      writeQueueRef.current = Promise.resolve();
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size === 0 || failedRef.current) return;
        writeQueueRef.current = writeQueueRef.current.then(async () =>
          window.desktop.appendRecording(await event.data.arrayBuffer()),
        );
        void writeQueueRef.current.catch(failRecording);
      });
      recorder.addEventListener("error", () =>
        failRecording(
          new Error("Die Programm-Aufzeichnung wurde unerwartet beendet."),
        ),
      );
      recorder.start(1000);
      setElapsed(0);
      setStatus("recording");
    } catch (cause) {
      failRecording(cause);
    } finally {
      startingRef.current = false;
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
      sessionRef.current?.cleanup();
      recorderRef.current = null;
      sessionRef.current = null;
      setStatus("idle");
    } catch (cause) {
      failRecording(cause);
    }
  }

  const recording = status === "recording";
  return (
    <div className="program-recorder">
      <button
        className={recording ? "recording" : ""}
        disabled={
          status === "starting" ||
          status === "saving" ||
          (!recording && (!enabled || !programState || !preflight.ready))
        }
        onClick={() => (recording ? void stop() : void start())}
      >
        {recording ? <CircleStop /> : <Disc3 />}
        <span>
          <b>
            {recording
              ? "Aufnahme stoppen"
              : status === "starting"
                ? "Aufnahme wird vorbereitet …"
                : status === "saving"
                  ? "Wird gespeichert …"
                  : "Programm aufnehmen"}
          </b>
          <small>
            {recording
              ? formatElapsed(elapsed)
              : !enabled
                ? "Für diese Veranstaltung deaktiviert"
                : `${profile.label} · Video und Audio`}
          </small>
        </span>
      </button>
      {error && <small className="recorder-error">{error}</small>}
    </div>
  );
}
