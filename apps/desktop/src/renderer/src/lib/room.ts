import { Room, RoomEvent } from "livekit-client";

export type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "error";

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
      resolution: { width: 1920, height: 1080, frameRate: 30 },
    });
  }

  async setScreenShare(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setScreenShareEnabled(enabled);
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
