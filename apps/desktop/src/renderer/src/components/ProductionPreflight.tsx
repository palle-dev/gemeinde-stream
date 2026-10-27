import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, RefreshCw, X } from "lucide-react";

export interface PreflightCheck {
  id: string;
  label: string;
  detail: string;
  state: "pass" | "warning" | "fail";
  required: boolean;
}
interface SystemPreflight {
  ffmpegAvailable: boolean;
  freeDiskBytes: number;
  logicalCpuCount: number;
  totalMemoryBytes: number;
  platform: string;
}

export function buildPreflightChecks(
  system: SystemPreflight | null,
  options: {
    hasProgram: boolean;
    hasSources: boolean;
    roomConnected: boolean;
    requireFfmpeg: boolean;
    requireNetwork: boolean;
    online: boolean;
    mediaRecorder: boolean;
  },
): PreflightCheck[] {
  const gib = (bytes: number) => bytes / 1024 / 1024 / 1024;
  return [
    {
      id: "program",
      label: "Programmbild",
      detail: options.hasProgram
        ? "TAKE wurde ausgeführt"
        : "Noch kein Programmbild geschaltet",
      state: options.hasProgram ? "pass" : "fail",
      required: true,
    },
    {
      id: "sources",
      label: "Medienquellen",
      detail: options.hasSources
        ? "Mindestens eine Quelle ist verfügbar"
        : "Keine verwendbare Quelle",
      state: options.hasSources ? "pass" : "fail",
      required: true,
    },
    {
      id: "recorder",
      label: "Encoder",
      detail: options.mediaRecorder
        ? "Browser-Encoder verfügbar"
        : "MediaRecorder wird nicht unterstützt",
      state: options.mediaRecorder ? "pass" : "fail",
      required: true,
    },
    {
      id: "room",
      label: "Medienraum",
      detail: options.roomConnected
        ? "LiveKit-Medienverbindung ist aktiv"
        : "Keine aktive Verbindung zum Medienraum",
      state: options.roomConnected ? "pass" : "fail",
      required: true,
    },
    {
      id: "network",
      label: "Netzwerk",
      detail: !options.requireNetwork
        ? "Für die lokale Aufnahme nicht erforderlich"
        : options.online
          ? "Netzwerkverbindung erkannt"
          : "Computer ist offline",
      state: !options.requireNetwork || options.online ? "pass" : "fail",
      required: options.requireNetwork,
    },
    {
      id: "ffmpeg",
      label: "Streaming-Engine",
      detail: !options.requireFfmpeg
        ? "Für diese Aktion nicht erforderlich"
        : system?.ffmpegAvailable
          ? "FFmpeg ist einsatzbereit"
          : system
            ? "FFmpeg wurde nicht gefunden"
            : "Wird geprüft …",
      state:
        !options.requireFfmpeg || system?.ffmpegAvailable
          ? "pass"
          : system
            ? "fail"
            : "warning",
      required: options.requireFfmpeg,
    },
    {
      id: "disk",
      label: "Freier Speicher",
      detail: system?.freeDiskBytes
        ? `${gib(system.freeDiskBytes).toFixed(1)} GB verfügbar`
        : "Speicher konnte nicht ermittelt werden",
      state: !system
        ? "warning"
        : gib(system.freeDiskBytes) >= 10
          ? "pass"
          : gib(system.freeDiskBytes) >= 3
            ? "warning"
            : "fail",
      required: true,
    },
    {
      id: "performance",
      label: "Rechnerleistung",
      detail: system
        ? `${system.logicalCpuCount} logische Kerne · ${gib(system.totalMemoryBytes).toFixed(0)} GB RAM`
        : "Wird geprüft …",
      state: !system
        ? "warning"
        : system.logicalCpuCount >= 8 && gib(system.totalMemoryBytes) >= 16
          ? "pass"
          : "warning",
      required: false,
    },
  ];
}

export function useProductionPreflight(options: {
  hasProgram: boolean;
  hasSources: boolean;
  roomConnected: boolean;
  requireFfmpeg: boolean;
  requireNetwork: boolean;
}) {
  const [system, setSystem] = useState<SystemPreflight | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSystem(await window.desktop.getSystemPreflight());
    } catch {
      setSystem(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const checks = useMemo(
    () =>
      buildPreflightChecks(system, {
        ...options,
        online: navigator.onLine,
        mediaRecorder: typeof MediaRecorder !== "undefined",
      }),
    [
      options.hasProgram,
      options.hasSources,
      options.roomConnected,
      options.requireFfmpeg,
      options.requireNetwork,
      system,
    ],
  );
  return {
    checks,
    loading,
    ready: preflightIsReady(checks),
    refresh,
  };
}

export function preflightIsReady(checks: PreflightCheck[]): boolean {
  return checks.every((check) => !check.required || check.state === "pass");
}

export function ProductionPreflight({
  checks,
  loading,
  onRefresh,
}: {
  checks: PreflightCheck[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const blocking = checks.filter(
    (check) => check.required && check.state !== "pass",
  ).length;
  return (
    <section
      className={`production-preflight ${blocking ? "blocked" : "ready"}`}
    >
      <header>
        <div>
          <b>Technik-Preflight</b>
          <small>
            {blocking
              ? `${blocking} kritische oder ausstehende Punkte`
              : "Bereit für die Ausspielung"}
          </small>
        </div>
        <button
          type="button"
          title="Erneut prüfen"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw className={loading ? "spin" : ""} />
        </button>
      </header>
      <div>
        {checks.map((check) => (
          <span key={check.id} className={check.state} title={check.detail}>
            {check.state === "pass" ? (
              <Check />
            ) : check.state === "fail" ? (
              <X />
            ) : (
              <AlertTriangle />
            )}
            <b>{check.label}</b>
            <small>{check.detail}</small>
          </span>
        ))}
      </div>
    </section>
  );
}
