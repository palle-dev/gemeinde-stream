import { Room, RoomEvent } from "livekit-client";

export const PROGRAM_WIDTH = 1920;
export const PROGRAM_HEIGHT = 1080;
export const PROGRAM_FRAME_RATE = 60;

export type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "error";

export type MediaServerScope = "local" | "private" | "public-secure" | "public-insecure" | "invalid";

export function mediaServerScope(serverUrl: string): MediaServerScope {
  try {
    const parsed = new URL(serverUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return "local";
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return "private";
    return parsed.protocol === "wss:" || parsed.protocol === "https:" ? "public-secure" : "public-insecure";
  } catch {
    return "invalid";
  }
}

export function mediaConnectionMessage(error: unknown, serverUrl: string): string {
  const detail = error instanceof Error ? error.message : "Die Verbindung ist fehlgeschlagen.";
  switch (mediaServerScope(serverUrl)) {
    case "local":
      return `Der lokale Medienserver ist nicht erreichbar. Prüfen Sie, ob LiveKit auf diesem PC läuft. (${detail})`;
    case "private":
      return `Der Medienserver im lokalen Netzwerk ist nicht erreichbar. Prüfen Sie Netzwerk und Firewall. (${detail})`;
    case "public-insecure":
      return "Der öffentliche Medienserver verwendet keine verschlüsselte WSS-Verbindung. Bitte TLS konfigurieren.";
    case "invalid":
      return "Die konfigurierte Medienserver-Adresse ist ungültig.";
    default:
      return detail;
  }
}

export interface MediaPreferences {
  displayName: string;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  microphoneId?: string;
  cameraId?: string;
  speakerId?: string;
}

export class MediaRoom {
  readonly room = new Room({ adaptiveStream: true, dynacast: true });
  private listener?: (state: ConnectionState) => void;

  constructor(listener?: (state: ConnectionState) => void) {
    this.listener = listener;
    this.room.on(RoomEvent.Connected, () => this.listener?.("connected"));
    this.room.on(RoomEvent.Disconnected, () => this.listener?.("disconnected"));
  }

  async connect(serverUrl: string, participantToken: string): Promise<void> {
    this.listener?.("connecting");
    try {
      await this.room.connect(serverUrl, participantToken, { autoSubscribe: true });
    } catch (error) {
      this.listener?.("error");
      throw error;
    }
  }

  async setMicrophone(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setMicrophoneEnabled(enabled);
  }

  async setCamera(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setCameraEnabled(enabled, {
      resolution: { width: PROGRAM_WIDTH, height: PROGRAM_HEIGHT, frameRate: PROGRAM_FRAME_RATE },
    }, {
      videoEncoding: { maxBitrate: 8_000_000, maxFramerate: PROGRAM_FRAME_RATE },
    });
  }

  async setScreenShare(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setScreenShareEnabled(enabled, {
      resolution: { width: PROGRAM_WIDTH, height: PROGRAM_HEIGHT, frameRate: PROGRAM_FRAME_RATE },
      contentHint: "motion",
    }, {
      screenShareEncoding: { maxBitrate: 10_000_000, maxFramerate: PROGRAM_FRAME_RATE },
    });
  }

  async applyDevices(preferences: MediaPreferences): Promise<void> {
    if (preferences.microphoneId) await this.room.switchActiveDevice("audioinput", preferences.microphoneId);
    if (preferences.cameraId) await this.room.switchActiveDevice("videoinput", preferences.cameraId);
    if (preferences.speakerId) await this.room.switchActiveDevice("audiooutput", preferences.speakerId);
  }

  async disconnect(): Promise<void> {
    await this.room.disconnect();
  }
}
