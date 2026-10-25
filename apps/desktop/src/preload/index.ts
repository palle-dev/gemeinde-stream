import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  version: "0.1.0",
  beginRecording: (suggestedName: string) => ipcRenderer.invoke("recording:begin", suggestedName) as Promise<boolean>,
  appendRecording: (chunk: ArrayBuffer) => ipcRenderer.invoke("recording:append", chunk) as Promise<void>,
  finishRecording: () => ipcRenderer.invoke("recording:finish") as Promise<void>,
  cancelRecording: () => ipcRenderer.invoke("recording:cancel") as Promise<void>,
  beginStream: (serverUrl: string, streamKey: string) => ipcRenderer.invoke("stream:begin", serverUrl, streamKey) as Promise<boolean>,
  appendStream: (chunk: ArrayBuffer) => ipcRenderer.invoke("stream:append", chunk) as Promise<void>,
  finishStream: () => ipcRenderer.invoke("stream:finish") as Promise<void>,
  cancelStream: () => ipcRenderer.invoke("stream:cancel") as Promise<void>,
  onStreamStatus: (callback: (status: { state: "error"; message: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: { state: "error"; message: string }) => callback(status);
    ipcRenderer.on("stream:status", listener);
    return () => ipcRenderer.removeListener("stream:status", listener);
  },
});
