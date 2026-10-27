import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  version: ipcRenderer.sendSync("app:version") as string,
  getSystemPreflight: () =>
    ipcRenderer.invoke("system:preflight") as Promise<{
      ffmpegAvailable: boolean;
      freeDiskBytes: number;
      logicalCpuCount: number;
      totalMemoryBytes: number;
      platform: string;
    }>,
  reportDiagnostic: (type: string, message: string, detail?: string) =>
    ipcRenderer.invoke(
      "diagnostics:report",
      type,
      message,
      detail,
    ) as Promise<void>,
  exportDiagnostics: () =>
    ipcRenderer.invoke("diagnostics:export") as Promise<boolean>,
  checkForUpdates: () =>
    ipcRenderer.invoke("update:check") as Promise<{
      currentVersion: string;
      latestVersion: string;
      available: boolean;
      releaseUrl: string;
    }>,
  openUpdate: (releaseUrl: string) =>
    ipcRenderer.invoke("update:open", releaseUrl) as Promise<void>,
  onOpenJoinLink: (callback: (joinCode: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, joinCode: string) =>
      callback(joinCode);
    ipcRenderer.on("app:join-link", listener);
    return () => ipcRenderer.removeListener("app:join-link", listener);
  },
  listMedia: () =>
    ipcRenderer.invoke("media:list") as Promise<
      Array<{
        id: string;
        name: string;
        type: "image" | "video" | "audio";
        url: string;
      }>
    >,
  pickMedia: () =>
    ipcRenderer.invoke("media:pick") as Promise<
      Array<{
        id: string;
        name: string;
        type: "image" | "video" | "audio";
        url: string;
      }>
    >,
  removeMedia: (assetId: string) =>
    ipcRenderer.invoke("media:remove", assetId) as Promise<void>,
  beginRecording: (suggestedName: string) =>
    ipcRenderer.invoke("recording:begin", suggestedName) as Promise<boolean>,
  appendRecording: (chunk: ArrayBuffer) =>
    ipcRenderer.invoke("recording:append", chunk) as Promise<void>,
  finishRecording: () =>
    ipcRenderer.invoke("recording:finish") as Promise<void>,
  cancelRecording: () =>
    ipcRenderer.invoke("recording:cancel") as Promise<void>,
  beginStream: (
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
  ) =>
    ipcRenderer.invoke(
      "stream:begin",
      destinationsOrServer,
      streamKeyOrProfile,
    ) as Promise<boolean>,
  appendStream: (chunk: ArrayBuffer) =>
    ipcRenderer.invoke("stream:append", chunk) as Promise<void>,
  finishStream: () => ipcRenderer.invoke("stream:finish") as Promise<void>,
  cancelStream: () => ipcRenderer.invoke("stream:cancel") as Promise<void>,
  onStreamStatus: (
    callback: (status: {
      state: "target-connecting" | "target-live" | "target-error";
      targetId: string;
      label: string;
      message: string;
    }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      status: {
        state: "target-connecting" | "target-live" | "target-error";
        targetId: string;
        label: string;
        message: string;
      },
    ) => callback(status);
    ipcRenderer.on("stream:status", listener);
    return () => ipcRenderer.removeListener("stream:status", listener);
  },
});
