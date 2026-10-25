/// <reference types="vite/client" />

interface Window {
  desktop: {
    platform: string;
    version: string;
    beginRecording(suggestedName: string): Promise<boolean>;
    appendRecording(chunk: ArrayBuffer): Promise<void>;
    finishRecording(): Promise<void>;
    cancelRecording(): Promise<void>;
  };
}
