import { useCallback, useEffect, useRef, useState } from "react";
import { CircleStop, Plus, Radio, Trash2 } from "lucide-react";
import { ConnectionState, type Room } from "livekit-client";
import type { BroadcastProgramState } from "./BroadcastCoordination";
import {
  createProgramMediaSession,
  preferredProgramMimeType,
  type ProgramMediaSession,
  type ProgramMediaSource,
} from "./ProgramMedia";
import {
  ProductionPreflight,
  useProductionPreflight,
} from "./ProductionPreflight";
import {
  PRODUCTION_PROFILES,
  useProductionProfile,
  type ProductionProfileId,
} from "../lib/productionProfile";

export type StreamPlatform = "youtube" | "facebook" | "custom";
export interface StreamProfile {
  id: string;
  label: string;
  platform: StreamPlatform;
  serverUrl: string;
  streamKey: string;
  enabled: boolean;
}
interface StoredProfile {
  id: string;
  label: string;
  platform: StreamPlatform;
  serverUrl: string;
  enabled: boolean;
}
const STORAGE_KEY = "gemeinde-stream.stream-profiles.v1";
const platformDefaults: Record<
  StreamPlatform,
  { label: string; serverUrl: string }
> = {
  youtube: { label: "YouTube", serverUrl: "rtmps://a.rtmp.youtube.com/live2" },
  facebook: {
    label: "Facebook",
    serverUrl: "rtmps://live-api-s.facebook.com:443/rtmp/",
  },
  custom: { label: "Eigenes Ziel", serverUrl: "" },
};

export function isStreamingUrl(value: string): boolean {
  try {
    const protocol = new URL(value.trim()).protocol;
    return protocol === "rtmp:" || protocol === "rtmps:";
  } catch {
    return false;
  }
}
export function profilesForStorage(profiles: StreamProfile[]): StoredProfile[] {
  return profiles.map(({ id, label, platform, serverUrl, enabled }) => ({
    id,
    label,
    platform,
    serverUrl,
    enabled,
  }));
}
function loadProfiles(): StreamProfile[] {
  try {
    const values = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]",
    ) as StoredProfile[];
    if (Array.isArray(values) && values.length)
      return values.slice(0, 5).map((value) => ({ ...value, streamKey: "" }));
  } catch {
    /* Use default. */
  }
  return [
    {
      id: crypto.randomUUID(),
      platform: "youtube",
      ...platformDefaults.youtube,
      streamKey: "",
      enabled: true,
    },
  ];
}

export function MultiProgramStreamer({
  room,
  programState,
  sources,
  audioMix,
  enabled,
}: {
  room: Room;
  programState: BroadcastProgramState | null;
  sources: ProgramMediaSource[];
  audioMix: Record<string, number>;
  enabled: boolean;
}) {
  const [profiles, setProfiles] = useState<StreamProfile[]>(loadProfiles);
  const [status, setStatus] = useState<
    "idle" | "starting" | "streaming" | "stopping" | "error"
  >("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [liveIds, setLiveIds] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sessionRef = useRef<ProgramMediaSession | null>(null);
  const writesRef = useRef(Promise.resolve());
  const activeRef = useRef(new Set<string>());
  const failureRef = useRef(false);
  const programRef = useRef({ programState, sources, audioMix });
  const { profile, setProfile } = useProductionProfile();
  const preflight = useProductionPreflight({
    hasProgram: Boolean(programState),
    hasSources: sources.length > 0,
    roomConnected: room.state === ConnectionState.Connected,
    requireFfmpeg: true,
    requireNetwork: true,
  });
  useEffect(() => {
    programRef.current = { programState, sources, audioMix };
  }, [audioMix, programState, sources]);
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(profilesForStorage(profiles)),
    );
  }, [profiles]);
  useEffect(() => {
    if (status !== "streaming") return;
    const timer = window.setInterval(
      () => setElapsed((value) => value + 1),
      1000,
    );
    return () => clearInterval(timer);
  }, [status]);

  const releaseStreamingSession = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder?.state === "recording") recorder.stop();
    sessionRef.current?.cleanup();
    sessionRef.current = null;
    activeRef.current.clear();
    setActiveIds([]);
    setLiveIds([]);
  }, []);

  const failStreaming = useCallback(
    (message: string) => {
      if (failureRef.current) return;
      failureRef.current = true;
      releaseStreamingSession();
      setErrors((current) => ({ ...current, general: message }));
      setStatus("stopping");
      void window.desktop
        .cancelStream()
        .catch(() => undefined)
        .finally(() => setStatus("error"));
    },
    [releaseStreamingSession],
  );

  useEffect(
    () =>
      window.desktop.onStreamStatus((next) => {
        if (next.state === "target-live") {
          setLiveIds((current) => [...new Set([...current, next.targetId])]);
          setErrors((current) => {
            const updated = { ...current };
            delete updated[next.targetId];
            return updated;
          });
          return;
        }
        if (next.state === "target-connecting") {
          setLiveIds((current) => current.filter((id) => id !== next.targetId));
          return;
        }
        activeRef.current.delete(next.targetId);
        setLiveIds((current) => current.filter((id) => id !== next.targetId));
        setActiveIds([...activeRef.current]);
        setErrors((current) => ({ ...current, [next.targetId]: next.message }));
        if (!activeRef.current.size)
          failStreaming("Alle Streaming-Ziele sind ausgefallen.");
      }),
    [failStreaming],
  );
  useEffect(
    () => () => {
      failureRef.current = true;
      releaseStreamingSession();
      void window.desktop.cancelStream();
    },
    [releaseStreamingSession],
  );
  const update = (id: string, values: Partial<StreamProfile>) =>
    setProfiles((current) =>
      current.map((profile) =>
        profile.id === id ? { ...profile, ...values } : profile,
      ),
    );
  const add = () => {
    if (profiles.length < 5)
      setProfiles((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          platform: "custom",
          ...platformDefaults.custom,
          streamKey: "",
          enabled: true,
        },
      ]);
  };
  const remove = (id: string) =>
    setProfiles((current) => current.filter((profile) => profile.id !== id));
  const setPlatform = (profile: StreamProfile, platform: StreamPlatform) =>
    update(profile.id, { platform, ...platformDefaults[platform] });

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (!preflight.ready) {
      setErrors({
        general: "Der Technik-Preflight enthält noch kritische Punkte.",
      });
      return;
    }
    if (!programState || status === "starting" || status === "streaming")
      return;
    const targets = profiles.filter((profile) => profile.enabled);
    const invalid = targets.find(
      (profile) =>
        !profile.label.trim() ||
        !isStreamingUrl(profile.serverUrl) ||
        !profile.streamKey.trim(),
    );
    if (!targets.length) {
      setErrors({ general: "Aktivieren Sie mindestens ein Streaming-Ziel." });
      return;
    }
    if (invalid) {
      setErrors({
        [invalid.id]: `Server und Stream-Schlüssel für ${invalid.label || "dieses Ziel"} fehlen.`,
      });
      return;
    }
    failureRef.current = false;
    setStatus("starting");
    setErrors({});
    try {
      const session = await createProgramMediaSession(
        room,
        () => programRef.current,
        profile,
      );
      sessionRef.current = session;
      await window.desktop.beginStream(
        targets.map((profile) => ({
          id: profile.id,
          label: profile.label,
          serverUrl: profile.serverUrl,
          streamKey: profile.streamKey,
        })),
        {
          width: profile.width,
          height: profile.height,
          frameRate: profile.frameRate,
          videoBitrateKbps: profile.streamingVideoBitrateKbps,
        },
      );
      activeRef.current = new Set(targets.map((profile) => profile.id));
      setActiveIds([...activeRef.current]);
      setLiveIds([]);
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
      writesRef.current = Promise.resolve();
      recorder.addEventListener("dataavailable", (event) => {
        if (!event.data.size || failureRef.current) return;
        writesRef.current = writesRef.current
          .then(async () =>
            window.desktop.appendStream(await event.data.arrayBuffer()),
          )
          .catch((cause) => {
            failStreaming(
              cause instanceof Error
                ? cause.message
                : "Alle Streaming-Ziele sind ausgefallen.",
            );
          });
      });
      recorder.addEventListener("error", () => {
        failStreaming("Die Programmkodierung wurde unerwartet beendet.");
      });
      recorder.start(500);
      setElapsed(0);
      setStatus("streaming");
    } catch (cause) {
      failureRef.current = true;
      releaseStreamingSession();
      await window.desktop.cancelStream().catch(() => undefined);
      setErrors({
        general:
          cause instanceof Error
            ? cause.message
            : "Mehrziel-Stream konnte nicht gestartet werden.",
      });
      setStatus("error");
    }
  }
  async function stop() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    setStatus("stopping");
    try {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
      await writesRef.current;
      await window.desktop.finishStream();
      releaseStreamingSession();
      failureRef.current = false;
      setStatus("idle");
    } catch (cause) {
      failureRef.current = true;
      await window.desktop.cancelStream().catch(() => undefined);
      releaseStreamingSession();
      setErrors({
        general:
          cause instanceof Error
            ? cause.message
            : "Streams konnten nicht sauber beendet werden.",
      });
      setStatus("error");
    }
  }

  const streaming = status === "streaming";
  const locked = streaming || status === "starting" || status === "stopping";
  const elapsedText = new Date(elapsed * 1000).toISOString().slice(11, 19);
  return (
    <form
      className={`program-streamer multi ${streaming ? "streaming" : ""}`}
      onSubmit={start}
    >
      <div className="streamer-heading">
        <span className="eyebrow">STREAMING-ZIELE</span>
        {streaming && (
          <small>
            ● {liveIds.length}/{activeIds.length} VERBUNDEN · {elapsedText}
          </small>
        )}
      </div>
      {!enabled && (
        <small className="feature-disabled">
          Streaming ist für diese Veranstaltung deaktiviert.
        </small>
      )}
      {!locked && (
        <ProductionPreflight
          checks={preflight.checks}
          loading={preflight.loading}
          onRefresh={() => void preflight.refresh()}
        />
      )}
      {!locked && (
        <label className="production-profile-select">
          Produktionsprofil
          <select
            value={profile.id}
            onChange={(event) =>
              setProfile(event.target.value as ProductionProfileId)
            }
          >
            {PRODUCTION_PROFILES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} · {option.description}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="stream-profile-list">
        {profiles.map((profile) => (
          <article
            key={profile.id}
            className={
              activeIds.includes(profile.id)
                ? "live"
                : errors[profile.id]
                  ? "failed"
                  : ""
            }
          >
            <div className="stream-profile-heading">
              <input
                type="checkbox"
                checked={profile.enabled}
                onChange={(event) =>
                  update(profile.id, { enabled: event.target.checked })
                }
                disabled={locked}
              />
              <select
                value={profile.platform}
                onChange={(event) =>
                  setPlatform(profile, event.target.value as StreamPlatform)
                }
                disabled={locked}
              >
                <option value="youtube">YouTube</option>
                <option value="facebook">Facebook</option>
                <option value="custom">Eigenes Ziel</option>
              </select>
              {profiles.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(profile.id)}
                  disabled={locked}
                >
                  <Trash2 />
                </button>
              )}
            </div>
            <input
              value={profile.label}
              onChange={(event) =>
                update(profile.id, { label: event.target.value })
              }
              placeholder="Bezeichnung"
              disabled={locked}
            />
            <input
              value={profile.serverUrl}
              onChange={(event) =>
                update(profile.id, { serverUrl: event.target.value })
              }
              placeholder="rtmps://server/live"
              disabled={locked}
            />
            <input
              type="password"
              value={profile.streamKey}
              onChange={(event) =>
                update(profile.id, { streamKey: event.target.value })
              }
              placeholder="Stream-Schlüssel (nicht gespeichert)"
              autoComplete="off"
              disabled={locked}
            />
            {activeIds.includes(profile.id) && (
              <small className="profile-live">
                ● {liveIds.includes(profile.id) ? "VERBUNDEN" : "VERBINDET …"}
              </small>
            )}
            {errors[profile.id] && (
              <small className="streamer-error">{errors[profile.id]}</small>
            )}
          </article>
        ))}
      </div>
      {!locked && profiles.length < 5 && (
        <button type="button" className="add-stream-target" onClick={add}>
          <Plus /> Weiteres Ziel
        </button>
      )}
      {!streaming ? (
        <button
          className="start-stream"
          disabled={!enabled || !programState || !preflight.ready || locked}
        >
          <Radio />
          <span>
            <b>
              {status === "starting"
                ? "Ziele werden verbunden …"
                : "Mehrziel-Stream starten"}
            </b>
            <small>
              Bis zu 5 Ziele · {profile.label} ·{" "}
              {(profile.streamingVideoBitrateKbps / 1000).toFixed(1)} Mbit/s
            </small>
          </span>
        </button>
      ) : (
        <button
          type="button"
          className="stop-stream"
          onClick={() => void stop()}
        >
          <CircleStop />
          <span>
            <b>Alle Streams stoppen</b>
            <small>{activeIds.length} Ziele aktiv</small>
          </span>
        </button>
      )}
      {errors.general && (
        <small className="streamer-error">{errors.general}</small>
      )}
    </form>
  );
}
