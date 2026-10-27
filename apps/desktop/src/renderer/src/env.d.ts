/// <reference types="vite/client" />

interface Window {
  desktop: {
    platform: string;
    version: string;
    getSystemPreflight(): Promise<{
      ffmpegAvailable: boolean;
      freeDiskBytes: number;
      logicalCpuCount: number;
      totalMemoryBytes: number;
      platform: string;
    }>;
    reportDiagnostic(
      type: string,
      message: string,
      detail?: string,
    ): Promise<void>;
    exportDiagnostics(): Promise<boolean>;
    onOpenJoinLink(callback: (joinCode: string) => void): () => void;
    listMedia(): Promise<
      Array<{
        id: string;
        name: string;
        type: "image" | "video" | "audio";
        url: string;
      }>
    >;
    pickMedia(): Promise<
      Array<{
        id: string;
        name: string;
        type: "image" | "video" | "audio";
        url: string;
      }>
    >;
    removeMedia(assetId: string): Promise<void>;
    beginRecording(suggestedName: string): Promise<boolean>;
    appendRecording(chunk: ArrayBuffer): Promise<void>;
    finishRecording(): Promise<void>;
    cancelRecording(): Promise<void>;
    beginStream(
      destinationsOrServer:
        | Array<{
            id: string;
            label: string;
            serverUrl: string;
            streamKey: string;
          }>
        | string,
      streamKeyOrProfile?:
        | string
        | {
            width: number;
            height: number;
            frameRate: number;
            videoBitrateKbps: number;
          },
    ): Promise<boolean>;
    appendStream(chunk: ArrayBuffer): Promise<void>;
    finishStream(): Promise<void>;
    cancelStream(): Promise<void>;
    onStreamStatus(
      callback: (status: {
        state: "target-connecting" | "target-live" | "target-error";
        targetId: string;
        label: string;
        message: string;
      }) => void,
    ): () => void;
  };
}
