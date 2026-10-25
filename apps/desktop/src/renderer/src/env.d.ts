/// <reference types="vite/client" />

interface Window {
  desktop: {
    platform: string;
    version: string;
    onOpenJoinLink(callback: (joinCode: string) => void): () => void;
    listMedia(): Promise<Array<{ id: string; name: string; type: "image" | "video" | "audio"; url: string }>>;
    pickMedia(): Promise<Array<{ id: string; name: string; type: "image" | "video" | "audio"; url: string }>>;
    removeMedia(assetId: string): Promise<void>;
    beginRecording(suggestedName: string): Promise<boolean>;
    appendRecording(chunk: ArrayBuffer): Promise<void>;
    finishRecording(): Promise<void>;
    cancelRecording(): Promise<void>;
    beginStream(destinationsOrServer: Array<{ id: string; label: string; serverUrl: string; streamKey: string }> | string, streamKey?: string): Promise<boolean>;
    appendStream(chunk: ArrayBuffer): Promise<void>;
    finishStream(): Promise<void>;
    cancelStream(): Promise<void>;
    onStreamStatus(callback: (status: { state: "target-error"; targetId: string; label: string; message: string }) => void): () => void;
  };
}
