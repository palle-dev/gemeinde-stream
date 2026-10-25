/// <reference types="vite/client" />

interface Window {
  desktop: {
    platform: string;
    version: string;
    beginRecording(suggestedName: string): Promise<boolean>;
    appendRecording(chunk: ArrayBuffer): Promise<void>;
    finishRecording(): Promise<void>;
    cancelRecording(): Promise<void>;
    beginStream(serverUrl: string, streamKey: string): Promise<boolean>;
    appendStream(chunk: ArrayBuffer): Promise<void>;
    finishStream(): Promise<void>;
    cancelStream(): Promise<void>;
    onStreamStatus(callback: (status: { state: "error"; message: string }) => void): () => void;
  };
}
