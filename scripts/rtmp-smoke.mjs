import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      reject(new Error("Freier lokaler Testport konnte nicht ermittelt werden."));
      return;
    }
    server.close((error) => (error ? reject(error) : resolve(address.port)));
  });
});
const target = `rtmp://127.0.0.1:${port}/live/gemeinde-stream-smoke`;
const work = await mkdtemp(join(tmpdir(), "gemeinde-stream-rtmp-"));
const received = join(work, "received.flv");
const children = new Set();

function start(args) {
  const process = spawn(ffmpegPath, args, {
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
  });
  children.add(process);
  process.once("close", () => children.delete(process));
  let stderr = "";
  process.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk.toString("utf8")}`.slice(-12_000);
  });
  return { process, stderr: () => stderr };
}

function waitFor(child, label, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.process.kill();
      reject(new Error(`${label} hat das Zeitlimit überschritten.`));
    }, timeoutMs);
    child.process.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.process.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${label} wurde mit Code ${code} beendet.\n${child.stderr()}`,
          ),
        );
    });
  });
}

try {
  const receiver = start([
    "-hide_banner",
    "-loglevel",
    "warning",
    "-listen",
    "1",
    "-i",
    target,
    "-c",
    "copy",
    "-y",
    received,
  ]);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const sender = start([
    "-hide_banner",
    "-loglevel",
    "warning",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:sample_rate=48000",
    "-t",
    "3",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "zerolatency",
    "-pix_fmt",
    "yuv420p",
    "-g",
    "60",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-f",
    "flv",
    target,
  ]);
  await Promise.all([
    waitFor(sender, "RTMP-Sender"),
    waitFor(receiver, "RTMP-Empfänger"),
  ]);
  const file = await stat(received);
  if (file.size < 100_000)
    throw new Error(`Empfangene Datei ist unerwartet klein (${file.size} B).`);
  const decoder = start([
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    received,
    "-f",
    "null",
    "-",
  ]);
  await waitFor(decoder, "RTMP-Signalprüfung");
  console.log(
    `RTMP-Smoke-Test erfolgreich: Video und Audio empfangen (${file.size} B).`,
  );
} finally {
  for (const child of children)
    if (child.exitCode === null && !child.killed) child.kill();
  await rm(work, { recursive: true, force: true });
}
