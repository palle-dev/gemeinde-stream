import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { open, unlink, type FileHandle } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import ffmpegStaticPath from "ffmpeg-static";
import { joinCodeFromArguments, joinCodeFromDeepLink } from "./deepLinks";
import { createStoredMediaAsset, loadMediaLibrary, publicMediaAsset, saveMediaLibrary, type StoredMediaAsset } from "./mediaLibrary";

protocol.registerSchemesAsPrivileged([{ scheme: "gemeinde-media", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

interface RecordingFile {
  handle: FileHandle;
  path: string;
  writes: Promise<void>;
}

const recordingFiles = new Map<number, RecordingFile>();

interface ActiveStream {
  process: ChildProcessWithoutNullStreams;
  writes: Promise<void>;
  stopping: boolean;
}

const activeStreams = new Map<number, ActiveStream>();
let mainWindow: BrowserWindow | null = null;
let pendingJoinCode = joinCodeFromArguments(process.argv);
let mediaAssets: StoredMediaAsset[] = [];

function mediaLibraryPath(): string { return join(app.getPath("userData"), "media-library.json"); }

async function persistMediaLibrary(): Promise<void> {
  await saveMediaLibrary(mediaLibraryPath(), mediaAssets);
}

function deliverJoinCode(code: string | null): void {
  if (!code) return;
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send("app:join-link", code);
  } else {
    pendingJoinCode = code;
  }
}

function registerProtocol(): void {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient("gemeinde-stream", process.execPath, [process.argv[1]]);
  } else {
    app.setAsDefaultProtocolClient("gemeinde-stream");
  }
}

ipcMain.on("app:version", (event) => {
  event.returnValue = app.getVersion();
});

ipcMain.handle("media:list", () => mediaAssets.map(publicMediaAsset));

ipcMain.handle("media:pick", async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const options = {
    title: "Medien zur Produktion hinzufügen",
    properties: ["openFile", "multiSelections"] as Array<"openFile" | "multiSelections">,
    filters: [
      { name: "Bilder, Videos und Audio", extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp", "mp4", "webm", "mov", "mkv", "m4v", "mp3", "wav", "m4a", "aac", "ogg", "flac"] },
    ],
  };
  const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
  if (result.canceled) return [];
  const existingPaths = new Set(mediaAssets.map((asset) => asset.path.toLowerCase()));
  const added = result.filePaths.flatMap((path) => {
    if (existingPaths.has(path.toLowerCase())) return [];
    const asset = createStoredMediaAsset(path, basename(path));
    if (!asset) return [];
    existingPaths.add(path.toLowerCase());
    mediaAssets.push(asset);
    return [asset];
  });
  if (added.length > 0) await persistMediaLibrary();
  return added.map(publicMediaAsset);
});

ipcMain.handle("media:remove", async (_event, assetId: string) => {
  const before = mediaAssets.length;
  mediaAssets = mediaAssets.filter((asset) => asset.id !== assetId);
  if (mediaAssets.length !== before) await persistMediaLibrary();
});

export function resolveFfmpegPath(configuredPath = process.env.GEMEINDE_STREAM_FFMPEG, packaged = app.isPackaged): string {
  if (configuredPath?.trim()) return configuredPath.trim();
  if (!ffmpegStaticPath) return "ffmpeg";
  return packaged ? ffmpegStaticPath.replace("app.asar", "app.asar.unpacked") : ffmpegStaticPath;
}

function streamTarget(serverUrl: string, streamKey: string): string {
  const parsed = new URL(serverUrl.trim());
  if (parsed.protocol !== "rtmp:" && parsed.protocol !== "rtmps:") throw new Error("Nur RTMP- und RTMPS-Adressen werden unterstützt.");
  if (!streamKey.trim()) throw new Error("Bitte einen Stream-Schlüssel eingeben.");
  return `${serverUrl.trim().replace(/\/+$/, "")}/${streamKey.trim().replace(/^\/+/, "")}`;
}

async function stopStream(senderId: number, force = false): Promise<void> {
  const active = activeStreams.get(senderId);
  if (!active) return;
  active.stopping = true;
  await active.writes.catch(() => undefined);
  if (force) active.process.kill();
  else active.process.stdin.end();
  await new Promise<void>((resolve) => {
    if (active.process.exitCode !== null) return resolve();
    const timeout = setTimeout(() => { active.process.kill(); resolve(); }, 5_000);
    active.process.once("close", () => { clearTimeout(timeout); resolve(); });
  });
  activeStreams.delete(senderId);
}

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

ipcMain.handle("stream:begin", async (event, serverUrl: string, streamKey: string) => {
  if (activeStreams.has(event.sender.id)) throw new Error("Es läuft bereits eine Programmausspielung.");
  const target = streamTarget(serverUrl, streamKey);
  const executable = resolveFfmpegPath();
  const child = spawn(executable, [
    "-hide_banner", "-loglevel", "warning", "-f", "webm", "-i", "pipe:0",
    "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
    "-profile:v", "high", "-level", "4.2", "-pix_fmt", "yuv420p",
    "-r", "60", "-g", "120", "-b:v", "8000k", "-maxrate", "8000k", "-bufsize", "16000k",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-f", "flv", target,
  ], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });

  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", (error) => reject(error));
  }).catch((cause) => {
    child.kill();
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("FFmpeg wurde nicht gefunden. Installieren Sie FFmpeg oder setzen Sie GEMEINDE_STREAM_FFMPEG auf den vollständigen Pfad.");
    }
    throw new Error("Die Streaming-Engine konnte nicht gestartet werden.");
  });

  const active: ActiveStream = { process: child, writes: Promise.resolve(), stopping: false };
  activeStreams.set(event.sender.id, active);
  child.stdout.resume();
  child.stderr.resume();
  child.once("close", (code) => {
    if (activeStreams.get(event.sender.id)?.process !== child) return;
    activeStreams.delete(event.sender.id);
    if (!active.stopping && !event.sender.isDestroyed()) event.sender.send("stream:status", { state: "error", message: code === 0 ? "Die Streaming-Verbindung wurde beendet." : "Der Streaming-Server hat die Verbindung beendet." });
  });
  return true;
});

ipcMain.handle("stream:append", async (event, chunk: ArrayBuffer) => {
  const active = activeStreams.get(event.sender.id);
  if (!active || active.stopping || active.process.stdin.destroyed) throw new Error("Keine aktive Streaming-Verbindung.");
  active.writes = active.writes.then(() => new Promise<void>((resolve, reject) => {
    active.process.stdin.write(Buffer.from(chunk), (error) => error ? reject(new Error("Streaming-Daten konnten nicht gesendet werden.")) : resolve());
  }));
  await active.writes;
});

ipcMain.handle("stream:finish", async (event) => {
  await stopStream(event.sender.id);
});

ipcMain.handle("stream:cancel", async (event) => {
  await stopStream(event.sender.id, true);
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
  mainWindow = window;

  window.webContents.once("did-finish-load", () => {
    if (pendingJoinCode) {
      window.webContents.send("app:join-link", pendingJoinCode);
      pendingJoinCode = null;
    }
  });

  const senderId = window.webContents.id;
  window.webContents.once("destroyed", () => { void discardRecording(senderId); void stopStream(senderId, true); });

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

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    deliverJoinCode(joinCodeFromArguments(argv));
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    deliverJoinCode(joinCodeFromDeepLink(url));
  });

  app.whenReady().then(async () => {
    registerProtocol();
    mediaAssets = await loadMediaLibrary(mediaLibraryPath());
    await protocol.handle("gemeinde-media", (request) => {
      const id = new URL(request.url).hostname;
      const asset = mediaAssets.find((candidate) => candidate.id === id);
      if (!asset) return new Response("Medium nicht gefunden", { status: 404 });
      return net.fetch(pathToFileURL(asset.path).toString(), { headers: request.headers });
    });
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
