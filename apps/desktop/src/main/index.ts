import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  shell,
} from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  access,
  appendFile,
  mkdir,
  readFile,
  statfs,
  writeFile,
} from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import ffmpegStaticPath from "ffmpeg-static";
import { joinCodeFromArguments, joinCodeFromDeepLink } from "./deepLinks";
import {
  createStoredMediaAsset,
  loadMediaLibrary,
  publicMediaAsset,
  saveMediaLibrary,
  type StoredMediaAsset,
} from "./mediaLibrary";
import { RecordingStore } from "./recordings";
import { redactDiagnosticText } from "./diagnostics";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "gemeinde-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

const recordingFiles = new RecordingStore();
const recordingDialogs = new Set<number>();

interface ActiveStreamTarget {
  id: string;
  label: string;
  process: ChildProcessWithoutNullStreams;
  writes: Promise<void>;
  queuedBytes: number;
  stderr: string;
  stableTimer?: NodeJS.Timeout;
}

interface ActiveStream {
  targets: Map<string, ActiveStreamTarget>;
  stopping: boolean;
}

interface StreamDestination {
  id: string;
  label: string;
  serverUrl: string;
  streamKey: string;
}
interface StreamEncodingProfile {
  width: number;
  height: number;
  frameRate: number;
  videoBitrateKbps: number;
}

const activeStreams = new Map<number, ActiveStream>();
const streamStarts = new Set<number>();
let mainWindow: BrowserWindow | null = null;
let pendingJoinCode = joinCodeFromArguments(process.argv);
let mediaAssets: StoredMediaAsset[] = [];

function diagnosticLogPath(): string {
  return join(app.getPath("logs"), "gemeinde-stream.log");
}

async function logDiagnostic(
  type: string,
  message: string,
  detail = "",
): Promise<void> {
  try {
    await mkdir(app.getPath("logs"), { recursive: true });
    await appendFile(
      diagnosticLogPath(),
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        type: redactDiagnosticText(type).slice(0, 80),
        message: redactDiagnosticText(message).slice(0, 2_000),
        detail: redactDiagnosticText(detail),
      })}\n`,
      "utf8",
    );
  } catch (cause) {
    console.error("Diagnoseprotokoll konnte nicht geschrieben werden.", cause);
  }
}

function assertTrustedSender(senderId: number): void {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    mainWindow.webContents.id !== senderId
  ) {
    throw new Error("Nicht autorisierte Anwendungsanfrage.");
  }
}

function mediaLibraryPath(): string {
  return join(app.getPath("userData"), "media-library.json");
}

async function persistMediaLibrary(): Promise<void> {
  await saveMediaLibrary(mediaLibraryPath(), mediaAssets);
}

function deliverJoinCode(code: string | null): void {
  if (!code) return;
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !mainWindow.webContents.isLoading()
  ) {
    mainWindow.webContents.send("app:join-link", code);
  } else {
    pendingJoinCode = code;
  }
}

function registerProtocol(): void {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient("gemeinde-stream", process.execPath, [
      process.argv[1],
    ]);
  } else {
    app.setAsDefaultProtocolClient("gemeinde-stream");
  }
}

ipcMain.on("app:version", (event) => {
  assertTrustedSender(event.sender.id);
  event.returnValue = app.getVersion();
});

ipcMain.handle(
  "diagnostics:report",
  async (event, type: string, message: string, detail?: string) => {
    assertTrustedSender(event.sender.id);
    await logDiagnostic(type, message, detail);
  },
);

ipcMain.handle("diagnostics:export", async (event) => {
  assertTrustedSender(event.sender.id);
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = owner
    ? await dialog.showSaveDialog(owner, {
        title: "Supportbericht speichern",
        defaultPath: `gemeinde-stream-support-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "JSON-Bericht", extensions: ["json"] }],
      })
    : await dialog.showSaveDialog({
        title: "Supportbericht speichern",
        defaultPath: `gemeinde-stream-support-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "JSON-Bericht", extensions: ["json"] }],
      });
  if (result.canceled || !result.filePath) return false;
  let logs = "";
  try {
    logs = await readFile(diagnosticLogPath(), "utf8");
    logs = logs.slice(-200_000);
  } catch {
    logs = "Noch keine Diagnoseeinträge vorhanden.";
  }
  await writeFile(
    result.filePath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        application: { name: app.getName(), version: app.getVersion() },
        runtime: {
          platform: process.platform,
          architecture: process.arch,
          osVersion: process.getSystemVersion(),
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          node: process.versions.node,
          cpuCount: cpus().length,
          memoryBytes: totalmem(),
        },
        logs,
      },
      null,
      2,
    ),
    "utf8",
  );
  return true;
});

ipcMain.handle("media:list", (event) => {
  assertTrustedSender(event.sender.id);
  return mediaAssets.map(publicMediaAsset);
});

ipcMain.handle("system:preflight", async (event) => {
  assertTrustedSender(event.sender.id);
  const executable = resolveFfmpegPath();
  let ffmpegAvailable = false;
  try {
    await access(executable, fsConstants.X_OK);
    ffmpegAvailable = true;
  } catch {
    /* Reported to the renderer. */
  }
  let freeDiskBytes = 0;
  try {
    const disk = await statfs(app.getPath("videos"));
    freeDiskBytes = Number(disk.bavail) * Number(disk.bsize);
  } catch {
    /* Unknown storage remains zero and is shown as a warning. */
  }
  return {
    ffmpegAvailable,
    freeDiskBytes,
    logicalCpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
    platform: process.platform,
  };
});

ipcMain.handle("media:pick", async (event) => {
  assertTrustedSender(event.sender.id);
  const owner = BrowserWindow.fromWebContents(event.sender);
  const options = {
    title: "Medien zur Produktion hinzufügen",
    properties: ["openFile", "multiSelections"] as Array<
      "openFile" | "multiSelections"
    >,
    filters: [
      {
        name: "Bilder, Videos und Audio",
        extensions: [
          "jpg",
          "jpeg",
          "png",
          "webp",
          "gif",
          "bmp",
          "mp4",
          "webm",
          "mov",
          "mkv",
          "m4v",
          "mp3",
          "wav",
          "m4a",
          "aac",
          "ogg",
          "flac",
        ],
      },
    ],
  };
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled) return [];
  const existingPaths = new Set(
    mediaAssets.map((asset) => asset.path.toLowerCase()),
  );
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

ipcMain.handle("media:remove", async (event, assetId: string) => {
  assertTrustedSender(event.sender.id);
  const before = mediaAssets.length;
  mediaAssets = mediaAssets.filter((asset) => asset.id !== assetId);
  if (mediaAssets.length !== before) await persistMediaLibrary();
});

export function resolveFfmpegPath(
  configuredPath = process.env.GEMEINDE_STREAM_FFMPEG,
  packaged = app.isPackaged,
): string {
  if (configuredPath?.trim()) return configuredPath.trim();
  if (!ffmpegStaticPath) return "ffmpeg";
  return packaged
    ? ffmpegStaticPath.replace("app.asar", "app.asar.unpacked")
    : ffmpegStaticPath;
}

function streamTarget(serverUrl: string, streamKey: string): string {
  const parsed = new URL(serverUrl.trim());
  if (parsed.protocol !== "rtmp:" && parsed.protocol !== "rtmps:")
    throw new Error("Nur RTMP- und RTMPS-Adressen werden unterstützt.");
  if (!streamKey.trim())
    throw new Error("Bitte einen Stream-Schlüssel eingeben.");
  return `${serverUrl.trim().replace(/\/+$/, "")}/${streamKey.trim().replace(/^\/+/, "")}`;
}

async function stopStream(senderId: number, force = false): Promise<void> {
  const active = activeStreams.get(senderId);
  if (!active) return;
  active.stopping = true;
  await Promise.all(
    [...active.targets.values()].map((target) =>
      target.writes.catch(() => undefined),
    ),
  );
  for (const target of active.targets.values()) {
    if (target.stableTimer) clearTimeout(target.stableTimer);
    force ? target.process.kill() : target.process.stdin.end();
  }
  await Promise.all(
    [...active.targets.values()].map(
      (target) =>
        new Promise<void>((resolve) => {
          if (target.process.exitCode !== null) return resolve();
          const timeout = setTimeout(() => {
            target.process.kill();
            resolve();
          }, 5_000);
          target.process.once("close", () => {
            clearTimeout(timeout);
            resolve();
          });
        }),
    ),
  );
  activeStreams.delete(senderId);
}

ipcMain.handle("recording:begin", async (event, suggestedName: string) => {
  assertTrustedSender(event.sender.id);
  const senderId = event.sender.id;
  if (recordingFiles.has(senderId) || recordingDialogs.has(senderId))
    return false;
  recordingDialogs.add(senderId);
  try {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: "Programmaufzeichnung speichern",
      defaultPath: suggestedName,
      filters: [{ name: "WebM-Video", extensions: ["webm"] }],
    };
    const result = owner
      ? await dialog.showSaveDialog(owner, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return false;
    if (event.sender.isDestroyed()) return false;
    await recordingFiles.begin(senderId, result.filePath);
    if (event.sender.isDestroyed()) {
      await recordingFiles.preserve(senderId);
      return false;
    }
    return true;
  } catch (cause) {
    await logDiagnostic(
      "recording-begin-error",
      cause instanceof Error ? cause.message : String(cause),
      cause instanceof Error ? cause.stack : "",
    );
    throw cause;
  } finally {
    recordingDialogs.delete(senderId);
  }
});

ipcMain.handle("recording:append", async (event, chunk: ArrayBuffer) => {
  assertTrustedSender(event.sender.id);
  try {
    await recordingFiles.append(event.sender.id, chunk);
  } catch (cause) {
    await logDiagnostic(
      "recording-write-error",
      cause instanceof Error ? cause.message : String(cause),
    );
    throw cause;
  }
});

ipcMain.handle("recording:finish", async (event) => {
  assertTrustedSender(event.sender.id);
  try {
    await recordingFiles.finish(event.sender.id);
  } catch (cause) {
    await logDiagnostic(
      "recording-finish-error",
      cause instanceof Error ? cause.message : String(cause),
    );
    throw cause;
  }
});

ipcMain.handle("recording:cancel", async (event) => {
  assertTrustedSender(event.sender.id);
  await recordingFiles.preserve(event.sender.id);
});

ipcMain.handle(
  "stream:begin",
  async (
    event,
    destinationsOrServer: StreamDestination[] | string,
    legacyStreamKeyOrProfile?: string | StreamEncodingProfile,
  ) => {
    assertTrustedSender(event.sender.id);
    if (activeStreams.has(event.sender.id) || streamStarts.has(event.sender.id))
      throw new Error("Es läuft bereits eine Programmausspielung.");
    streamStarts.add(event.sender.id);
    try {
      const destinations =
        typeof destinationsOrServer === "string"
          ? [
              {
                id: "legacy",
                label: "Livestream",
                serverUrl: destinationsOrServer,
                streamKey:
                  typeof legacyStreamKeyOrProfile === "string"
                    ? legacyStreamKeyOrProfile
                    : "",
              },
            ]
          : destinationsOrServer;
      const requestedProfile =
        typeof legacyStreamKeyOrProfile === "object" && legacyStreamKeyOrProfile
          ? legacyStreamKeyOrProfile
          : {
              width: 1920,
              height: 1080,
              frameRate: 30,
              videoBitrateKbps: 6000,
            };
      const allowedProfiles = [
        "1280x720@30:3500",
        "1920x1080@30:6000",
        "1920x1080@60:8000",
      ];
      const profileKey = `${requestedProfile.width}x${requestedProfile.height}@${requestedProfile.frameRate}:${requestedProfile.videoBitrateKbps}`;
      if (!allowedProfiles.includes(profileKey))
        throw new Error("Das gewählte Produktionsprofil ist ungültig.");
      if (
        !Array.isArray(destinations) ||
        destinations.length < 1 ||
        destinations.length > 5
      )
        throw new Error("Wählen Sie zwischen einem und fünf Streaming-Zielen.");
      const normalized = destinations.map((destination) => ({
        ...destination,
        id: String(destination.id).slice(0, 100),
        label: String(destination.label).trim().slice(0, 100),
        target: streamTarget(destination.serverUrl, destination.streamKey),
      }));
      if (
        normalized.some(
          (destination) => !destination.id || !destination.label,
        ) ||
        new Set(normalized.map((destination) => destination.id)).size !==
          normalized.length
      )
        throw new Error("Streaming-Ziele sind ungültig oder doppelt.");
      const executable = resolveFfmpegPath();
      const targets = new Map<string, ActiveStreamTarget>();
      try {
        for (const destination of normalized) {
          const bitrate = `${requestedProfile.videoBitrateKbps}k`;
          const child = spawn(
            executable,
            [
              "-hide_banner",
              "-loglevel",
              "warning",
              "-f",
              "webm",
              "-i",
              "pipe:0",
              "-c:v",
              "libx264",
              "-preset",
              "veryfast",
              "-tune",
              "zerolatency",
              "-profile:v",
              "high",
              "-level",
              "4.2",
              "-pix_fmt",
              "yuv420p",
              "-vf",
              `scale=${requestedProfile.width}:${requestedProfile.height}`,
              "-r",
              String(requestedProfile.frameRate),
              "-g",
              String(requestedProfile.frameRate * 2),
              "-b:v",
              bitrate,
              "-maxrate",
              bitrate,
              "-bufsize",
              `${requestedProfile.videoBitrateKbps * 2}k`,
              "-c:a",
              "aac",
              "-b:a",
              "192k",
              "-ar",
              "48000",
              "-f",
              "flv",
              destination.target,
            ],
            { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
          );
          await new Promise<void>((resolve, reject) => {
            child.once("spawn", resolve);
            child.once("error", reject);
          });
          child.stdout.resume();
          const target: ActiveStreamTarget = {
            id: destination.id,
            label: destination.label,
            process: child,
            writes: Promise.resolve(),
            queuedBytes: 0,
            stderr: "",
          };
          child.stderr.on("data", (data: Buffer) => {
            target.stderr = `${target.stderr}${data.toString("utf8")}`.slice(
              -4_000,
            );
          });
          targets.set(destination.id, target);
        }
      } catch (cause) {
        targets.forEach((target) => target.process.kill());
        if ((cause as NodeJS.ErrnoException).code === "ENOENT")
          throw new Error(
            "FFmpeg wurde nicht gefunden. Installieren Sie FFmpeg oder setzen Sie GEMEINDE_STREAM_FFMPEG auf den vollständigen Pfad.",
          );
        throw new Error(
          "Mindestens eine Streaming-Engine konnte nicht gestartet werden.",
        );
      }
      if (event.sender.isDestroyed()) {
        targets.forEach((target) => target.process.kill());
        return false;
      }
      const active: ActiveStream = { targets, stopping: false };
      activeStreams.set(event.sender.id, active);
      for (const target of targets.values()) {
        event.sender.send("stream:status", {
          state: "target-connecting",
          targetId: target.id,
          label: target.label,
          message: `${target.label} wird verbunden …`,
        });
        target.stableTimer = setTimeout(() => {
          if (
            !target.process.killed &&
            target.process.exitCode === null &&
            !event.sender.isDestroyed()
          )
            event.sender.send("stream:status", {
              state: "target-live",
              targetId: target.id,
              label: target.label,
              message: `${target.label} ist verbunden.`,
            });
        }, 3_000);
        target.process.once("close", (code) => {
          if (target.stableTimer) clearTimeout(target.stableTimer);
          const current = activeStreams.get(event.sender.id);
          if (
            !current ||
            current.targets.get(target.id)?.process !== target.process
          )
            return;
          current.targets.delete(target.id);
          if (current.targets.size === 0) activeStreams.delete(event.sender.id);
          if (!active.stopping && !event.sender.isDestroyed()) {
            void logDiagnostic(
              "stream-target-error",
              `${target.label} wurde unerwartet beendet (Code ${code ?? "unbekannt"}).`,
              target.stderr,
            );
            const detail = /unauthori[sz]ed|forbidden|authentication/i.test(
              target.stderr,
            )
              ? "Zugang wurde vom Streamingdienst abgelehnt."
              : /timed out|timeout/i.test(target.stderr)
                ? "Das Streamingziel antwortet nicht."
                : /refused|unreachable|resolve/i.test(target.stderr)
                  ? "Das Streamingziel ist nicht erreichbar."
                  : "Die Streaming-Verbindung wurde beendet.";
            event.sender.send("stream:status", {
              state: "target-error",
              targetId: target.id,
              label: target.label,
              message:
                code === 0
                  ? `${target.label} wurde beendet.`
                  : `${target.label}: ${detail}`,
            });
          }
        });
      }
      return true;
    } catch (cause) {
      await logDiagnostic(
        "stream-start-error",
        cause instanceof Error ? cause.message : String(cause),
        cause instanceof Error ? cause.stack : "",
      );
      throw cause;
    } finally {
      streamStarts.delete(event.sender.id);
    }
  },
);

ipcMain.handle("stream:append", async (event, chunk: ArrayBuffer) => {
  assertTrustedSender(event.sender.id);
  const active = activeStreams.get(event.sender.id);
  if (!active || active.stopping || active.targets.size === 0)
    throw new Error("Keine aktive Streaming-Verbindung.");
  const buffer = Buffer.from(chunk);
  const maxQueuedBytes = 32 * 1024 * 1024;
  for (const target of active.targets.values()) {
    if (target.queuedBytes + buffer.length > maxQueuedBytes) {
      if (!event.sender.isDestroyed())
        event.sender.send("stream:status", {
          state: "target-error",
          targetId: target.id,
          label: target.label,
          message: `${target.label}: Ausspielung ist zu langsam und wurde zum Schutz der Regie getrennt.`,
        });
      target.process.kill();
      continue;
    }
    target.queuedBytes += buffer.length;
    target.writes = target.writes
      .then(
        () =>
          new Promise<void>((resolve, reject) => {
            if (target.process.stdin.destroyed)
              return reject(
                new Error(`${target.label} ist nicht mehr verbunden.`),
              );
            target.process.stdin.write(buffer, (error) =>
              error ? reject(error) : resolve(),
            );
          }),
      )
      .catch(() => {
        if (!target.process.killed) target.process.kill();
      })
      .finally(() => {
        target.queuedBytes = Math.max(0, target.queuedBytes - buffer.length);
      });
  }
});

ipcMain.handle("stream:finish", async (event) => {
  assertTrustedSender(event.sender.id);
  await stopStream(event.sender.id);
});

ipcMain.handle("stream:cancel", async (event) => {
  assertTrustedSender(event.sender.id);
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
  let closeNoticeOpen = false;
  window.on("close", (event) => {
    if (
      !recordingFiles.has(senderId) &&
      !recordingDialogs.has(senderId) &&
      !activeStreams.has(senderId) &&
      !streamStarts.has(senderId)
    )
      return;
    event.preventDefault();
    if (closeNoticeOpen) return;
    closeNoticeOpen = true;
    void dialog
      .showMessageBox(window, {
        type: "warning",
        title: "Produktion läuft",
        message: "Aufnahme oder Livestream ist noch aktiv.",
        detail:
          "Stoppen Sie die Aufnahme und die Streaming-Ziele in der Regie und warten Sie, bis die Aufnahme gespeichert ist. Danach können Sie das Fenster schließen.",
        buttons: ["Zurück zur Produktion"],
        defaultId: 0,
      })
      .finally(() => {
        closeNoticeOpen = false;
      });
  });
  const preserveProduction = () => {
    void recordingFiles
      .preserve(senderId)
      .catch((cause) => {
        console.error(
          "Aufnahmedatei konnte nicht vollständig abgeschlossen werden; vorhandene Daten bleiben erhalten.",
        );
        void logDiagnostic(
          "recording-preserve-error",
          cause instanceof Error ? cause.message : String(cause),
        );
      });
    void stopStream(senderId, true).catch((cause) => {
      console.error("Streaming-Prozess konnte nicht beendet werden.");
      void logDiagnostic(
        "stream-stop-error",
        cause instanceof Error ? cause.message : String(cause),
      );
    });
  };
  window.webContents.on("render-process-gone", (_event, details) => {
    void logDiagnostic(
      "renderer-process-gone",
      `Oberflächenprozess beendet: ${details.reason}`,
      `exitCode=${details.exitCode}`,
    );
    preserveProduction();
  });
  window.webContents.once("destroyed", preserveProduction);
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

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
    try {
      const external = new URL(url);
      if (
        external.protocol === "https:" ||
        external.protocol === "http:" ||
        external.protocol === "mailto:"
      )
        void shell.openExternal(url);
    } catch {
      /* Invalid links stay blocked. */
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const current = window.webContents.getURL();
    if (url !== current) event.preventDefault();
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

  app
    .whenReady()
    .then(async () => {
      registerProtocol();
      mediaAssets = await loadMediaLibrary(mediaLibraryPath());
      await protocol.handle("gemeinde-media", (request) => {
        const id = new URL(request.url).hostname;
        const asset = mediaAssets.find((candidate) => candidate.id === id);
        if (!asset)
          return new Response("Medium nicht gefunden", { status: 404 });
        return net.fetch(pathToFileURL(asset.path).toString(), {
          headers: request.headers,
        });
      });
      createWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch(async (cause) => {
      const message = cause instanceof Error ? cause.message : String(cause);
      await logDiagnostic(
        "application-start-error",
        message,
        cause instanceof Error ? cause.stack : "",
      );
      await dialog.showMessageBox({
        type: "error",
        title: "Gemeinde Stream konnte nicht gestartet werden",
        message: "Die Anwendung konnte nicht vollständig initialisiert werden.",
        detail: `${message}\n\nBitte starten Sie die Anwendung erneut. Falls der Fehler bleibt, wenden Sie sich an den Support.`,
      });
      app.quit();
    });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
