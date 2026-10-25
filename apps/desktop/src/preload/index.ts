import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  version: ipcRenderer.sendSync("app:version") as string,
  onOpenJoinLink: (callback: (joinCode: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, joinCode: string) => callback(joinCode);
    ipcRenderer.on("app:join-link", listener);
    return () => ipcRenderer.removeListener("app:join-link", listener);
  },
  listMedia: () => ipcRenderer.invoke("media:list") as Promise<Array<{ id: string; name: string; type: "image" | "video" | "audio"; url: string }>>,
  pickMedia: () => ipcRenderer.invoke("media:pick") as Promise<Array<{ id: string; name: string; type: "image" | "video" | "audio"; url: string }>>,
  removeMedia: (assetId: string) => ipcRenderer.invoke("media:remove", assetId) as Promise<void>,
  beginRecording: (suggestedName: string) => ipcRenderer.invoke("recording:begin", suggestedName) as Promise<boolean>,
  appendRecording: (chunk: ArrayBuffer) => ipcRenderer.invoke("recording:append", chunk) as Promise<void>,
  finishRecording: () => ipcRenderer.invoke("recording:finish") as Promise<void>,
  cancelRecording: () => ipcRenderer.invoke("recording:cancel") as Promise<void>,
  beginStream: (destinationsOrServer: Array<{ id: string; label: string; serverUrl: string; streamKey: string }> | string, streamKey?: string) => ipcRenderer.invoke("stream:begin", destinationsOrServer, streamKey) as Promise<boolean>,
  appendStream: (chunk: ArrayBuffer) => ipcRenderer.invoke("stream:append", chunk) as Promise<void>,
  finishStream: () => ipcRenderer.invoke("stream:finish") as Promise<void>,
  cancelStream: () => ipcRenderer.invoke("stream:cancel") as Promise<void>,
  onStreamStatus: (callback: (status: { state: "target-error"; targetId: string; label: string; message: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: { state: "target-error"; targetId: string; label: string; message: string }) => callback(status);
    ipcRenderer.on("stream:status", listener);
    return () => ipcRenderer.removeListener("stream:status", listener);
  },
});
