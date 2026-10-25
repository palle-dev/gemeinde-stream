import { useEffect, useRef, useState } from "react";
import type { ParticipantMedia, VideoMediaTrack } from "./RoomMedia";

export interface QualitySource {
  id: string;
  name: string;
  participant: ParticipantMedia;
  track?: VideoMediaTrack;
}

export interface SourceQuality {
  width?: number;
  height?: number;
  framesPerSecond?: number;
  bitrateBps: number;
  connectionQuality: ParticipantMedia["connectionQuality"];
}

type RtpStat = {
  type?: string;
  kind?: string;
  mediaType?: string;
  framesPerSecond?: number;
};

export type SignalLevel = "good" | "warning" | "poor" | "idle";

export function fpsFromRtpStats(stats: Iterable<RtpStat>): number | undefined {
  for (const stat of stats) {
    if ((stat.type === "inbound-rtp" || stat.type === "outbound-rtp") &&
        (stat.kind === "video" || stat.mediaType === "video") &&
        typeof stat.framesPerSecond === "number") {
      return stat.framesPerSecond;
    }
  }
  return undefined;
}

export function signalLevel(quality?: SourceQuality): SignalLevel {
  if (!quality?.width || !quality.height || !quality.framesPerSecond) return "idle";
  if (quality.connectionQuality === "lost" || quality.connectionQuality === "poor") return "poor";
  if (quality.width < 1280 || quality.height < 720 || quality.framesPerSecond < 25) return "poor";
  if (quality.connectionQuality === "unknown" || quality.framesPerSecond < 50 || quality.width < 1920 || quality.height < 1080) return "warning";
  return "good";
}

export function formatBitrate(bitrateBps: number): string {
  if (!Number.isFinite(bitrateBps) || bitrateBps <= 0) return "Bitrate wird gemessen";
  if (bitrateBps >= 1_000_000) return `${(bitrateBps / 1_000_000).toFixed(1)} Mbit/s`;
  return `${Math.round(bitrateBps / 1_000)} kbit/s`;
}

export function formatSignal(quality?: SourceQuality): string {
  if (!quality?.width || !quality.height) return "Signal wird gemessen";
  const fps = quality.framesPerSecond ? `${Math.round(quality.framesPerSecond)} fps` : "FPS wird gemessen";
  return `${quality.width}×${quality.height} · ${fps}`;
}

function reportStats(report: RTCStatsReport): RtpStat[] {
  const stats: RtpStat[] = [];
  report.forEach((stat) => stats.push(stat as RtpStat));
  return stats;
}

async function measureSource(source: QualitySource): Promise<SourceQuality> {
  const settings = source.track?.mediaStreamTrack.getSettings();
  let framesPerSecond = settings?.frameRate;

  if (source.track) {
    try {
      const report = await source.track.getRTCStatsReport();
      if (report) framesPerSecond = fpsFromRtpStats(reportStats(report)) ?? framesPerSecond;
    } catch {
      // A track can disappear while its final statistics are being read.
    }
  }

  return {
    width: settings?.width,
    height: settings?.height,
    framesPerSecond,
    bitrateBps: source.track?.currentBitrate ?? 0,
    connectionQuality: source.participant.connectionQuality,
  };
}

export function useSourceQuality(sources: QualitySource[], enabled: boolean): Record<string, SourceQuality> {
  const [qualities, setQualities] = useState<Record<string, SourceQuality>>({});
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  useEffect(() => {
    if (!enabled) {
      setQualities({});
      return;
    }
    let active = true;

    const poll = async () => {
      const currentSources = sourcesRef.current.filter((source) => source.track);
      const measured = await Promise.all(currentSources.map(async (source) => [source.id, await measureSource(source)] as const));
      if (active) setQualities(Object.fromEntries(measured));
    };

    void poll();
    const interval = window.setInterval(() => void poll(), 1_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [enabled]);

  return qualities;
}

export function SourceQualityLine({ quality }: { quality?: SourceQuality }) {
  return <small className={`source-quality ${signalLevel(quality)}`}><i />{formatSignal(quality)}</small>;
}

export function SourceQualityMonitor({ sources, qualities }: { sources: QualitySource[]; qualities: Record<string, SourceQuality> }) {
  return <section className="signal-monitor"><div className="signal-monitor-heading"><span className="eyebrow">SIGNALMONITOR</span><small>LIVE</small></div>{sources.length > 0 ? sources.map((source) => {
    const quality = qualities[source.id];
    return <div className={`signal-row ${signalLevel(quality)}`} key={source.id}><i /><div><b>{source.name}</b><span>{formatSignal(quality)}</span><small>{formatBitrate(quality?.bitrateBps ?? 0)} · {quality?.connectionQuality ?? "unbekannt"}</small></div></div>;
  }) : <div className="signal-monitor-empty">Keine Videoquelle verbunden</div>}</section>;
}
