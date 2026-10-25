import { useEffect, useRef, useState } from "react";
import { CircleStop, Radio } from "lucide-react";
import type { Room } from "livekit-client";
import type { BroadcastProgramState } from "./BroadcastCoordination";
import { createProgramMediaSession, preferredProgramMimeType, type ProgramMediaSession, type ProgramMediaSource } from "./ProgramMedia";

export function isRtmpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "rtmp:" || url.protocol === "rtmps:";
  } catch {
    return false;
  }
}

export function ProgramStreamer({ room, programState, sources, audioMix, enabled }: { room: Room; programState: BroadcastProgramState | null; sources: ProgramMediaSource[]; audioMix: Record<string, number>; enabled: boolean }) {
  const [serverUrl, setServerUrl] = useState("");
  const [streamKey, setStreamKey] = useState("");
  const [status, setStatus] = useState<"idle" | "starting" | "streaming" | "stopping" | "error">("idle");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sessionRef = useRef<ProgramMediaSession | null>(null);
  const writeQueueRef = useRef(Promise.resolve());
  const programRef = useRef({ programState, sources, audioMix });

  useEffect(() => { programRef.current = { programState, sources, audioMix }; }, [audioMix, programState, sources]);
  useEffect(() => {
    if (status !== "streaming") return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [status]);
  useEffect(() => window.desktop.onStreamStatus((next) => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    recorderRef.current = null;
    sessionRef.current?.cleanup();
    sessionRef.current = null;
    setError(next.message);
    setStatus("error");
  }), []);
  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    sessionRef.current?.cleanup();
    void window.desktop.cancelStream();
  }, []);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (!programState || status === "starting" || status === "streaming") return;
    if (!isRtmpUrl(serverUrl)) { setError("Bitte eine gültige RTMP- oder RTMPS-Serveradresse eingeben."); return; }
    if (!streamKey.trim()) { setError("Bitte den Stream-Schlüssel eingeben."); return; }
    setStatus("starting"); setError("");
    try {
      const session = await createProgramMediaSession(room, () => programRef.current);
      sessionRef.current = session;
      await window.desktop.beginStream(serverUrl, streamKey);
      setStreamKey("");
      const mimeType = preferredProgramMimeType();
      const recorder = new MediaRecorder(session.stream, mimeType ? { mimeType, videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 192_000 } : undefined);
      recorderRef.current = recorder;
      writeQueueRef.current = Promise.resolve();
      recorder.addEventListener("dataavailable", (chunk) => {
        if (chunk.data.size === 0) return;
        writeQueueRef.current = writeQueueRef.current.then(async () => window.desktop.appendStream(await chunk.data.arrayBuffer())).catch((cause) => {
          setError(cause instanceof Error ? cause.message : "Die Streaming-Verbindung wurde unterbrochen.");
          setStatus("error");
          session.cleanup();
          void window.desktop.cancelStream();
        });
      });
      recorder.addEventListener("error", () => {
        setError("Die Programmkodierung wurde unerwartet beendet."); setStatus("error");
        session.cleanup(); void window.desktop.cancelStream();
      });
      recorder.start(500); setElapsed(0); setStatus("streaming");
    } catch (cause) {
      sessionRef.current?.cleanup(); sessionRef.current = null;
      await window.desktop.cancelStream().catch(() => undefined);
      setError(cause instanceof Error ? cause.message : "Livestream konnte nicht gestartet werden."); setStatus("error");
    }
  }

  async function stop() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    setStatus("stopping");
    try {
      await new Promise<void>((resolve) => { recorder.addEventListener("stop", () => resolve(), { once: true }); recorder.stop(); });
      await writeQueueRef.current; await window.desktop.finishStream();
      sessionRef.current?.cleanup(); recorderRef.current = null; sessionRef.current = null; setStatus("idle");
    } catch (cause) {
      sessionRef.current?.cleanup(); await window.desktop.cancelStream().catch(() => undefined);
      setError(cause instanceof Error ? cause.message : "Livestream konnte nicht sauber beendet werden."); setStatus("error");
    }
  }

  const streaming = status === "streaming";
  const elapsedText = new Date(elapsed * 1000).toISOString().slice(11, 19);
  return <form className={`program-streamer ${streaming ? "streaming" : ""}`} onSubmit={start}><div className="streamer-heading"><span className="eyebrow">LIVESTREAM</span>{streaming && <small>● LIVE · {elapsedText}</small>}</div>{!streaming ? <><label>Server<input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="rtmps://server.example/live" disabled={status === "starting" || status === "stopping"} /></label><label>Stream-Schlüssel<input type="password" value={streamKey} onChange={(event) => setStreamKey(event.target.value)} placeholder="••••••••••••" autoComplete="off" disabled={status === "starting" || status === "stopping"} /></label><button className="start-stream" disabled={!enabled || !programState || status === "starting" || status === "stopping"}><Radio /><span><b>{status === "starting" ? "Verbindung wird aufgebaut …" : "Livestream starten"}</b><small>RTMP(S) · 1080p60 · 8 Mbit/s</small></span></button></> : <button type="button" className="stop-stream" onClick={() => void stop()}><CircleStop /><span><b>Livestream stoppen</b><small>Programmausgabe ist live</small></span></button>}{error && <small className="streamer-error">{error}</small>}</form>;
}
