import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";

const CAPTION_TOPIC = "gemeinde-stream.caption.v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CAPTION_LIFETIME = 10_000;

export interface MeetingCaption {
  id: string;
  senderIdentity: string;
  senderName: string;
  text: string;
  sentAt: number;
  expiresAt: number;
}

export type MeetingTranscriptEntry = Omit<MeetingCaption, "expiresAt">;

const MAX_TRANSCRIPT_ENTRIES = 2_000;

function singleLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

export function meetingTranscriptText(title: string, entries: MeetingTranscriptEntry[], exportedAt = new Date()): string {
  const heading = singleLine(title) || "Meeting";
  const lines = entries.map((entry) => {
    const timestamp = new Date(entry.sentAt);
    const time = Number.isNaN(timestamp.getTime()) ? "--:--:--" : timestamp.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `[${time}] ${singleLine(entry.senderName) || "Teilnehmer"}: ${singleLine(entry.text)}`;
  });
  return [`Untertitelprotokoll · ${heading}`, `Exportiert: ${exportedAt.toLocaleString("de-DE")}`, "", ...lines, ""].join("\r\n");
}

export function appendTranscriptEntry(current: MeetingTranscriptEntry[], caption: MeetingCaption, limit = MAX_TRANSCRIPT_ENTRIES): MeetingTranscriptEntry[] {
  if (current.some((entry) => entry.id === caption.id && entry.senderIdentity === caption.senderIdentity)) return current;
  const entry: MeetingTranscriptEntry = {
    id: caption.id,
    senderIdentity: caption.senderIdentity,
    senderName: singleLine(caption.senderName) || "Teilnehmer",
    text: singleLine(caption.text),
    sentAt: caption.sentAt,
  };
  return [...current, entry].sort((left, right) => left.sentAt - right.sentAt).slice(-Math.max(1, limit));
}

const FATAL_RECOGNITION_ERRORS = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);

export function captionRecognitionCanRestart(requested: boolean, connected: boolean, error = ""): boolean {
  return requested && connected && !FATAL_RECOGNITION_ERRORS.has(error);
}

interface RecognitionResultEvent {
  resultIndex: number;
  results: { [index: number]: { isFinal: boolean; 0: { transcript: string } }; length: number };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

export function parseCaption(payload: Uint8Array, now = Date.now()): { id: string; text: string; sentAt: number } | null {
  try {
    const value = JSON.parse(decoder.decode(payload));
    if (value?.type !== "caption" || typeof value.id !== "string" || !value.id || value.id.length > 100 || typeof value.text !== "string" || typeof value.sentAt !== "number" || !Number.isFinite(value.sentAt)) return null;
    const text = singleLine(value.text);
    if (!text || text.length > 500 || Math.abs(now - value.sentAt) > 60_000) return null;
    return { id: value.id, text, sentAt: value.sentAt };
  } catch { return null; }
}

export function useMeetingCaptions(room: Room, connected: boolean) {
  const [captions, setCaptions] = useState<MeetingCaption[]>([]);
  const [transcript, setTranscript] = useState<MeetingTranscriptEntry[]>([]);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const requestedRef = useRef(false);
  const connectedRef = useRef(connected);
  const restartTimerRef = useRef<number | undefined>(undefined);
  const seenCaptionIdsRef = useRef(new Map<string, number>());
  const startRef = useRef<() => void>(() => undefined);
  const Recognition = (window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }).SpeechRecognition
    || (window as Window & { webkitSpeechRecognition?: RecognitionConstructor }).webkitSpeechRecognition;
  const supported = Boolean(Recognition);
  connectedRef.current = connected;

  const addCaption = useCallback((caption: MeetingCaption) => {
    setCaptions((current) => [...current.filter((entry) => (entry.id !== caption.id || entry.senderIdentity !== caption.senderIdentity) && entry.expiresAt > Date.now()), caption].slice(-3));
    setTranscript((current) => appendTranscriptEntry(current, caption));
  }, []);

  useEffect(() => {
    if (!connected) {
      requestedRef.current = false;
      window.clearTimeout(restartTimerRef.current);
      setCaptions([]); seenCaptionIdsRef.current.clear(); recognitionRef.current?.stop(); recognitionRef.current = null; setListening(false); return;
    }
    const receive = (payload: Uint8Array, participant?: { identity: string; name?: string }, _kind?: unknown, topic?: string) => {
      if (topic !== CAPTION_TOPIC || !participant?.identity || participant.identity.length > 200 || (participant.name?.length ?? 0) > 80) return;
      const parsed = parseCaption(payload);
      if (!parsed) return;
      const key = `${participant.identity}:${parsed.id}`;
      if (seenCaptionIdsRef.current.has(key)) return;
      const now = Date.now();
      seenCaptionIdsRef.current.set(key, now);
      for (const [seenKey, receivedAt] of seenCaptionIdsRef.current) if (now - receivedAt > 60_000) seenCaptionIdsRef.current.delete(seenKey);
      while (seenCaptionIdsRef.current.size > 500) seenCaptionIdsRef.current.delete(seenCaptionIdsRef.current.keys().next().value as string);
      addCaption({ ...parsed, senderIdentity: participant.identity, senderName: singleLine(participant.name || "Teilnehmer") || "Teilnehmer", expiresAt: now + CAPTION_LIFETIME });
    };
    room.on(RoomEvent.DataReceived, receive);
    const timer = window.setInterval(() => setCaptions((current) => current.filter((caption) => caption.expiresAt > Date.now())), 1_000);
    return () => { room.off(RoomEvent.DataReceived, receive); window.clearInterval(timer); };
  }, [addCaption, connected, room]);

  useEffect(() => () => {
    requestedRef.current = false;
    window.clearTimeout(restartTimerRef.current);
    recognitionRef.current?.stop();
  }, []);

  async function publish(text: string) {
    const caption = { type: "caption" as const, id: crypto.randomUUID(), text: text.trim().slice(0, 500), sentAt: Date.now() };
    if (!caption.text) return;
    seenCaptionIdsRef.current.set(`${room.localParticipant.identity}:${caption.id}`, caption.sentAt);
    addCaption({ ...caption, senderIdentity: room.localParticipant.identity, senderName: room.localParticipant.name || "Sie", expiresAt: caption.sentAt + CAPTION_LIFETIME });
    await room.localParticipant.publishData(encoder.encode(JSON.stringify(caption)), { reliable: true, topic: CAPTION_TOPIC });
  }

  function stop() {
    requestedRef.current = false;
    window.clearTimeout(restartTimerRef.current);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }

  const start = useCallback(() => {
    if (recognitionRef.current || !requestedRef.current || !connectedRef.current) return;
    if (!Recognition) { setError("Die Spracherkennung ist auf diesem Windows-System nicht verfügbar."); return; }
    try {
      const recognition = new Recognition();
      recognition.lang = "de-DE";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result.isFinal) void publish(result[0].transcript).catch((cause) => setError(cause instanceof Error ? cause.message : "Untertitel konnten nicht gesendet werden."));
        }
      };
      recognition.onerror = (event) => {
        const recognitionError = event.error || "unknown";
        if (FATAL_RECOGNITION_ERRORS.has(recognitionError)) {
          requestedRef.current = false;
          setError(recognitionError === "not-allowed" || recognitionError === "service-not-allowed" ? "Mikrofonzugriff für Untertitel wurde abgelehnt." : "Für Untertitel ist kein Mikrofon verfügbar.");
        } else if (recognitionError !== "no-speech" && recognitionError !== "aborted") {
          setError("Die Spracherkennung wurde kurz unterbrochen und wird neu gestartet.");
        }
      };
      recognition.onend = () => {
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        setListening(false);
        if (captionRecognitionCanRestart(requestedRef.current, connectedRef.current)) {
          window.clearTimeout(restartTimerRef.current);
          restartTimerRef.current = window.setTimeout(() => startRef.current(), 300);
        }
      };
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Die Spracherkennung konnte nicht gestartet werden.");
      recognitionRef.current = null;
      setListening(false);
      if (captionRecognitionCanRestart(requestedRef.current, connectedRef.current)) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = window.setTimeout(() => startRef.current(), 1_000);
      }
    }
  }, [Recognition]);
  startRef.current = start;

  function toggle() {
    if (requestedRef.current) { stop(); return; }
    requestedRef.current = true;
    start();
  }

  return { captions, transcript, listening, supported, error, toggle, clearTranscript: () => setTranscript([]) };
}
