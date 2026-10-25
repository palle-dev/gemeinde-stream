import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { open, unlink, type FileHandle } from "node:fs/promises";
import { join } from "node:path";

interface RecordingFile {
  handle: FileHandle;
  path: string;
  writes: Promise<void>;
}

const recordingFiles = new Map<number, RecordingFile>();

async function discardRecording(senderId: number): Promise<void> {
  const recording = recordingFiles.get(senderId);
  if (!recording) return;
  await recording.writes.catch(() => undefined);
  await recording.handle.close().catch(() => undefined);
  await unlink(recording.path).catch(() => undefined);
  recordingFiles.delete(senderId);
}

ipcMain.handle("recording:begin", async (event, suggestedName: string) => {
  if (recordingFiles.has(event.sender.id)) return false;
  const owner = BrowserWindow.fromWebContents(event.sender);
  const options = {
    title: "Programmaufzeichnung speichern",
    defaultPath: suggestedName,
    filters: [{ name: "WebM-Video", extensions: ["webm"] }],
  };
  const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return false;
  const handle = await open(result.filePath, "w");
  recordingFiles.set(event.sender.id, { handle, path: result.filePath, writes: Promise.resolve() });
  return true;
});

ipcMain.handle("recording:append", async (event, chunk: ArrayBuffer) => {
  const recording = recordingFiles.get(event.sender.id);
  if (!recording) throw new Error("Keine aktive Aufnahmedatei");
  recording.writes = recording.writes.then(async () => { await recording.handle.write(Buffer.from(chunk)); });
  await recording.writes;
});

ipcMain.handle("recording:finish", async (event) => {
  const recording = recordingFiles.get(event.sender.id);
  if (!recording) return;
  await recording.writes;
  await recording.handle.close();
  recordingFiles.delete(event.sender.id);
});

ipcMain.handle("recording:cancel", async (event) => {
  await discardRecording(event.sender.id);
});

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1500,
    height: 930,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#080b10",
    title: "Gemeinde Stream",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const senderId = window.webContents.id;
  window.webContents.once("destroyed", () => { void discardRecording(senderId); });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url === "about:blank") {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1920,
          height: 1080,
          useContentSize: true,
          minWidth: 640,
          minHeight: 360,
          backgroundColor: "#000000",
          title: "Gemeinde Stream · Programmausgabe",
          autoHideMenuBar: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
