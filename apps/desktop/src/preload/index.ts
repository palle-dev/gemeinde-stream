import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  version: "0.1.0",
  beginRecording: (suggestedName: string) => ipcRenderer.invoke("recording:begin", suggestedName) as Promise<boolean>,
  appendRecording: (chunk: ArrayBuffer) => ipcRenderer.invoke("recording:append", chunk) as Promise<void>,
  finishRecording: () => ipcRenderer.invoke("recording:finish") as Promise<void>,
  cancelRecording: () => ipcRenderer.invoke("recording:cancel") as Promise<void>,
});
